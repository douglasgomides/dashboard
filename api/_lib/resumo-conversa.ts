/**
 * Resumo de UMA conversa do WhatsApp por IA, sob demanda (botão "Resumir com IA" em Conversas).
 * Chamado por api/sync/manual.ts (alvo "resumo_conversa"), que já checa admin/membro: o plano da
 * Vercel aceita no máximo 12 funções, então isto não ganhou um endpoint próprio.
 *
 * - Quem pode: admin ou membro do cliente (mesma regra de ler_mensagens).
 * - O que vai para a IA: só o texto da conversa, com telefone, e-mail e CPF mascarados; o nome do
 *   paciente não vai. Cada geração fica registrada em acessos_conversas (acao = 'resumo_ia').
 * - Usa a mesma chave do servidor da classificação de conteúdo: OPENAI_API_KEY ou ANTHROPIC_API_KEY.
 * - O resultado fica em conversas_resumos com a data da última mensagem lida; mensagem nova depois
 *   disso marca o resumo como desatualizado na tela.
 * - A IA não diagnostica nem inventa: o prompt manda dizer "não dá para saber" quando faltar dado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const MODELO_OPENAI = process.env.RESUMO_MODELO || process.env.CLASSIFICADOR_MODELO || "gpt-4o-mini";
const MODELO_CLAUDE = process.env.RESUMO_MODELO || "claude-haiku-4-5-20251001";
const MAX_MSGS = 300;

const SISTEMA = `Você é auditor comercial de clínicas médicas no Brasil. Lê a conversa de WhatsApp entre um paciente (ou interessado) e a equipe da clínica e devolve uma leitura objetiva para o dono da clínica e o time de marketing, para AUMENTAR A CONVERSÃO.
Regras: português do Brasil, frases curtas, sem jargão. Não invente: se algo não aparece na conversa, use null, false ou lista vazia. Não faça diagnóstico nem opine sobre conduta médica. Mensagens da clínica que começam com "*Nome:*" são de uma atendente (o nome é a assinatura); as sem assinatura repetidas são do robô e não contam como atendimento humano. Os horários estão entre colchetes: use-os para julgar demora.
Responda SOMENTE um JSON:
{"motivo": "por que a pessoa entrou em contato, em até 12 palavras",
 "resumo": "o que aconteceu na conversa, 2 a 4 frases",
 "comercial": true | false,
 "interesse": "procedimento, consulta ou assunto de interesse, ou null",
 "origem": "anuncio" | "instagram" | "indicacao" | "paciente_antigo" | "desconhecida",
 "etapa": "so_robo" | "sem_resposta_paciente" | "engajou" | "qualificacao" | "preco_apresentado" | "agendamento_em_curso" | "agendou" | "nao_e_paciente",
 "preco_pedido": true | false,
 "preco_apresentado": true | false,
 "objecoes": ["objeções que o PACIENTE declarou, só destas: preco, convenio, distancia, adiamento, agenda, medo, desconfianca, outro"],
 "falhas": ["falhas da CLÍNICA, só destas: sem_resposta, demora, desvio_preco, preco_sem_ancoragem, sem_cta, sem_follow_up, nome_errado, informacao_inconsistente, pressao, so_emoji, desconto_reativo, excesso_audio"],
 "situacao": "agendou" | "em_negociacao" | "aguardando_clinica" | "aguardando_paciente" | "desistiu" | "so_informacao" | "outro",
 "recuperavel": true | false,
 "atendente": "nome da atendente que mais respondeu (da assinatura) ou null",
 "atendimento": {"nota": "bom" | "regular" | "ruim", "nota_0a10": 0-10, "pontos_fortes": ["..."], "pontos_a_melhorar": ["..."]},
 "evidencia": "um trecho curto e literal da conversa que sustenta a principal falha ou acerto (sem telefone/nome do paciente)",
 "como_deveria": "o que a atendente deveria ter respondido nesse ponto, em 1 a 2 frases prontas para usar",
 "proximo_passo": "UMA ação comercial em 1 frase, só de um destes tipos: responder o paciente, fazer follow-up, oferecer horário e agendar, ou confirmar a consulta. Se comercial=false, null",
 "alerta": "se o paciente relatou algo urgente ou grave de saúde, descreva em 1 frase; senão null"}
Critérios: respondeu o que foi perguntado? deu preço quando pedido, com ancoragem de valor (resultado, diferencial) e chamada para agendar? conduziu para data e hora concretas? voltou a falar quando o paciente sumiu (follow-up)? demorou mais de 1 hora em horário comercial? "recuperavel" = demonstrou interesse real (perguntou preço, procedimento ou disse que quer) e não agendou. "comercial" = false quando a conversa é administrativa e não é venda de consulta ou procedimento (nota fiscal, boleto, recibo, reembolso, documentos, resultado de exame já feito, fornecedor, assunto interno); nesse caso "recuperavel" = false e "proximo_passo" = null.`;

function mascarar(t: string): string {
  return t
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, "[telefone]");
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function chamarIA(transcricao: string): Promise<{ json: unknown; modelo: string }> {
  const chaveOpenAI = process.env.OPENAI_API_KEY;
  const chaveClaude = process.env.ANTHROPIC_API_KEY;
  if (chaveOpenAI) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${chaveOpenAI}` },
      signal: AbortSignal.timeout(50_000),
      body: JSON.stringify({
        model: MODELO_OPENAI,
        response_format: { type: "json_object" },
        max_completion_tokens: 1200,
        messages: [
          { role: "system", content: SISTEMA },
          { role: "user", content: transcricao },
        ],
      }),
    });
    if (!r.ok) throw new Error(`OpenAI respondeu ${r.status}`);
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return { json: JSON.parse(j.choices?.[0]?.message?.content ?? "{}"), modelo: MODELO_OPENAI };
  }
  if (chaveClaude) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": chaveClaude, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(50_000),
      body: JSON.stringify({ model: MODELO_CLAUDE, max_tokens: 1200, system: SISTEMA, messages: [{ role: "user", content: transcricao }] }),
    });
    if (!r.ok) throw new Error(`Anthropic respondeu ${r.status}`);
    const j = (await r.json()) as { content?: { text?: string }[] };
    const texto = (j.content ?? []).map((b) => b.text ?? "").join("");
    const ini = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    return { json: JSON.parse(ini >= 0 && fim > ini ? texto.slice(ini, fim + 1) : "{}"), modelo: MODELO_CLAUDE };
  }
  throw new Error("Servidor sem OPENAI_API_KEY nem ANTHROPIC_API_KEY: resumo por IA desligado.");
}

export async function resumirConversa(
  admin: SupabaseClient<any, any, any>,
  clientId: string,
  conversaId: string,
  userId: string | null,
): Promise<{ resumo: unknown; modelo: string; ate_msg_em: string }> {
  const { data: conv } = await admin.from("conversas").select("id, client_id, provider").eq("id", conversaId).maybeSingle();
  const c = conv as { id: string; client_id: string; provider: string | null } | null;
  if (!c || c.client_id !== clientId) throw new Error("Conversa não encontrada para este cliente");
  // Kommo: só o lado do paciente tem texto (a API não entrega o da clínica). A IA julgaria o atendimento sem vê-lo.
  if (c.provider === "kommo") throw new Error("Conversa do Kommo: o Kommo não entrega o texto da clínica, então a leitura por IA não se aplica");
  const { data: msgs, error } = await admin
    .from("mensagens")
    .select("direcao, autor, texto, tipo, enviada_em")
    .eq("conversa_id", conversaId)
    .order("enviada_em", { ascending: false })
    .limit(MAX_MSGS);
  if (error) throw new Error(error.message);
  const lista = ((msgs ?? []) as { direcao: string; autor: string | null; texto: string | null; tipo: string | null; enviada_em: string }[]).reverse();
  if (lista.length === 0) throw new Error("Conversa sem mensagens guardadas");
  const linhas = lista.map((m) => {
    const quemFala = m.direcao === "entrada" ? "Paciente" : m.direcao === "saida" ? "Clínica" : "Sistema";
    const corpo = m.texto ? mascarar(m.texto) : `(${(m.tipo ?? "mídia").toLowerCase()})`;
    return `[${hora(m.enviada_em)}] ${quemFala}: ${corpo}`;
  });
  const transcricao = `Conversa (${lista.length} mensagens, da mais antiga para a mais recente${lista.length === MAX_MSGS ? `; só as ${MAX_MSGS} últimas` : ""}):\n${linhas.join("\n")}`.slice(0, 60_000);
  const { json, modelo } = await chamarIA(transcricao);
  const ate = lista[lista.length - 1].enviada_em;
  const { error: erroGrava } = await admin
    .from("conversas_resumos")
    .upsert({ conversa_id: conversaId, client_id: clientId, resumo: json, modelo, ate_msg_em: ate, gerado_em: new Date().toISOString(), gerado_por: userId }, { onConflict: "conversa_id" });
  if (erroGrava) throw new Error(erroGrava.message);
  await admin.from("acessos_conversas").insert({ user_id: userId, client_id: clientId, conversa_id: conversaId, acao: userId ? "resumo_ia" : "resumo_ia_automatico" });
  return { resumo: json, modelo, ate_msg_em: ate };
}

/**
 * Lote diário: lê com IA as conversas dos últimos `dias` que ainda não têm leitura ou que receberam
 * mensagem depois dela. Mais recentes primeiro, até `limite` conversas ou o fim do `orcamentoMs`.
 * Chamado pelo sync do WhatsApp (api/sync/wts.ts) — automático, sem botão.
 */
