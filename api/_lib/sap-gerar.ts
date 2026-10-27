/**
 * Gerador do SAP: roda um prompt do programa (api/_lib/sap-prompts.ts) com os anexos que a equipe cola na tela.
 * Chamado por api/sync/manual.ts (alvo "sap_prompt"), só admin: os anexos têm transcrição e dados da clínica.
 *
 * - Telefone, e-mail e CPF são mascarados antes de ir para a IA.
 * - Texto que a clínica vai usar: modelo forte. Mesma chave do servidor das outras IAs (OPENAI_API_KEY, ou
 *   ANTHROPIC_API_KEY de reserva); custo e erro ficam em ia_execucoes (finalidade "sap_prompt:<código>").
 * - A saída é rascunho em Markdown. Nada é salvo nem enviado: a equipe revisa pela lista de conferência do próprio prompt.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROMPT_POR_CODIGO } from "./sap-prompts.js";
import { textoValido } from "./texto-ia.js";

const MODELO_OPENAI = process.env.SAP_PROMPT_MODELO || process.env.AGENTES_MODELO_FORTE || "gpt-4.1";
const MODELO_CLAUDE = process.env.SAP_PROMPT_MODELO_CLAUDE || process.env.AGENTES_MODELO_CLAUDE_FORTE || "claude-sonnet-5-5";
const MAX_TOKENS_SAIDA = 16_000;
const MAX_POR_ANEXO = 60_000;
const MAX_TOTAL = 180_000;
// US$ por milhão de tokens (entrada, saída), tabela pública; modelo fora da tabela registra custo nulo.
const PRECO: Record<string, [number, number]> = { "gpt-4.1": [2, 8] };

export interface PedidoGerar {
  clientId: string;
  codigo: string;
  anexos: Record<string, string>;
  /** Linha que o documento manda enviar (clínica, datas, momento). */
  pedido: string;
}

export interface ResultadoGerar {
  texto: string;
  modelo: string;
  custoUsd: number | null;
  faltaram: string[];
}

function mascarar(t: string): string {
  return t
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, "[telefone]");
}

export function montarEntrada(codigo: string, anexos: Record<string, string>, pedido: string): { entrada: string; faltaram: string[]; erro?: string } {
  const p = PROMPT_POR_CODIGO.get(codigo);
  if (!p) return { entrada: "", faltaram: [], erro: "Prompt desconhecido" };
  const faltaram = p.entradas.filter((x) => x.obrigatoria && !(anexos[x.id] ?? "").trim()).map((x) => x.rotulo);
  if (faltaram.length) return { entrada: "", faltaram, erro: `Faltam anexos obrigatórios: ${faltaram.join("; ")}` };
  let total = 0;
  const blocos: string[] = [];
  for (const x of p.entradas) {
    const bruto = (anexos[x.id] ?? "").trim();
    if (!bruto) continue;
    const texto = mascarar(bruto).slice(0, MAX_POR_ANEXO);
    total += texto.length;
    if (total > MAX_TOTAL) return { entrada: "", faltaram: [], erro: "Os anexos passam do limite de tamanho. Cole só o que o prompt pede." };
    blocos.push(`=== ANEXO · ${x.rotulo} ===\n${texto}`);
  }
  const ausentes = p.entradas.filter((x) => !(anexos[x.id] ?? "").trim()).map((x) => x.rotulo);
  const nota = ausentes.length ? `\n\nNão anexados: ${ausentes.join("; ")}. Trate como entrada inexistente, como o prompt manda.` : "";
  return { entrada: `${pedido}\n\n${blocos.join("\n\n")}${nota}`, faltaram: ausentes };
}

export async function gerarComPrompt(admin: SupabaseClient<any, any, any>, p: PedidoGerar): Promise<ResultadoGerar> {
  const def = PROMPT_POR_CODIGO.get(p.codigo);
  if (!def) throw new Error("Prompt desconhecido");
  const m = montarEntrada(p.codigo, p.anexos, p.pedido.slice(0, 600));
  if (m.erro) throw new Error(m.erro);
  const t0 = Date.now();
  const finalidade = `sap_prompt:${p.codigo}`;
  let modelo = "";
  let tIn: number | null = null;
  let tOut: number | null = null;
  const custo = () => {
    const pr = PRECO[modelo];
    return pr && tIn != null && tOut != null ? (tIn * pr[0] + tOut * pr[1]) / 1_000_000 : null;
  };
  try {
    let texto = "";
    if (process.env.OPENAI_API_KEY) {
      modelo = MODELO_OPENAI;
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(270_000),
        body: JSON.stringify({
          model: modelo,
          max_completion_tokens: MAX_TOKENS_SAIDA,
          messages: [{ role: "system", content: textoValido(def.sistema) }, { role: "user", content: textoValido(m.entrada) }],
        }),
      });
      if (!r.ok) throw new Error(`OpenAI respondeu ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      tIn = j.usage?.prompt_tokens ?? null;
      tOut = j.usage?.completion_tokens ?? null;
      texto = j.choices?.[0]?.message?.content ?? "";
    } else if (process.env.ANTHROPIC_API_KEY) {
      modelo = MODELO_CLAUDE;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(270_000),
        body: JSON.stringify({ model: modelo, max_tokens: MAX_TOKENS_SAIDA, system: textoValido(def.sistema), messages: [{ role: "user", content: textoValido(m.entrada) }] }),
      });
      if (!r.ok) throw new Error(`Anthropic respondeu ${r.status}`);
      const j = (await r.json()) as { content?: { text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
      tIn = j.usage?.input_tokens ?? null;
      tOut = j.usage?.output_tokens ?? null;
      texto = (j.content ?? []).map((b) => b.text ?? "").join("");
    } else {
      throw new Error("Servidor sem OPENAI_API_KEY nem ANTHROPIC_API_KEY");
    }
    if (!texto.trim()) throw new Error("A IA devolveu resposta vazia");
    const c = custo();
    await admin.from("ia_execucoes").insert({ client_id: p.clientId, execucao_id: null, finalidade, modelo, tokens_entrada: tIn, tokens_saida: tOut, custo_usd: c, ok: true, ms: Date.now() - t0 });
    return { texto, modelo, custoUsd: c, faltaram: m.faltaram };
  } catch (e) {
    const erro = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await admin.from("ia_execucoes").insert({ client_id: p.clientId, execucao_id: null, finalidade, modelo: modelo || null, tokens_entrada: tIn, tokens_saida: tOut, custo_usd: custo(), ok: false, erro, ms: Date.now() - t0 });
    throw e;
  }
}
