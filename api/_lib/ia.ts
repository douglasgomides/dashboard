/**
 * Chamada de IA única do Agentic Core, com registro de custo em ia_execucoes (cliente, execução, finalidade, modelo,
 * tokens, custo estimado, erro). Mesma chave do servidor das outras IAs: OPENAI_API_KEY, com ANTHROPIC_API_KEY de reserva
 * automática quando a OpenAI falha (401/403/429/5xx/rede). O modelo gravado em cada linha diz qual provedor serviu.
 * Os fluxos com modelo próprio (resumo de conversa, classificação de posts, pós-sessão) usam chamarTextoComReserva,
 * com a mesma troca de provedor.
 *
 * Custo: estimativa por preço público de tabela (US$ por milhão de tokens), não é a fatura. Serve para o teto por
 * execução e para comparar clínicas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { textoValido } from "./texto-ia.js";

// OpenAI continua a principal (decisão do dono); os modelos podem ser trocados por variável de ambiente sem deploy.
const MODELO_OPENAI = process.env.AGENTES_MODELO || "gpt-4o-mini";
// Reserva: claude-haiku-5-5 e claude-sonnet-5-5 são os IDs atuais (sem sufixo de data).
const MODELO_CLAUDE = process.env.AGENTES_MODELO_CLAUDE || "claude-haiku-5-5";
// Texto que vai para a clínica usar (roteiro, legenda, copy, mensagem ao paciente): modelo mais forte.
const MODELO_OPENAI_FORTE = process.env.AGENTES_MODELO_FORTE || "gpt-4.1";
const MODELO_CLAUDE_FORTE = process.env.AGENTES_MODELO_CLAUDE_FORTE || "claude-sonnet-5-5";
// US$ por milhão de tokens (entrada, saída). Modelo fora da tabela: registra tokens e custo nulo.
const PRECO: Record<string, [number, number]> = {
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4.1": [2, 8],
  "claude-haiku-4-5-20251001": [1, 5],
  "claude-haiku-4-5": [1, 5],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
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
export interface RespostaIA {
  json: unknown;
  modelo: string;
  custoUsd: number | null;
  /** Quem serviu a resposta. */
  provedor?: "openai" | "anthropic";
  /** true quando a OpenAI falhou e a Anthropic respondeu no lugar. */
  reserva?: boolean;
}

export function iaDisponivel(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/** Custo estimado pela tabela de preço (US$); null para modelo fora da tabela. */
export function custoEstimadoIA(modelo: string, entrada: number | null, saida: number | null): number | null {
  return custo(modelo, entrada, saida);
}

function custo(modelo: string, entrada: number | null, saida: number | null): number | null {
  const p = PRECO[modelo];
  if (!p || entrada == null || saida == null) return null;
  return (entrada * p[0] + saida * p[1]) / 1_000_000;
}

type Provedor = "openai" | "anthropic";

/** Erro de provedor com o status HTTP, para decidir se vale passar para a reserva. */
export class ErroProvedorIA extends Error {
  constructor(message: string, readonly status: number | null, readonly provedor: Provedor) {
    super(message);
  }
}

/**
 * Passa para a Anthropic quando a OpenAI recusa a chave (401/403), fica sem crédito (402), pede para ir mais devagar (429), falha do lado
 * dela (5xx) ou não responde (rede/tempo). De 23 a 27/10/2026 a chave da OpenAI ficou recusada e 2.764 chamadas
 * falharam sem tentar a reserva. Erro de formato (400, JSON inválido) não muda de provedor: o pedido é o problema.
 */
export function deveUsarReserva(e: unknown): boolean {
  if (e instanceof ErroProvedorIA) return e.status == null || e.status === 401 || e.status === 402 || e.status === 403 || e.status === 429 || e.status >= 500;
  if (e instanceof Error) return e.name === "TimeoutError" || e.name === "AbortError" || e instanceof TypeError;
  return false;
}

// Chave de API nunca vai para o registro, nem mascarada.
const semChave = (t: string) => t.replace(/\bsk-[A-Za-z0-9_\-*.]{6,}/g, "[chave]").replace(/(Bearer\s+)\S+/gi, "$1***");

/** Pedido de texto com troca automática de provedor. Usado pelos fluxos que têm modelo próprio (resumo, sessão, posts). */
export interface PedidoTextoIA {
  sistema: string;
  entrada: string;
  maxTokens: number;
  modeloOpenAI?: string;
  modeloClaude?: string;
  timeoutMs?: number;
  /** OpenAI com response_format json_object (padrão true). */
  jsonObject?: boolean;
  /** Anthropic com esforço baixo (resposta curta em JSON). */
  esforcoBaixo?: boolean;
  /** false: tempo esgotado na OpenAI não tenta a reserva (quem chama tem orçamento curto e repete depois). */
  reservaNoTempoEsgotado?: boolean;
}
export interface RespostaTextoIA {
  texto: string;
  modelo: string;
  provedor: Provedor;
  reserva: boolean;
  tIn: number | null;
  tOut: number | null;
}

async function textoOpenAI(p: PedidoTextoIA): Promise<RespostaTextoIA> {
  const modelo = p.modeloOpenAI || MODELO_OPENAI;
  let r: Response;
  try {
    r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(p.timeoutMs ?? 45_000),
      body: JSON.stringify({
        model: modelo,
        ...(p.jsonObject === false ? {} : { response_format: { type: "json_object" } }),
        max_completion_tokens: p.maxTokens,
        messages: [{ role: "system", content: textoValido(p.sistema) }, { role: "user", content: textoValido(p.entrada) }],
      }),
    });
  } catch (e) {
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { modelo });
  }
  if (!r.ok) throw Object.assign(new ErroProvedorIA(`OpenAI respondeu ${r.status}: ${semChave((await r.text().catch(() => "")).slice(0, 160))}`, r.status, "openai"), { modelo });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  return { texto: j.choices?.[0]?.message?.content ?? "", modelo, provedor: "openai", reserva: false, tIn: j.usage?.prompt_tokens ?? null, tOut: j.usage?.completion_tokens ?? null };
}