export async function analisarConversasPendentes(
  admin: SupabaseClient<any, any, any>,
  clientId: string,
  opts: { limite?: number; orcamentoMs?: number; dias?: number } = {},
): Promise<{ analisadas: number; pendentes: number; erros: string[] }> {
  const inicio = Date.now();
  const limite = opts.limite ?? 40;
  const orcamento = opts.orcamentoMs ?? 60_000;
  const desde = new Date(Date.now() - (opts.dias ?? 30) * 86400000).toISOString();
  const { data: convs, error } = await admin
    .from("conversas")
    .select("id, ultima_msg_em")
    .eq("client_id", clientId)
    .neq("provider", "kommo") // só o lado do paciente tem texto: ver resumirConversa
    .gte("ultima_msg_em", desde)
    .order("ultima_msg_em", { ascending: false })
    .limit(400);
  if (error) return { analisadas: 0, pendentes: 0, erros: [error.message] };
  const ids = (convs ?? []).map((c: { id: string }) => c.id);
  const feitos = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin.from("conversas_resumos").select("conversa_id, ate_msg_em").in("conversa_id", ids.slice(i, i + 100));
    for (const r of (data ?? []) as { conversa_id: string; ate_msg_em: string | null }[]) feitos.set(r.conversa_id, r.ate_msg_em);
  }
  const pendentes = (convs ?? []).filter((c: { id: string; ultima_msg_em: string | null }) => {
    const ate = feitos.get(c.id);
    return ate === undefined || (ate != null && c.ultima_msg_em != null && c.ultima_msg_em > ate);
  });
  const erros: string[] = [];
  let analisadas = 0;
  for (const c of pendentes) {
    if (analisadas >= limite || Date.now() - inicio > orcamento) break;
    try {
      await resumirConversa(admin, clientId, c.id, null);
      analisadas++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sem mensagens/i.test(msg)) continue;
      erros.push(msg);
      if (/OPENAI_API_KEY|ANTHROPIC_API_KEY|respondeu 4\d\d/.test(msg)) break; // sem chave ou chave recusada: não insiste
    }
  }
  return { analisadas, pendentes: pendentes.length - analisadas, erros: erros.slice(0, 3) };
}
