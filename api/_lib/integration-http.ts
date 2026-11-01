import { createHash } from "node:crypto";

/** Hosts que podem receber as credenciais dos conectores configuráveis. */
export function integrationHost(value: string, provider: "kommo" | "digisac"): string {
  const host = value.trim().toLowerCase();
  const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
  const suffix = provider === "kommo" ? "(?:kommo\\.com|amocrm\\.(?:com|ru))" : "digisac\\.io";
  if (new RegExp(`^${label}$`).test(host)) return `${host}.${provider === "kommo" ? "kommo.com" : "digisac.io"}`;
  if (!new RegExp(`^${label}\\.${suffix}$`).test(host)) throw new Error(`Domínio ${provider} inválido`);
  return host;
}

/** Nunca segue redirecionamentos carregando o token para outra origem. */
export function integrationRequest(options: RequestInit = {}): RequestInit {
  return { ...options, redirect: "error", signal: options.signal ?? AbortSignal.timeout(30_000) };
}

/** Paginação da Graph também deve continuar na origem que recebeu o token. */
export function graphPageUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "graph.facebook.com" || url.port || url.username || url.password) {
    throw new Error("URL de paginação da Meta inválida");
  }
  return url.toString();
}

/**
 * Nova tentativa compartilhada pelos conectores (Kommo, Clint, Digisac, RD Station, WTS/FlwChat).
 *
 * Tenta de novo quando o provedor pede para ir mais devagar (429), quando ele falha por pouco tempo (5xx) ou quando
 * a rede cai (TypeError do fetch). Não repete o estouro de tempo da própria chamada (o prazo já foi gasto) nem
 * respostas 4xx, que não mudam com a espera. A espera respeita o cabeçalho Retry-After, mas tem teto: se o provedor
 * pedir mais do que o teto (ou do que sobra do prazo da rodada), devolve a última resposta e o chamador registra o
 * erro como antes, sem prender a função.
 *
 * `ritmo` espaça os pedidos por chave (domínio): o Kommo aceita no máximo 7 pedidos por segundo por conta.
 */
export interface OpcoesRetry {
  /** Total de tentativas, contando a primeira. Padrão 3. */
  tentativas?: number;
  /** Espera base da primeira nova tentativa (dobra a cada vez). Padrão 600 ms. */
  baseMs?: number;
  /** Maior espera aceita entre tentativas, inclusive a pedida pelo Retry-After. Padrão 10 s. */
  maxEsperaMs?: number;
  /** Tempo limite de cada tentativa quando o chamador não passa signal. Padrão 30 s. */
  timeoutMs?: number;
  /** Instante (Date.now()) em que a rodada precisa parar: não espera nem tenta além dele. */
  prazo?: number;
  /** Espaçamento mínimo entre pedidos que compartilham a chave, e tetos por janela (ex.: 1.000 em 5 min). */
  ritmo?: Ritmo;
}

export interface Ritmo {
  chave: string;
  porSegundo: number;
  /** Tetos por janela deslizante: no máximo `max` pedidos em `ms`. */
  janelas?: { max: number; ms: number }[];
}

/** O teto da janela só libera depois do prazo da rodada (ou de 30 s): para em vez de esperar ou estourar o limite. */
export class RitmoEsgotadoError extends Error {
  constructor(message: string, public readonly esperaMs: number) {
    super(message);
    this.name = "RitmoEsgotadoError";
  }
}

/** Quanto esperar para o próximo pedido caber em todas as janelas (0 = já cabe). `feitos` em ordem crescente. */
export function esperaDasJanelas(feitos: number[], janelas: { max: number; ms: number }[], agora: number): number {
  let espera = 0;
  for (const j of janelas) {
    if (!(j.max > 0) || !(j.ms > 0)) continue;
    const dentro = feitos.filter((t) => t > agora - j.ms);
    if (dentro.length < j.max) continue;
    // O pedido mais antigo que precisa sair da janela para sobrar 1 vaga.
    const libera = dentro[dentro.length - j.max] + j.ms - agora;
    if (libera > espera) espera = libera;
  }
  return Math.max(0, Math.ceil(espera));
}

type Dormir = (ms: number) => Promise<void>;
let dormirRetry: Dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
/** Só para testes: troca a espera real por uma falsa (devolve a anterior). */
export function definirDormirRetry(fn: Dormir): Dormir {
  const antes = dormirRetry;
  dormirRetry = fn;
  return antes;
}

const proximoPedido = new Map<string, number>();
const pedidosFeitos = new Map<string, number[]>();
const ESPERA_MAXIMA_JANELA_MS = 30_000;
/** Só para testes: esquece o histórico de pedidos por chave. */
export function limparRitmos(): void { proximoPedido.clear(); pedidosFeitos.clear(); }

