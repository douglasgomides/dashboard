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

const SISTEMA = `Você lê a conversa de WhatsApp entre um paciente (ou interessado) e a equipe de uma clínica médica no Brasil e escreve uma leitura objetiva para o dono da clínica e o time de marketing.
Regras: português do Brasil, frases curtas, sem jargão. Não invente: se algo não aparece na conversa, use null ou diga "não dá para saber". Não faça diagnóstico nem opine sobre conduta médica. Mensagens marcadas [automática] são do robô da clínica e não contam como atendimento humano.
Responda SOMENTE um JSON:
{"motivo": "por que a pessoa entrou em contato, em até 12 palavras",
 "resumo": "o que aconteceu na conversa, 2 a 4 frases",
 "interesse": "procedimento, consulta ou assunto de interesse, ou null",
 "objecoes": ["dúvidas ou barreiras que a pessoa levantou: preço, convênio, distância, medo, horário..."],
 "situacao": "agendou" | "em_negociacao" | "aguardando_clinica" | "aguardando_paciente" | "desistiu" | "so_informacao" | "outro",
 "atendimento": {"nota": "bom" | "regular" | "ruim", "pontos_fortes": ["..."], "pontos_a_melhorar": ["..."]},
 "proximo_passo": "a ação concreta que a clínica deveria fazer agora com este lead, em 1 frase",
 "alerta": "se o paciente relatou algo urgente ou grave de saúde, descreva em 1 frase; senão null"}
Critérios de atendimento: respondeu a pergunta que foi feita? deu preço/condições quando pedido ou explicou por que não? conduziu para o agendamento? demorou (os horários estão na conversa)? deixou a pessoa sem resposta?`;

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
  userId: string,
): Promise<{ resumo: unknown; modelo: string; ate_msg_em: string }> {
  const { data: conv } = await admin.from("conversas").select("id, client_id").eq("id", conversaId).maybeSingle();
  const c = conv as { id: string; client_id: string } | null;
  if (!c || c.client_id !== clientId) throw new Error("Conversa não encontrada para este cliente");
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
  await admin.from("acessos_conversas").insert({ user_id: userId, client_id: clientId, conversa_id: conversaId, acao: "resumo_ia" });
  return { resumo: json, modelo, ate_msg_em: ate };
}
