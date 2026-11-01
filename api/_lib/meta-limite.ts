/**
 * Limite de uso da Meta (Graph do Instagram e Marketing API).
 *
 * Doc (lida em 01/11/2026): <https://developers.facebook.com/docs/graph-api/overview/rate-limiting> e
 * <https://developers.facebook.com/docs/marketing-api/overview/rate-limiting>.
 * - Cabeçalhos de uso, em % do limite: `X-App-Usage` (call_count, total_cputime, total_time), `X-Ad-Account-Usage`
 *   (acc_id_util_pct, reset_time_duration em segundos), `X-Business-Use-Case-Usage` (por empresa, com
 *   `estimated_time_to_regain_access` em minutos) e `X-FB-Ads-Insights-Throttle` (app_id_util_pct, acc_id_util_pct).
 * - Códigos de limite: 4 (app), 17 (usuário/conta), 32 (página), 613 (chamadas demais), 80000 a 80014 (casos de uso
 *   da Marketing API: insights, gestão de anúncios, públicos...).
 *
 * Ao bater num limite (ou passar de 90% de uso), o Nexo para de chamar a Meta naquele escopo até o tempo indicado
 * (estimated_time_to_regain_access / reset_time_duration; sem indicação, 10 minutos) e cada chamada seguinte falha na
 * hora com MetaLimiteError, cuja mensagem vai para o erro do sync. Insistir só prolonga o bloqueio.
 * O bloqueio vale para a função em execução (memória do processo): na próxima rodada, a Meta é consultada de novo.
 */
import { createHash } from "node:crypto";

export const USO_MAXIMO_META = 90;
const ESPERA_PADRAO_MIN = 10;

export class MetaLimiteError extends Error {
  readonly limiteMeta = true;
  constructor(message: string, public readonly codigo: number | null, public readonly ateMs: number) {
    super(message);
    this.name = "MetaLimiteError";
  }
}

export function ehLimiteMeta(e: unknown): e is MetaLimiteError {
  return e instanceof MetaLimiteError || (typeof e === "object" && e !== null && (e as { limiteMeta?: unknown }).limiteMeta === true);
}

/** Código de erro da Meta que significa "limite de uso". */
export function codigoDeLimiteMeta(codigo: unknown): boolean {
  const c = Number(codigo);
  return Number.isInteger(c) && (c === 4 || c === 17 || c === 32 || c === 613 || (c >= 80000 && c <= 80014));
}

function descreverCodigo(c: number): string {
  if (c === 4) return "limite do aplicativo";
  if (c === 17) return "limite do usuário ou da conta de anúncios";
  if (c === 32) return "limite da página";
  if (c === 613) return "chamadas demais em pouco tempo";
  return "limite do caso de uso da Marketing API";
}

export interface UsoMeta {
  /** Maior percentual de uso entre os cabeçalhos (0 a 100+). null sem cabeçalho legível. */
  pct: number | null;
  /** Maior espera indicada pela Meta, em minutos. null se não indicou. */
  esperaMin: number | null;
  /** O maior uso veio do aplicativo (vale para todos os tokens). */
  doApp: boolean;
}