async function aguardarRitmo(r: OpcoesRetry["ritmo"], prazo?: number): Promise<void> {
  if (!r || !(r.porSegundo > 0)) return;
  if (r.janelas?.length) {
    const maior = Math.max(...r.janelas.map((j) => j.ms));
    const agora = Date.now();
    const feitos = (pedidosFeitos.get(r.chave) ?? []).filter((t) => t > agora - maior);
    const espera = esperaDasJanelas(feitos, r.janelas, agora);
    const sobra = prazo != null ? prazo - agora - 500 : Infinity;
    if (espera > Math.min(ESPERA_MAXIMA_JANELA_MS, sobra)) {
      pedidosFeitos.set(r.chave, feitos);
      const teto = r.janelas.find((j) => esperaDasJanelas(feitos, [j], agora) > 0) ?? r.janelas[0];
      throw new RitmoEsgotadoError(
        `limite de ${teto.max} pedidos em ${Math.round(teto.ms / 1000)} s da conta atingido nesta rodada; o restante fica para a próxima (libera em ~${Math.ceil(espera / 1000)} s)`,
        espera,
      );
    }
    if (espera > 0) await dormirRetry(espera);
    feitos.push(Date.now());
    pedidosFeitos.set(r.chave, feitos);
  }
  const intervalo = Math.ceil(1000 / r.porSegundo);
  const agora = Date.now();
  const livre = Math.max(agora, proximoPedido.get(r.chave) ?? 0);
  proximoPedido.set(r.chave, livre + intervalo);
  if (livre > agora) await dormirRetry(livre - agora);
}

/** Retry-After em segundos ("5") ou data HTTP. null quando ausente ou ilegível. */
export function esperaRetryAfter(valor: string | null | undefined, agora = Date.now()): number | null {
  if (valor == null || String(valor).trim() === "") return null;
  const v = String(valor).trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 1000);
  const data = Date.parse(v);
  if (!Number.isFinite(data)) return null;
  return Math.max(0, data - agora);
}

export function statusVaiTentarDeNovo(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599 && status !== 501);
}

function erroDeRede(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === "AbortError" || e.name === "TimeoutError") return false;
  return e instanceof TypeError;
}

export async function fetchComRetry(url: string, init: RequestInit = {}, opts: OpcoesRetry = {}): Promise<Response> {
  const tentativas = Math.max(1, Math.min(opts.tentativas ?? 3, 6));
  const base = opts.baseMs ?? 600;
  const teto = opts.maxEsperaMs ?? 10_000;
  for (let n = 1; ; n++) {
    await aguardarRitmo(opts.ritmo, opts.prazo);
    const restante = opts.prazo != null ? opts.prazo - Date.now() : Infinity;
    const timeout = Math.max(1, Math.min(opts.timeoutMs ?? 30_000, restante));
    const pedido: RequestInit = { ...init, redirect: "error", signal: init.signal ?? AbortSignal.timeout(timeout) };
    let res: Response | null = null;
    try {
      res = await fetch(url, pedido);
    } catch (e) {
      if (n >= tentativas || !erroDeRede(e)) throw e;
    }
    if (res && (!statusVaiTentarDeNovo(res.status) || n >= tentativas)) return res;
    const pedida = res ? esperaRetryAfter(res.headers?.get?.("retry-after")) : null;
    const espera = pedida ?? Math.round(base * 2 ** (n - 1) * (0.85 + Math.random() * 0.3));
    const sobra = opts.prazo != null ? opts.prazo - Date.now() - 500 : Infinity;
    if (espera > teto || espera > sobra) {
      if (res) return res;
      throw new Error("Falha de rede e sem tempo para tentar de novo");
    }
    // Libera a conexão da resposta descartada antes de tentar de novo.
    if (res) {
      try { await res.body?.cancel?.(); } catch { /* corpo já lido ou falso de teste */ }
    }
    await dormirRetry(espera);
  }
}

/**
 * Helena/WTS: "1.000 requisições a cada 5 minutos" e "200 requisições a cada 5 segundos", "por conta e não por parceiro"
 * (doc Rate Limiting, lida em 01/11/2026). A chave é o token (um resumo dele, nunca o token), compartilhada pelas sessões,
 * mensagens, cards e etiquetas da mesma conta na mesma função. Fica abaixo dos tetos para sobrar folga: 35/s (175 em 5 s)
 * e 950 em 5 min.
 */
export function ritmoHelena(token: string): Ritmo {
  return {
    chave: `helena:${createHash("sha256").update(token).digest("hex").slice(0, 16)}`,
    porSegundo: 35,
    janelas: [{ max: 190, ms: 5_000 }, { max: 950, ms: 300_000 }],
  };
}

/** Kommo: no máximo 7 pedidos por segundo por conta. Fica em 6 para sobrar folga. */
export function ritmoKommo(dominio: string): { chave: string; porSegundo: number } {
  return { chave: `kommo:${dominio}`, porSegundo: 6 };
}
