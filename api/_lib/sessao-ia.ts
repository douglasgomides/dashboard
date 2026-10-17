/**
 * Rascunho do pós-sessão por IA (botão "Gerar rascunho com IA" no Modo sessão do SAP).
 * Chamado por api/sync/manual.ts (alvo "sessao_ia"), só admin: o plano da Vercel aceita no máximo 12 funções.
 *
 * - Entrada: as notas registradas na sessão (sap_sessao_registro), o que a sessão precisa entregar (vem da tela)
 *   e, se a equipe colar, a transcrição da reunião. Telefone, e-mail e CPF são mascarados antes de ir para a IA.
 * - Saída: rascunho estruturado (resumo, decisões, KPIs, ações de cada lado, pontos para conferência e a mensagem
 *   de envio). Fica salvo em sap_sessao_registro (chave "ia_rascunho") para a equipe revisar; nada é enviado à
 *   clínica sem revisão humana.
 * - Regras do prompt: não inventar número, não prometer faturamento ou resultado (CFM), sem preço/desconto,
 *   nenhum dado de paciente, referência sempre "inicial Doctor Creator, a validar".
 * - Usa a mesma chave do servidor das outras IAs: OPENAI_API_KEY ou ANTHROPIC_API_KEY.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionDraftSchema } from "./ai-output.js";

const MODELO_OPENAI = process.env.SESSAO_MODELO || process.env.RESUMO_MODELO || "gpt-4o-mini";
const MODELO_CLAUDE = process.env.SESSAO_MODELO || "claude-haiku-4-5-20251001";
const MAX_TRANSCRICAO = 60_000;

const SISTEMA = `Você é o Coordenador de Implementação do Sistema de Aquisição de Pacientes da Doctor Creator (clínicas médicas no Brasil). Recebe as notas que a equipe registrou numa reunião do programa e, às vezes, a transcrição. Escreve o RASCUNHO do que sai da reunião, para a equipe revisar antes de enviar.
Regras: português do Brasil, frases curtas, sem jargão, sem travessão. Use só o que está nas notas e na transcrição: se algo não aparece, deixe a lista vazia ou escreva "não registrado". Nunca invente número. Nunca prometa faturamento, resultado ou recuperação de valor; a meta é sempre KPI de processo. Não fale de preço, desconto ou promoção. Nenhum nome, telefone ou dado de paciente. Quando citar referência de mercado, diga "referência inicial Doctor Creator, a validar".
Responda SOMENTE um JSON:
{"resumo": "3 a 5 frases com o que a reunião decidiu",
 "decisoes": ["decisão e o motivo, uma por item"],
 "kpis": ["KPI: baseline e o que foi combinado (sem meta inventada)"],
 "acoes_clinica": ["ação da clínica, com dono e prazo se dito"],
 "acoes_dc": ["entrega da Doctor Creator, com prazo se dito"],
 "citacoes": ["frase literal marcante do decisor, se houver"],
 "conferir": ["o que o Coordenador precisa conferir antes de enviar: número sem fonte, divergência, algo que ficou em aberto"],
 "riscos": ["risco para o programa percebido na reunião"],
 "mensagem": "mensagem curta e cordial para o grupo da clínica com o resumo e os próximos passos, pronta para revisar"}`;

function mascarar(t: string): string {
  return t
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, "[telefone]");
}

async function chamarIA(entrada: string): Promise<{ json: unknown; modelo: string }> {
  const chaveOpenAI = process.env.OPENAI_API_KEY;
  const chaveClaude = process.env.ANTHROPIC_API_KEY;
  if (chaveOpenAI) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${chaveOpenAI}` },
      signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({
        model: MODELO_OPENAI,
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
        messages: [
          { role: "system", content: SISTEMA },
          { role: "user", content: entrada },
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
      signal: AbortSignal.timeout(55_000),
      body: JSON.stringify({ model: MODELO_CLAUDE, max_tokens: 2000, system: SISTEMA, messages: [{ role: "user", content: entrada }] }),
    });
    if (!r.ok) throw new Error(`Anthropic respondeu ${r.status}`);
    const j = (await r.json()) as { content?: { text?: string }[] };
    const texto = (j.content ?? []).map((b) => b.text ?? "").join("");
    const ini = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    return { json: JSON.parse(ini >= 0 && fim > ini ? texto.slice(ini, fim + 1) : "{}"), modelo: MODELO_CLAUDE };
  }
  throw new Error("Servidor sem OPENAI_API_KEY nem ANTHROPIC_API_KEY: rascunho por IA desligado.");
}

export async function rascunharSessao(
  admin: SupabaseClient<any, any, any>,
  clientId: string,
  args: { sessao: string; titulo: string; entregas: string[]; rotulos: Record<string, string>; transcricao?: string | null },
  userId: string | null,
): Promise<{ rascunho: unknown; modelo: string }> {
  if (!/^[A-Z0-9]{1,6}$/.test(args.sessao)) throw new Error("Sessão inválida");
  const { data: cli } = await admin.from("sap_clinicas").select("id, nome, especialidade, cidade, d0").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const clinica = cli as { id: string; nome: string | null; especialidade: string | null; cidade: string | null; d0: string | null } | null;
  if (!clinica) throw new Error("Clínica não está no Sistema de Aquisição");
  const { data: regs, error } = await admin.from("sap_sessao_registro").select("chave, texto").eq("clinica_id", clinica.id).eq("sessao", args.sessao);
  if (error) throw new Error(error.message);
  const notas = ((regs ?? []) as { chave: string; texto: string | null }[])
    .filter((r) => r.texto && r.texto.trim() && r.chave !== "ia_rascunho" && args.rotulos[r.chave])
    .map((r) => `## ${args.rotulos[r.chave]}\n${mascarar(r.texto!.trim())}`);
  const transcricao = args.transcricao ? mascarar(args.transcricao).slice(0, MAX_TRANSCRICAO) : "";
  if (notas.length === 0 && !transcricao) throw new Error("Registre as notas da sessão ou cole a transcrição antes de gerar o rascunho.");
  const entrada = [
    `Reunião: ${args.titulo}`,
    `Clínica: ${clinica.especialidade ?? "especialidade não informada"}${clinica.cidade ? `, ${clinica.cidade}` : ""}`,
    `O que esta reunião precisa entregar: ${args.entregas.join("; ")}`,
    "",
    "# Notas registradas pela equipe",
    notas.join("\n\n") || "(sem notas)",
    transcricao ? `\n# Transcrição (pode estar incompleta)\n${transcricao}` : "",
  ].join("\n");
  const resposta = await chamarIA(entrada);
  const validado = sessionDraftSchema.safeParse(resposta.json);
  if (!validado.success) throw new Error("IA devolveu rascunho em formato inválido");
  const { modelo } = resposta;
  const json = validado.data;
  const { error: e2 } = await admin.from("sap_sessao_registro").upsert({
    clinica_id: clinica.id, sessao: args.sessao, chave: "ia_rascunho", texto: JSON.stringify({ ...(json as object), modelo, gerado_em: new Date().toISOString() }),
    atualizado_por: userId, atualizado_em: new Date().toISOString(),
  });
  if (e2) throw new Error(e2.message);
  return { rascunho: json, modelo };
}