function json(v: string | null | undefined): unknown {
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

function num(v: unknown): number | null {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? n : null;
}

type Cabecalhos = { get(nome: string): string | null } | null | undefined;

/** Lê os cabeçalhos de uso. Nunca lança. */
export function lerUsoMeta(h: Cabecalhos): UsoMeta {
  let pct: number | null = null;
  let esperaMin: number | null = null;
  let doApp = false;
  const ver = (v: number | null, app: boolean) => {
    if (v == null) return;
    if (pct == null || v > pct) { pct = v; doApp = app; }
  };
  const esperar = (min: number | null) => { if (min != null && min > 0 && (esperaMin == null || min > esperaMin)) esperaMin = min; };
  const get = (n: string) => { try { return h?.get?.(n) ?? null; } catch { return null; } };

  const app = json(get("x-app-usage")) as Record<string, unknown> | null;
  if (app && typeof app === "object") for (const k of ["call_count", "total_cputime", "total_time"]) ver(num(app[k]), true);

  const conta = json(get("x-ad-account-usage")) as Record<string, unknown> | null;
  if (conta && typeof conta === "object") {
    ver(num(conta.acc_id_util_pct), false);
    const s = num(conta.reset_time_duration);
    if (s != null && s > 0) esperar(Math.ceil(s / 60));
  }

  const insights = json(get("x-fb-ads-insights-throttle")) as Record<string, unknown> | null;
  if (insights && typeof insights === "object") {
    ver(num(insights.app_id_util_pct), true);
    ver(num(insights.acc_id_util_pct), false);
  }

  const negocio = json(get("x-business-use-case-usage")) as Record<string, unknown> | null;
  if (negocio && typeof negocio === "object") {
    for (const lista of Object.values(negocio)) {
      if (!Array.isArray(lista)) continue;
      for (const item of lista as Record<string, unknown>[]) {
        if (!item || typeof item !== "object") continue;
        for (const k of ["call_count", "total_cputime", "total_time"]) ver(num(item[k]), false);
        esperar(num(item.estimated_time_to_regain_access));
      }
    }
  }
  return { pct, esperaMin, doApp };
}

// ---------- bloqueio por escopo (processo) ----------
const bloqueios = new Map<string, { ate: number; motivo: string; codigo: number | null }>();

/** Só para testes. */
export function limparBloqueiosMeta(): void { bloqueios.clear(); }

function tokenDe(url: string, init?: RequestInit): string | null {
  try {
    const t = new URL(url).searchParams.get("access_token");
    if (t) return t;
  } catch { /* url relativa */ }
  const corpo = init?.body;
  if (corpo instanceof URLSearchParams) return corpo.get("access_token");
  if (typeof FormData !== "undefined" && corpo instanceof FormData) {
    const v = corpo.get("access_token");
    return typeof v === "string" ? v : null;
  }
  if (typeof corpo === "string") return new URLSearchParams(corpo).get("access_token");
  return null;
}

/** Escopos que a chamada usa: o app (sempre) e o token (sem guardar o token: só um resumo dele). */
export function escoposMeta(url: string, init?: RequestInit): { app: string; token: string } {
  const t = tokenDe(url, init);
  return { app: "app", token: `tok:${t ? createHash("sha256").update(t).digest("hex").slice(0, 16) : "sem-token"}` };
}

function bloquear(chave: string, minutos: number, motivo: string, codigo: number | null, agora: number): number {
  const ate = agora + Math.min(Math.max(minutos, 1), 24 * 60) * 60_000;
  const atual = bloqueios.get(chave);
  if (!atual || atual.ate < ate) bloqueios.set(chave, { ate, motivo, codigo });
  return Math.max(ate, atual?.ate ?? 0);
}

function mensagem(motivo: string, ate: number, agora: number): string {
  const min = Math.max(1, Math.ceil((ate - agora) / 60_000));
  return `Meta: ${motivo}. Chamadas pausadas por cerca de ${min} min para não prolongar o bloqueio; a próxima rodada tenta de novo.`;
}

/** Lança MetaLimiteError se o escopo desta chamada estiver pausado. */
export function verificarBloqueioMeta(url: string, init?: RequestInit, agora = Date.now()): void {
  const { app, token } = escoposMeta(url, init);
  for (const chave of [app, token]) {
    const b = bloqueios.get(chave);
    if (!b) continue;
    if (b.ate <= agora) { bloqueios.delete(chave); continue; }
    throw new MetaLimiteError(mensagem(b.motivo, b.ate, agora), b.codigo, b.ate);
  }
}

/**
 * Examina a resposta: guarda o bloqueio quando o uso passa de 90% ou o erro é de limite e, no erro de limite, lança
 * MetaLimiteError. Resposta comum volta sem mudança (o corpo não é consumido).
 */
export async function examinarRespostaMeta(url: string, init: RequestInit | undefined, res: Response, agora = Date.now()): Promise<void> {
  const { app, token } = escoposMeta(url, init);
  const uso = lerUsoMeta(res.headers);
  let codigo: number | null = null;
  if (!res.ok) {
    try {
      const corpo = (await res.clone().json()) as { error?: { code?: unknown } } | null;
      codigo = num(corpo?.error?.code);
    } catch { /* corpo não é JSON */ }
  }
  if (codigo != null && codigoDeLimiteMeta(codigo)) {
    const motivo = `limite de uso atingido (código ${codigo}: ${descreverCodigo(codigo)})`;
    const ate = bloquear(codigo === 4 ? app : token, uso.esperaMin ?? ESPERA_PADRAO_MIN, motivo, codigo, agora);
    throw new MetaLimiteError(mensagem(motivo, ate, agora), codigo, ate);
  }
  if (uso.pct != null && uso.pct >= USO_MAXIMO_META) {
    const motivo = `uso em ${Math.round(uso.pct)}% do limite ${uso.doApp ? "do aplicativo" : "da conta"}`;
    bloquear(uso.doApp ? app : token, uso.esperaMin ?? ESPERA_PADRAO_MIN, motivo, null, agora);
  }
}

/** Erro de limite dentro de uma sub-resposta da API de lote ({ code, body }). */
export function limiteNoLote(sub: { code?: number; body?: string } | null | undefined): number | null {
  if (!sub || sub.code === 200) return null;
  try {
    const c = num((JSON.parse(sub.body ?? "{}") as { error?: { code?: unknown } })?.error?.code);
    return c != null && codigoDeLimiteMeta(c) ? c : null;
  } catch { return null; }
}

/** Marca o bloqueio a partir de uma sub-resposta de lote com erro de limite e lança MetaLimiteError. */
export function falharPorLimiteNoLote(url: string, init: RequestInit | undefined, codigo: number, agora = Date.now()): never {
  const { app, token } = escoposMeta(url, init);
  const motivo = `limite de uso atingido (código ${codigo}: ${descreverCodigo(codigo)})`;
  const ate = bloquear(codigo === 4 ? app : token, ESPERA_PADRAO_MIN, motivo, codigo, agora);
  throw new MetaLimiteError(mensagem(motivo, ate, agora), codigo, ate);
}

/** fetch para graph.facebook.com com controle de limite: não chama se o escopo está pausado; para no erro de limite. */
export async function fetchMeta(url: string, init?: RequestInit): Promise<Response> {
  verificarBloqueioMeta(url, init);
  const res = await fetch(url, init);
  await examinarRespostaMeta(url, init, res);
  return res;
}
