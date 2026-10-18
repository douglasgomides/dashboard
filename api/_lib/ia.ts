/**
 * Chamada de IA única do Agentic Core, com registro de custo em ia_execucoes (cliente, execução, finalidade, modelo,
 * tokens, custo estimado, erro). Mesma chave do servidor das outras IAs: OPENAI_API_KEY, ou ANTHROPIC_API_KEY de reserva.
 * Os fluxos antigos (resumo de conversa, classificação de posts, pós-sessão) continuam com a chamada própria por
 * enquanto; migrar cada um para cá é um passo separado.
 *
 * Custo: estimativa por preço público de tabela (US$ por milhão de tokens), não é a fatura. Serve para o teto por
 * execução e para comparar clínicas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const MODELO_OPENAI = process.env.AGENTES_MODELO || "gpt-4o-mini";
const MODELO_CLAUDE = process.env.AGENTES_MODELO_CLAUDE || "claude-haiku-4-5-20251001";
// Texto que vai para a clínica usar (roteiro, legenda, copy, mensagem ao paciente): modelo mais forte.
const MODELO_OPENAI_FORTE = process.env.AGENTES_MODELO_FORTE || "gpt-4.1";
const MODELO_CLAUDE_FORTE = process.env.AGENTES_MODELO_CLAUDE_FORTE || "claude-sonnet-5-5";
// US$ por milhão de tokens (entrada, saída). Modelo fora da tabela: registra tokens e custo nulo.
const PRECO: Record<string, [number, number]> = {
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4.1": [2, 8],
  "claude-haiku-4-5-20251001": [1, 5],
};

export interface PedidoIA {
  sistema: string;
  entrada: string;
  finalidade: string;
  clientId: string | null;
  execucaoId?: string | null;
  maxTokens?: number;
  /** "forte" para texto que a clínica vai usar; padrão é o modelo barato. */
  qualidade?: "padrao" | "forte";
}
export interface RespostaIA { json: unknown; modelo: string; custoUsd: number | null }

export function iaDisponivel(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

function custo(modelo: string, entrada: number | null, saida: number | null): number | null {
  const p = PRECO[modelo];
  if (!p || entrada == null || saida == null) return null;
  return (entrada * p[0] + saida * p[1]) / 1_000_000;
}

export async function chamarIAJson(admin: SupabaseClient<any, any, any>, p: PedidoIA): Promise<RespostaIA> {
  const t0 = Date.now();
  let modelo = "";
  let tIn: number | null = null;
  let tOut: number | null = null;
  try {
    let json: unknown;
    if (process.env.OPENAI_API_KEY) {
      modelo = p.qualidade === "forte" ? MODELO_OPENAI_FORTE : MODELO_OPENAI;
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(p.qualidade === "forte" ? 90_000 : 45_000),
        body: JSON.stringify({
          model: modelo,
          response_format: { type: "json_object" },
          max_completion_tokens: p.maxTokens ?? 800,
          messages: [{ role: "system", content: p.sistema }, { role: "user", content: p.entrada }],
        }),
      });
      if (!r.ok) throw new Error(`OpenAI respondeu ${r.status}`);
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      tIn = j.usage?.prompt_tokens ?? null;
      tOut = j.usage?.completion_tokens ?? null;
      json = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    } else if (process.env.ANTHROPIC_API_KEY) {
      modelo = p.qualidade === "forte" ? MODELO_CLAUDE_FORTE : MODELO_CLAUDE;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(p.qualidade === "forte" ? 90_000 : 45_000),
        body: JSON.stringify({ model: modelo, max_tokens: p.maxTokens ?? 800, system: p.sistema, messages: [{ role: "user", content: p.entrada }] }),
      });
      if (!r.ok) throw new Error(`Anthropic respondeu ${r.status}`);
      const j = (await r.json()) as { content?: { text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
      tIn = j.usage?.input_tokens ?? null;
      tOut = j.usage?.output_tokens ?? null;
      const texto = (j.content ?? []).map((b) => b.text ?? "").join("");
      const ini = texto.indexOf("{");
      const fim = texto.lastIndexOf("}");
      json = JSON.parse(ini >= 0 && fim > ini ? texto.slice(ini, fim + 1) : "{}");
    } else {
      throw new Error("Servidor sem OPENAI_API_KEY nem ANTHROPIC_API_KEY");
    }
    const c = custo(modelo, tIn, tOut);
    await admin.from("ia_execucoes").insert({ client_id: p.clientId, execucao_id: p.execucaoId ?? null, finalidade: p.finalidade, modelo, tokens_entrada: tIn, tokens_saida: tOut, custo_usd: c, ok: true, ms: Date.now() - t0 });
    return { json, modelo, custoUsd: c };
  } catch (e) {
    const erro = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await admin.from("ia_execucoes").insert({ client_id: p.clientId, execucao_id: p.execucaoId ?? null, finalidade: p.finalidade, modelo: modelo || null, tokens_entrada: tIn, tokens_saida: tOut, custo_usd: custo(modelo, tIn, tOut), ok: false, erro, ms: Date.now() - t0 });
    throw e;
  }
}