async function textoAnthropic(p: PedidoTextoIA): Promise<RespostaTextoIA> {
  const modelo = p.modeloClaude || MODELO_CLAUDE;
  let r: Response;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY as string, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(p.timeoutMs ?? 45_000),
      // Esforço baixo: a tarefa é devolver um JSON curto; o pensamento não pode gastar o max_tokens da resposta.
      body: JSON.stringify({
        model: modelo,
        max_tokens: p.maxTokens,
        ...(p.esforcoBaixo ? { output_config: { effort: "low" } } : {}),
        system: textoValido(p.sistema),
        messages: [{ role: "user", content: textoValido(p.entrada) }],
      }),
    });
  } catch (e) {
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { modelo });
  }
  if (!r.ok) throw Object.assign(new ErroProvedorIA(`Anthropic respondeu ${r.status}: ${semChave((await r.text().catch(() => "")).slice(0, 160))}`, r.status, "anthropic"), { modelo });
  const j = (await r.json()) as { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  const texto = (j.content ?? []).filter((b) => !b.type || b.type === "text").map((b) => b.text ?? "").join("");
  return { texto, modelo, provedor: "anthropic", reserva: false, tIn: j.usage?.input_tokens ?? null, tOut: j.usage?.output_tokens ?? null };
}

/** Primeiro objeto JSON dentro do texto (Claude às vezes escreve antes ou depois do JSON). */
export function jsonDoTexto(texto: string): unknown {
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  return JSON.parse(ini >= 0 && fim > ini ? texto.slice(ini, fim + 1) : "{}");
}

/**
 * OpenAI primeiro (quando há chave) e Anthropic de reserva pela mesma regra de deveUsarReserva. Sem nenhuma chave,
 * erro "Servidor sem OPENAI_API_KEY nem ANTHROPIC_API_KEY". `aoFalhar` recebe cada tentativa que falhou (registro).
 */
export async function chamarTextoComReserva(
  p: PedidoTextoIA,
  aoFalhar?: (e: unknown, modelo: string | null, ms: number) => Promise<void> | void,
): Promise<RespostaTextoIA> {
  const ordem: Provedor[] = [];
  if (process.env.OPENAI_API_KEY) ordem.push("openai");
  if (process.env.ANTHROPIC_API_KEY) ordem.push("anthropic");
  if (!ordem.length) throw new Error("Servidor sem OPENAI_API_KEY nem ANTHROPIC_API_KEY");
  let ultimoErro: unknown = null;
  for (let i = 0; i < ordem.length; i++) {
    const t0 = Date.now();
    try {
      const r = ordem[i] === "openai" ? await textoOpenAI(p) : await textoAnthropic(p);
      return { ...r, reserva: i > 0 };
    } catch (e) {
      await aoFalhar?.(e, (e as { modelo?: string })?.modelo ?? null, Date.now() - t0);
      ultimoErro = e;
      const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      if (i + 1 < ordem.length && deveUsarReserva(e) && !(tempo && p.reservaNoTempoEsgotado === false)) continue;
      throw e;
    }
  }
  throw ultimoErro;
}

export async function chamarIAJson(admin: SupabaseClient<any, any, any>, p: PedidoIA): Promise<RespostaIA> {
  const base = { client_id: p.clientId, execucao_id: p.execucaoId ?? null, finalidade: p.finalidade };
  const registrarFalha = async (e: unknown, modelo: string | null, ms: number) => {
    const erro = semChave(e instanceof Error ? e.message : String(e)).slice(0, 300);
    await admin.from("ia_execucoes").insert({ ...base, modelo, tokens_entrada: null, tokens_saida: null, custo_usd: null, ok: false, erro, ms });
  };
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    const e = new Error("Servidor sem OPENAI_API_KEY nem ANTHROPIC_API_KEY");
    await registrarFalha(e, null, 0);
    throw e;
  }
  const forte = p.qualidade === "forte";
  const t0 = Date.now();
  // Cada tentativa que falhou fica registrada com o modelo dela; a que serviu aparece como ok com o próprio modelo.
  const r = await chamarTextoComReserva(
    {
      sistema: p.sistema,
      entrada: p.entrada,
      maxTokens: p.maxTokens ?? 800,
      modeloOpenAI: forte ? MODELO_OPENAI_FORTE : MODELO_OPENAI,
      modeloClaude: forte ? MODELO_CLAUDE_FORTE : MODELO_CLAUDE,
      timeoutMs: forte ? 90_000 : 45_000,
      esforcoBaixo: true,
    },
    registrarFalha,
  );
  let json: unknown;
  try {
    json = r.provedor === "openai" ? JSON.parse(r.texto || "{}") : jsonDoTexto(r.texto);
  } catch (e) {
    await registrarFalha(e, r.modelo, Date.now() - t0);
    throw e;
  }
  const c = custo(r.modelo, r.tIn, r.tOut);
  const { error } = await admin.from("ia_execucoes").insert({ ...base, modelo: r.modelo, tokens_entrada: r.tIn, tokens_saida: r.tOut, custo_usd: c, ok: true, ms: Date.now() - t0 });
  if (error) throw new Error("Não foi possível registrar o custo da chamada de IA");
  return { json, modelo: r.modelo, custoUsd: c, provedor: r.provedor, reserva: r.reserva };
}
