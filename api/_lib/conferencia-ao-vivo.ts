/**
 * Conferência ao vivo: o Nexo contra o CRM de origem, por cliente, só com pedidos GET.
 *
 * A auditoria de confiabilidade só conseguia comparar a tabela do Nexo com o payload que o próprio Nexo guardou: se
 * o sync deixou de trazer algo, os dois lados erram juntos. Aqui a fonte é lida de novo, na hora, e comparada com o
 * banco. Nada é escrito no CRM; no Nexo só se grava o resultado em conferencia_ao_vivo (números, sem dado pessoal).
 *
 * O que se compara (períodos fechados = 30 dias inteiros até ontem, no horário de Brasília):
 *  - Kommo: todos os leads (listagem completa + Entrada). Abertos agora; criados no período (created_at); ganhos e
 *    perdidos no período pela data de fechamento da fonte (closed_at, status 142/143). Amostra de até 20 leads:
 *    etapa, funil, resultado, valor e data de criação.
 *  - RD Station: todas as negociações. Mesmas métricas (win true/false, closed_at da fonte).
 *  - FlwChat: a API só lista cards ABERTOS (ganho/perdido fechado some da lista), então ganhos e perdidos por data
 *    não são verificáveis na fonte. Compara os cards listados (com os mesmos filtros do sync: título "teste" e
 *    config.painel_desde) com os cards que o Nexo mostra como não fechados, e os criados no período ainda listados.
 *    Amostra: etapa, painel, valor, criação e se o Nexo não deu o card como fechado.
 *  - WTS (Helena): sessões iniciadas nos últimos 7 dias e abertas agora (IN_PROGRESS + PENDING), com a mesma regra
 *    de dono do sync (card, equipe, curinga) quando a conta serve mais de um cliente.
 *  - Digisac: contatos que o sync trata como lead (sem grupo, sem o próprio número, com conversa); criados no período;
 *    atendimentos (tickets) dos últimos 7 dias e abertos agora. Digisac não tem ganho/perda.
 *
 * Ritmo: Kommo no máximo 6 pedidos/s por conta (ritmoKommo), RD 1,8/s (limite 120/min), WTS e Digisac 5/s. Conta
 * compartilhada (HOMS em 3 clientes, Digisac em 2) é lida uma vez só. Nunca registra corpo, URL ou token.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchComRetry, integrationHost, ritmoKommo } from "./integration-http.js";
import { leadsDaEntradaKommo, type KommoLead } from "./kommo-leads-sync.js";
import { baseUrl as digisacBase, etapaDoContato, funilDoContato } from "./digisac-sync.js";
import { lerTodasAsLinhas } from "./ler-paginas.js";
import {
  dentroDaTolerancia,
  textoTolerancia,
  TOL_AMOSTRA,
  TOL_AO_VIVO,
  TOL_EXATA,
  TOL_SESSOES,
  type FonteAoVivo,
  type Tolerancia,
} from "../../src/lib/conferencia-ao-vivo.js";

export const FONTES_AO_VIVO: FonteAoVivo[] = ["kommo", "rdstation", "flwchat", "wts", "digisac"];
const DIA = 86_400_000;
const FUSO_BR = 3 * 3600_000; // America/Sao_Paulo, sem horário de verão desde 2019
const TAMANHO_AMOSTRA = 20;

/** GET de JSON na fonte. Injetado para os testes rodarem sem rede. */
export type BuscarJson = (url: string, headers: Record<string, string>) => Promise<{ status: number; corpo: unknown }>;

const HOSTS_PERMITIDOS = /^(?:[a-z0-9-]+\.kommo\.com|[a-z0-9-]+\.amocrm\.(?:com|ru)|api\.wts\.chat|crm\.rdstation\.com|[a-z0-9-]+\.digisac\.io)$/;

function ritmoDoHost(host: string): { chave: string; porSegundo: number } {
  if (/\.(kommo\.com|amocrm\.(com|ru))$/.test(host)) return ritmoKommo(host);
  if (host === "crm.rdstation.com") return { chave: "rd:api", porSegundo: 1.8 };
  return { chave: `ao-vivo:${host}`, porSegundo: 5 };
}

/** Somente GET, só para os hosts dos CRMs, com nova tentativa e ritmo. Corpo que não é JSON vira nulo. */
export const buscarSomenteGet: BuscarJson = async (url, headers) => {
  const u = new URL(url);
  if (u.protocol !== "https:" || !HOSTS_PERMITIDOS.test(u.hostname) || u.username || u.password || u.port) {
    throw new Error("Conferência ao vivo: host fora da lista dos CRMs");
  }
  const res = await fetchComRetry(url, { method: "GET", headers: { Accept: "application/json", ...headers } }, { ritmo: ritmoDoHost(u.hostname), timeoutMs: 25_000 });
  if (res.status === 204) return { status: 204, corpo: null };
  const texto = await res.text();
  let corpo: unknown = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = null; }
  return { status: res.status, corpo };
};

// ---------- registros normalizados ----------

export type Resultado = "open" | "won" | "lost";

/** Um lead/card como a fonte o descreve, já no vocabulário do Nexo. */
export interface RegistroFonte {
  id: string;
  etapa: string | null;
  funil: string | null;
  /** null quando a fonte não informa (FlwChat: só "está listado"; Digisac: não tem resultado). */
  resultado: Resultado | null;
  valor: number | null;
  criadoMs: number | null;
  fechadoMs: number | null;
}

/** Um lead como está em crm_leads. */
export interface RegistroNexo {
  external_lead_id: string;
  status_id: string | null;
  pipeline_id: string | null;
  outcome: string | null;
  price: number | null;
  occurred_at: string | null;
  removido_na_origem: string | null;
  /** raw_payload->>closed_at: Kommo em segundos, RD em ISO. */
  closed_at: string | null;
  /** raw_payload->>substituido_por (FlwChat com cards_por_item): card listado que o Nexo junta a outro. */
  substituido_por: string | null;
}

export interface LinhaConferencia {
  client_id: string;
  crm_connection_id: string | null;
  fonte: FonteAoVivo;
  metrica: string;
  nexo: number | null;
  fonte_valor: number | null;
  tolerancia: string;
  ok: boolean | null;
  amostra: number | null;
  rodado_em: string;
  detalhe: Record<string, unknown>;
}

export interface Periodo {
  /** Período fechado: [ini, fim), 30 dias inteiros até ontem. */
  ini: number;
  fim: number;
  /** Janela de 7 dias até agora, para os atendimentos. */
  ini7: number;
  agora: number;
}

export function periodoFechado(agora: number): Periodo {
  const fim = Math.floor((agora - FUSO_BR) / DIA) * DIA + FUSO_BR; // 00:00 de hoje em Brasília
  return { ini: fim - 30 * DIA, fim, ini7: agora - 7 * DIA, agora };
}

const dentro = (ms: number | null, p: Periodo) => ms != null && ms >= p.ini && ms < p.fim;

function msDeIso(v: unknown): number | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
function msDeUnix(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n * 1000 : null;
}
/** Valor zero e ausente são a mesma coisa para o painel. */
function valorNorm(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Erro sem URL, sem corpo e sem segredo. */
export function erroLimpo(err: unknown, segredos: (string | null | undefined)[] = []): string {
  let m = err instanceof Error ? err.message : String(err);
  for (const s of segredos) if (s && s.length >= 4) m = m.split(s).join("***");
  m = m.replace(/https?:\/\/\S+/g, "<url>").replace(/Bearer\s+\S+/gi, "Bearer ***");
  return m.slice(0, 200);
}

class SemTempo extends Error {
  constructor() { super("sem tempo nesta rodada: rode de novo só para este cliente (client_id) ou esta fonte (fonte)"); }
}

function linha(base: { client_id: string; crm_connection_id: string | null; fonte: FonteAoVivo; rodado_em: string }, metrica: string, nexo: number | null, fonte: number | null, tol: Tolerancia, detalhe: Record<string, unknown> = {}, amostra: number | null = null): LinhaConferencia {
  const ok = nexo == null || fonte == null ? null : dentroDaTolerancia(nexo, fonte, tol);
  return { ...base, metrica, nexo, fonte_valor: fonte, tolerancia: textoTolerancia(tol), ok, amostra, detalhe: { ...detalhe, ...(nexo != null && fonte != null ? { diferenca: nexo - fonte } : {}) } };
}

/** Embaralha (Fisher-Yates) e pega até n. */
export function sortear<T>(itens: T[], n: number, aleatorio: () => number): T[] {
  const a = [...itens];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export interface ResultadoAmostra {
  tamanho: number;
  iguais: number;
  ausentes: number;
  divergencias: Record<string, number>;
}

/** Compara a amostra campo a campo. Só contagens saem daqui: nenhum id nem nome. */
export function compararAmostra(amostra: RegistroFonte[], nexo: Map<string, RegistroNexo>, opts: { exigeNaoFechado?: boolean; campos?: ("etapa" | "funil" | "resultado" | "valor" | "criado")[] } = {}): ResultadoAmostra {
  const campos = opts.campos ?? ["etapa", "funil", "resultado", "valor", "criado"];
  const div: Record<string, number> = {};
  let iguais = 0, ausentes = 0;
  const marca = (c: string) => { div[c] = (div[c] ?? 0) + 1; };
  for (const f of amostra) {
    const n = nexo.get(f.id);
    if (!n || (n.removido_na_origem && !n.substituido_por)) { ausentes++; continue; }
    let igual = true;
    const dif = (c: string) => { marca(c); igual = false; };
    if (campos.includes("etapa") && String(n.status_id ?? "") !== String(f.etapa ?? "")) dif("etapa");
    if (campos.includes("funil") && String(n.pipeline_id ?? "") !== String(f.funil ?? "")) dif("funil");
    if (campos.includes("resultado") && f.resultado != null && n.outcome !== f.resultado) dif("resultado");
    if (opts.exigeNaoFechado && n.outcome === "closed") dif("dado_como_fechado");
    if (campos.includes("valor") && valorNorm(n.price) !== valorNorm(f.valor)) dif("valor");
    if (campos.includes("criado")) {
      const a = msDeIso(n.occurred_at);
      if ((a == null) !== (f.criadoMs == null) || (a != null && f.criadoMs != null && Math.abs(a - f.criadoMs) > 60_000)) dif("criado");
    }
    if (igual) iguais++;
  }
  return { tamanho: amostra.length, iguais, ausentes, divergencias: div };
}

// ---------- acesso ao Nexo (injetado nos testes) ----------

export interface ConexaoAoVivo {
  id: string;
  client_id: string;
  provider: string;
  subdomain: string | null;
  access_token: string | null;
  config: Record<string, unknown> | null;
}

export interface ClienteWts {
  id: string;
  wts_company_id: string;
  wts_department_ids: string[] | null;
  wts_api_token: string | null;
}

export interface LeitorNexo {
  conexoes(onlyClientId?: string): Promise<ConexaoAoVivo[]>;
  /** Todos os clientes ativos com conta WTS (o roteamento precisa dos donos da conta inteira). */
  clientesWts(): Promise<ClienteWts[]>;
  leads(connectionId: string): Promise<RegistroNexo[]>;
  /** sessionId do card do FlwChat -> cliente, como o sync de WTS usa para contas com mais de um cliente. */
  donoPeloCard(clientIds: string[]): Promise<Map<string, string>>;
  contarSessoes(clientId: string, desdeIso: string, ateIso: string): Promise<number>;
  contarSessoesAbertas(clientId: string): Promise<number>;
  gravar(linhas: LinhaConferencia[]): Promise<void>;
}

export function leitorSupabase(db: SupabaseClient): LeitorNexo {
  return {
    async conexoes(onlyClientId) {
      let q = db.from("crm_connections").select("id, client_id, provider, subdomain, access_token, config").eq("active", true).in("provider", ["kommo", "rdstation", "flwchat", "digisac"]);
      if (onlyClientId) q = q.eq("client_id", onlyClientId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ConexaoAoVivo[];
    },
    async clientesWts() {
      const { data, error } = await db.from("clients").select("id, wts_company_id, wts_department_ids, wts_api_token").eq("active", true).not("wts_company_id", "is", null);
      if (error) throw new Error(error.message);
      return (data ?? []) as ClienteWts[];
    },
    async leads(connectionId) {
      const linhas = await lerTodasAsLinhas((de, ate) => db.from("crm_leads")
        .select("external_lead_id, status_id, pipeline_id, outcome, price, occurred_at, removido_na_origem, closed_at:raw_payload->>closed_at, substituido_por:raw_payload->>substituido_por")
        .eq("crm_connection_id", connectionId).order("external_lead_id").range(de, ate));
      return linhas as unknown as RegistroNexo[];
    },
    async donoPeloCard(clientIds) {
      const dono = new Map<string, string>();
      const ambiguas = new Set<string>();
      for (const c of clientIds) {
        const rows = await lerTodasAsLinhas((de, ate) => db.from("crm_leads").select("external_lead_id, sessionId:raw_payload->>sessionId")
          .eq("client_id", c).eq("provider", "flwchat").not("raw_payload->>sessionId", "is", null).order("external_lead_id").range(de, ate), 50_000);
        for (const r of rows as unknown as { sessionId: string | null }[]) {
          if (!r.sessionId) continue;
          const atual = dono.get(r.sessionId);
          if (atual && atual !== c) ambiguas.add(r.sessionId);
          dono.set(r.sessionId, c);
        }
      }
      for (const s of ambiguas) dono.delete(s);
      return dono;
    },
    async contarSessoes(clientId, desdeIso, ateIso) {
      const { count, error } = await db.from("wts_sessions").select("session_id", { count: "exact", head: true }).eq("client_id", clientId).gte("started_at", desdeIso).lt("started_at", ateIso);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async contarSessoesAbertas(clientId) {
      const { count, error } = await db.from("wts_sessions").select("session_id", { count: "exact", head: true }).eq("client_id", clientId).in("status", ["IN_PROGRESS", "PENDING"]);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async gravar(linhas) {
      for (let i = 0; i < linhas.length; i += 500) {
        const { error } = await db.from("conferencia_ao_vivo").insert(linhas.slice(i, i + 500));
        if (error) throw new Error(error.message);
      }
    },
  };
}

// ---------- leitura das fontes ----------

interface Ctx {
  buscar: BuscarJson;
  prazo: number;
  agora: () => number;
}

function checarPrazo(ctx: Ctx) {
  if (ctx.agora() > ctx.prazo) throw new SemTempo();
}

const MAX_PAGINAS_KOMMO = 200;

export async function lerKommo(ctx: Ctx, host: string, token: string): Promise<RegistroFonte[]> {
  const auth = { Authorization: `Bearer ${token}` };
  const vistos = new Map<string, RegistroFonte>();
  const add = (l: KommoLead & { closed_at?: number | null }) => {
    if (!l || !Number.isSafeInteger(l.id) || l.id <= 0) return;
    const st = Number(l.status_id);
    vistos.set(String(l.id), {
      id: String(l.id),
      etapa: l.status_id != null ? String(l.status_id) : null,
      funil: l.pipeline_id != null ? String(l.pipeline_id) : null,
      resultado: st === 142 ? "won" : st === 143 ? "lost" : "open",
      valor: valorNorm(l.price),
      criadoMs: msDeUnix(l.created_at),
      fechadoMs: msDeUnix(l.closed_at),
    });
  };
  for (let pagina = 1; ; pagina++) {
    if (pagina > MAX_PAGINAS_KOMMO) throw new Error(`Kommo passou de ${MAX_PAGINAS_KOMMO} páginas`);
    checarPrazo(ctx);
    const r = await ctx.buscar(`https://${host}/api/v4/leads?limit=250&page=${pagina}`, auth);
    if (r.status === 204) break;
    if (r.status !== 200) throw new Error(`Kommo respondeu ${r.status} na página ${pagina}`);
    const corpo = r.corpo as { _embedded?: { leads?: KommoLead[] }; _links?: { next?: unknown } } | null;
    const leads = corpo?._embedded?.leads;
    if (!Array.isArray(leads)) throw new Error(`Kommo devolveu página ${pagina} sem leads`);
    for (const l of leads) add(l);
    if (!corpo?._links?.next) break;
  }
  checarPrazo(ctx);
  const entrada = await leadsDaEntradaKommo(ctx.buscar, host, token);
  if (entrada.erro) throw new Error(entrada.erro);
  for (const l of entrada.leads) add(l);
  return [...vistos.values()];
}

export async function lerRdStation(ctx: Ctx, token: string): Promise<RegistroFonte[]> {
  const out = new Map<string, RegistroFonte>();
  for (let pagina = 1; ; pagina++) {
    if (pagina > 100) throw new Error("RD Station passou de 100 páginas");
    checarPrazo(ctx);
    const qs = new URLSearchParams({ token, limit: "200", page: String(pagina) });
    const r = await ctx.buscar(`https://crm.rdstation.com/api/v1/deals?${qs.toString()}`, {});
    if (r.status !== 200) throw new Error(`RD Station respondeu ${r.status} na página ${pagina}`);
    const corpo = r.corpo as { deals?: Record<string, any>[]; has_more?: boolean } | null;
    if (!Array.isArray(corpo?.deals)) throw new Error(`RD Station devolveu página ${pagina} sem negociações`);
    for (const d of corpo!.deals) {
      if (!d?._id) continue;
      out.set(String(d._id), {
        id: String(d._id),
        etapa: String(d.deal_stage?._id ?? d.deal_stage?.id ?? "") || null,
        funil: null, // o RD não manda o funil no negócio (vem do catálogo); não entra na amostra
        resultado: d.win === true ? "won" : d.win === false ? "lost" : "open",
        valor: valorNorm(d.amount_total),
        criadoMs: msDeIso(d.created_at),
        fechadoMs: msDeIso(d.closed_at),
      });
    }
    if (!corpo!.has_more || corpo!.deals.length === 0) break;
  }
  return [...out.values()];
}

export async function lerFlwChat(ctx: Ctx, token: string, config: Record<string, unknown>): Promise<{ registros: RegistroFonte[]; paineis: string[] }> {
  const paineis = (Array.isArray(config.panel_ids) ? config.panel_ids : []).filter((p): p is string => typeof p === "string" && p.length > 0);
  if (!paineis.length) throw new Error("FlwChat sem config.panel_ids");
  const desde = (config.painel_desde && typeof config.painel_desde === "object" ? config.painel_desde : {}) as Record<string, string>;
  const out = new Map<string, RegistroFonte>();
  for (const painel of paineis) {
    for (let pagina = 1; ; pagina++) {
      if (pagina > 150) throw new Error("FlwChat passou de 150 páginas num painel");
      checarPrazo(ctx);
      const qs = new URLSearchParams({ panelId: painel, pageSize: "100", pageNumber: String(pagina) });
      const r = await ctx.buscar(`https://api.wts.chat/crm/v1/panel/card?${qs.toString()}`, { Authorization: `Bearer ${token}` });
      if (r.status !== 200) throw new Error(`FlwChat respondeu ${r.status} num painel`);
      const corpo = r.corpo as { items?: Record<string, any>[]; hasMorePages?: boolean } | null;
      if (!Array.isArray(corpo?.items)) throw new Error("FlwChat devolveu página sem cards");
      for (const c of corpo!.items) {
        if (!c?.id) continue;
        // Mesmos filtros do sync: card de teste e card anterior a painel_desde não entram no Nexo.
        if (/^teste/i.test(String(c.title ?? "").trim())) continue;
        if (desde[painel] && typeof c.createdAt === "string" && c.createdAt.slice(0, 10) < desde[painel]) continue;
        out.set(String(c.id), {
          id: String(c.id),
          etapa: c.stepId != null ? String(c.stepId) : null,
          funil: painel,
          resultado: null,
          valor: valorNorm(c.monetaryAmount),
          criadoMs: msDeIso(c.createdAt),
          fechadoMs: null,
        });
      }
      if (!corpo!.hasMorePages) break;
    }
  }
  return { registros: [...out.values()], paineis };
}

const DIG_HEADERS = (token: string) => ({ Authorization: `Bearer ${token}`, "User-Agent": "Mozilla/5.0 (DoctorCreatorDashboard)" });

export async function lerDigisacContatos(ctx: Ctx, base: string, token: string): Promise<RegistroFonte[]> {
  const out = new Map<string, RegistroFonte>();
  for (let pagina = 1; ; pagina++) {
    if (pagina > 100) throw new Error("Digisac passou de 100 páginas de contatos");
    checarPrazo(ctx);
    const qs = new URLSearchParams({ perPage: "200", page: String(pagina), include: "tags" });
    const r = await ctx.buscar(`${base}/contacts?${qs.toString()}`, DIG_HEADERS(token));
    if (r.status !== 200) throw new Error(`Digisac respondeu ${r.status} nos contatos`);
    const corpo = r.corpo as { data?: Record<string, any>[]; lastPage?: number } | null;
    if (!Array.isArray(corpo?.data)) throw new Error("Digisac devolveu página de contatos inválida");
    for (const c of corpo!.data) {
      if (!c?.id) continue;
      // Mesmo filtro do sync: grupo, o próprio número, transmissão, quem nunca conversou e apagado não são lead.
      if (c.isGroup || c.isMe || c.isBroadcast || c.hadChat === false || c.deletedAt) continue;
      const etiquetas = (Array.isArray(c.tags) ? c.tags : []).map((t: { label?: unknown }) => String(t?.label ?? "")).filter(Boolean);
      out.set(String(c.id), {
        id: String(c.id),
        etapa: etapaDoContato(etiquetas).id,
        funil: funilDoContato(etiquetas).id,
        resultado: null,
        valor: null,
        criadoMs: msDeIso(c.createdAt),
        fechadoMs: null,
      });
    }
    const ultima = Number(corpo!.lastPage);
    if (!Number.isSafeInteger(ultima) || corpo!.data.length === 0 || pagina >= ultima) break;
  }
  return [...out.values()];
}

async function totalDigisac(ctx: Ctx, base: string, token: string, where: Record<string, unknown>): Promise<number> {
  checarPrazo(ctx);
  const qs = new URLSearchParams({ perPage: "1", page: "1", query: JSON.stringify({ where }) });
  const r = await ctx.buscar(`${base}/tickets?${qs.toString()}`, DIG_HEADERS(token));
  const n = Number((r.corpo as { total?: unknown } | null)?.total);
  if (r.status !== 200 || !Number.isFinite(n)) throw new Error(`Digisac respondeu ${r.status} nos atendimentos`);
  return n;
}

interface SessaoWts { id: string; createdAt?: string | null; startAt?: string | null; departmentId?: string | null }

async function paginarSessoes(ctx: Ctx, token: string, extra: string, parar?: (s: SessaoWts) => boolean, maxPaginas = 60): Promise<SessaoWts[]> {
  const out: SessaoWts[] = [];
  for (let pagina = 1; ; pagina++) {
    if (pagina > maxPaginas) throw new Error(`WTS passou de ${maxPaginas} páginas de sessões`);
    checarPrazo(ctx);
    const r = await ctx.buscar(`https://api.wts.chat/chat/v1/session?PageSize=100&PageNumber=${pagina}${extra}`, { Authorization: `Bearer ${token}` });
    if (r.status !== 200) throw new Error(`WTS respondeu ${r.status} nas sessões`);
    const corpo = r.corpo as { items?: SessaoWts[]; hasMorePages?: boolean } | null;
    if (!Array.isArray(corpo?.items)) throw new Error("WTS devolveu página de sessões inválida");
    let fim = false;
    for (const s of corpo!.items) {
      if (!s?.id) continue;
      if (parar?.(s)) { fim = true; break; }
      out.push(s);
    }
    if (fim || !corpo!.hasMorePages || corpo!.items.length === 0) break;
  }
  return out;
}

/** Mesma regra de dono do sync de WTS (wts-sync.ts): card, depois equipe não ambígua, depois o único curinga. */
export function roteadorWts(donos: ClienteWts[], peloCard: Map<string, string>): (s: SessaoWts) => string | null {
  const curingas = donos.filter((c) => !c.wts_department_ids || c.wts_department_ids.length === 0);
  const curinga = curingas.length === 1 ? curingas[0].id : null;
  const porEquipe = new Map<string, string>();
  const ambiguas = new Set<string>();
  for (const c of donos) for (const d of c.wts_department_ids ?? []) {
    if (porEquipe.has(d) && porEquipe.get(d) !== c.id) ambiguas.add(d);
    porEquipe.set(d, c.id);
  }
  return (s) => {
    const card = peloCard.get(s.id);
    if (card) return card;
    if (s.departmentId && ambiguas.has(s.departmentId)) return null;
    return (s.departmentId ? porEquipe.get(s.departmentId) : undefined) ?? curinga;
  };
}

// ---------- comparação ----------

function contar(regs: RegistroFonte[], p: Periodo) {
  return {
    abertos: regs.filter((r) => r.resultado === "open").length,
    criados: regs.filter((r) => dentro(r.criadoMs, p)).length,
    ganhos: regs.filter((r) => r.resultado === "won" && dentro(r.fechadoMs, p)).length,
    perdidos: regs.filter((r) => r.resultado === "lost" && dentro(r.fechadoMs, p)).length,
  };
}

function fechadoNoNexo(n: RegistroNexo, provider: string): number | null {
  return provider === "kommo" ? msDeUnix(n.closed_at) : msDeIso(n.closed_at);
}

/** Kommo e RD: abertos agora, criados, ganhos e perdidos no período, e a amostra. */
export function compararLeads(base: Parameters<typeof linha>[0], provider: "kommo" | "rdstation", fonte: RegistroFonte[], nexoTodos: RegistroNexo[], p: Periodo, aleatorio: () => number): LinhaConferencia[] {
  const vivos = nexoTodos.filter((n) => !n.removido_na_origem);
  const f = contar(fonte, p);
  const nexo = {
    abertos: vivos.filter((n) => n.outcome === "open").length,
    criados: vivos.filter((n) => dentro(msDeIso(n.occurred_at), p)).length,
    ganhos: vivos.filter((n) => n.outcome === "won" && dentro(fechadoNoNexo(n, provider), p)).length,
    perdidos: vivos.filter((n) => n.outcome === "lost" && dentro(fechadoNoNexo(n, provider), p)).length,
  };
  const periodo = { de: new Date(p.ini).toISOString(), ate: new Date(p.fim).toISOString() };
  const porId = new Map(nexoTodos.map((n) => [n.external_lead_id, n]));
  const idsFonte = new Set(fonte.map((r) => r.id));
  const am = compararAmostra(sortear(fonte, TAMANHO_AMOSTRA, aleatorio), porId, { campos: provider === "rdstation" ? ["etapa", "resultado", "valor", "criado"] : undefined });
  return [
    linha(base, "abertos_agora", nexo.abertos, f.abertos, TOL_AO_VIVO, { total_fonte: fonte.length, total_nexo_vivos: vivos.length, so_no_nexo: vivos.filter((n) => !idsFonte.has(n.external_lead_id)).length, so_na_fonte: fonte.filter((r) => { const n = porId.get(r.id); return !n || !!n.removido_na_origem; }).length }),
    linha(base, "criados_30d", nexo.criados, f.criados, TOL_EXATA, { periodo }),
    linha(base, "ganhos_30d", nexo.ganhos, f.ganhos, TOL_EXATA, { periodo, data: "fechamento na fonte (closed_at)" }),
    linha(base, "perdidos_30d", nexo.perdidos, f.perdidos, TOL_EXATA, { periodo, data: "fechamento na fonte (closed_at)" }),
    linha(base, "amostra", am.iguais, am.tamanho, TOL_AMOSTRA, { ausentes: am.ausentes, divergencias: am.divergencias }, am.tamanho),
  ];
}

/** FlwChat: só os cards listados (abertos na API) são verificáveis. */
export function compararFlwChat(base: Parameters<typeof linha>[0], fonte: RegistroFonte[], paineis: string[], nexoTodos: RegistroNexo[], p: Periodo, aleatorio: () => number): LinhaConferencia[] {
  const set = new Set(paineis);
  // O que o Nexo mostra como card que ainda está no painel: não fechado e não apagado (o card "substituído" de
  // cards_por_item continua listado na fonte, então conta).
  const listadosNexo = nexoTodos.filter((n) => set.has(String(n.pipeline_id ?? "")) && n.outcome !== "closed" && (!n.removido_na_origem || !!n.substituido_por));
  const porId = new Map(nexoTodos.map((n) => [n.external_lead_id, n]));
  const idsFonte = new Set(fonte.map((r) => r.id));
  const am = compararAmostra(sortear(fonte, TAMANHO_AMOSTRA, aleatorio), porId, { exigeNaoFechado: true, campos: ["etapa", "funil", "valor", "criado"] });
  return [
    linha(base, "abertos_agora", listadosNexo.length, fonte.length, TOL_AO_VIVO, { metodo: "cards listados na API (só abertos)", so_no_nexo: listadosNexo.filter((n) => !idsFonte.has(n.external_lead_id)).length, so_na_fonte: fonte.filter((r) => { const n = porId.get(r.id); return !n || n.outcome === "closed"; }).length }),
    linha(base, "criados_30d_listados", listadosNexo.filter((n) => dentro(msDeIso(n.occurred_at), p)).length, fonte.filter((r) => dentro(r.criadoMs, p)).length, TOL_AO_VIVO, { periodo: { de: new Date(p.ini).toISOString(), ate: new Date(p.fim).toISOString() }, metodo: "criados no período e ainda listados" }),
    linha(base, "amostra", am.iguais, am.tamanho, TOL_AMOSTRA, { ausentes: am.ausentes, divergencias: am.divergencias }, am.tamanho),
  ];
}

export function compararDigisacContatos(base: Parameters<typeof linha>[0], fonte: RegistroFonte[], nexoTodos: RegistroNexo[], p: Periodo, aleatorio: () => number): LinhaConferencia[] {
  const vivos = nexoTodos.filter((n) => !n.removido_na_origem);
  const porId = new Map(nexoTodos.map((n) => [n.external_lead_id, n]));
  const idsFonte = new Set(fonte.map((r) => r.id));
  const am = compararAmostra(sortear(fonte, TAMANHO_AMOSTRA, aleatorio), porId, { campos: ["etapa", "funil", "criado"] });
  return [
    linha(base, "abertos_agora", vivos.length, fonte.length, TOL_AO_VIVO, { metodo: "contatos que o sync trata como lead (Digisac não tem ganho/perda)", so_no_nexo: vivos.filter((n) => !idsFonte.has(n.external_lead_id)).length, so_na_fonte: fonte.filter((r) => !porId.has(r.id)).length }),
    linha(base, "criados_30d", vivos.filter((n) => dentro(msDeIso(n.occurred_at), p)).length, fonte.filter((r) => dentro(r.criadoMs, p)).length, TOL_EXATA, { periodo: { de: new Date(p.ini).toISOString(), ate: new Date(p.fim).toISOString() } }),
    linha(base, "amostra", am.iguais, am.tamanho, TOL_AMOSTRA, { ausentes: am.ausentes, divergencias: am.divergencias }, am.tamanho),
  ];
}

// ---------- rodada ----------

export interface OpcoesAoVivo {
  onlyClientId?: string;
  fontes?: FonteAoVivo[];
  tokenKommoPadrao?: string;
  tokenWtsPadrao?: string;
  /** Instante (Date.now()) em que a rodada para de ler fontes. Padrão: 270 s. */
  prazo?: number;
  agora?: () => number;
  aleatorio?: () => number;
}

export interface ResumoRodada {
  rodado_em: string;
  linhas: number;
  ok: number;
  divergentes: number;
  nao_lidas: number;
  por_fonte: Record<string, { ok: number; divergentes: number; nao_lidas: number }>;
  ms: number;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export async function runConferenciaAoVivo(nexo: LeitorNexo, buscar: BuscarJson, opts: OpcoesAoVivo = {}): Promise<{ resumo: ResumoRodada; linhas: LinhaConferencia[] }> {
  const agora = opts.agora ?? Date.now;
  const inicio = agora();
  const ctx: Ctx = { buscar, prazo: opts.prazo ?? inicio + 270_000, agora };
  const aleatorio = opts.aleatorio ?? Math.random;
  const p = periodoFechado(inicio);
  const rodado_em = new Date(inicio).toISOString();
  const fontes = new Set(opts.fontes?.length ? opts.fontes : FONTES_AO_VIVO);
  const linhas: LinhaConferencia[] = [];
  // Conta compartilhada lida uma vez só (chave: provedor + host + hash do token; o token não fica em memória de log).
  const cache = new Map<string, Promise<unknown>>();
  const umaVez = <T>(chave: string, ler: () => Promise<T>): Promise<T> => {
    if (!cache.has(chave)) cache.set(chave, ler());
    return cache.get(chave) as Promise<T>;
  };
  const falha = (base: Parameters<typeof linha>[0], metricas: string[], err: unknown, segredos: (string | null | undefined)[]) => {
    const erro = err instanceof SemTempo ? err.message : erroLimpo(err, segredos);
    for (const m of metricas) linhas.push({ ...base, metrica: m, nexo: null, fonte_valor: null, tolerancia: "—", ok: null, amostra: null, detalhe: { erro } });
  };

  const conexoes = (await nexo.conexoes(opts.onlyClientId)).filter((c) => fontes.has(c.provider as FonteAoVivo));
  for (const conn of conexoes) {
    const fonte = conn.provider as FonteAoVivo;
    const base = { client_id: conn.client_id, crm_connection_id: conn.id, fonte, rodado_em };
    const cfg = (conn.config ?? {}) as Record<string, unknown>;
    if (fonte === "kommo") {
      const token = conn.access_token || opts.tokenKommoPadrao || null;
      try {
        if (!token || !conn.subdomain) throw new Error("Kommo sem token ou sem subdomínio");
        const host = integrationHost(conn.subdomain.includes(".") ? conn.subdomain : `${conn.subdomain}.kommo.com`, "kommo");
        const regs = await umaVez(`kommo|${host}|${hash(token)}`, () => lerKommo(ctx, host, token));
        linhas.push(...compararLeads(base, "kommo", regs, await nexo.leads(conn.id), p, aleatorio));
      } catch (err) { falha(base, ["abertos_agora", "criados_30d", "ganhos_30d", "perdidos_30d", "amostra"], err, [token]); }
    } else if (fonte === "rdstation") {
      const token = conn.access_token;
      try {
        if (!token) throw new Error("RD Station sem token");
        const regs = await umaVez(`rd|${hash(token)}`, () => lerRdStation(ctx, token));
        linhas.push(...compararLeads(base, "rdstation", regs, await nexo.leads(conn.id), p, aleatorio));
      } catch (err) { falha(base, ["abertos_agora", "criados_30d", "ganhos_30d", "perdidos_30d", "amostra"], err, [token]); }
    } else if (fonte === "flwchat") {
      const token = conn.access_token;
      try {
        if (!token) throw new Error("FlwChat sem token");
        const r = await umaVez(`flw|${hash(token)}|${hash(JSON.stringify([cfg.panel_ids, cfg.painel_desde]))}`, () => lerFlwChat(ctx, token, cfg));
        linhas.push(...compararFlwChat(base, r.registros, r.paineis, await nexo.leads(conn.id), p, aleatorio));
      } catch (err) { falha(base, ["abertos_agora", "criados_30d_listados", "amostra"], err, [token]); }
    } else if (fonte === "digisac") {
      const token = conn.access_token;
      let host = "";
      try {
        if (!token || !conn.subdomain) throw new Error("Digisac sem subdomínio ou sem token");
        const b = digisacBase(conn.subdomain);
        host = new URL(b).hostname;
        const regs = await umaVez(`dig|${host}|${hash(token)}`, () => lerDigisacContatos(ctx, b, token));
        linhas.push(...compararDigisacContatos(base, regs, await nexo.leads(conn.id), p, aleatorio));
      } catch (err) { falha(base, ["abertos_agora", "criados_30d", "amostra"], err, [token]); }
      // Atendimentos (tickets) do mesmo cliente, gravados em wts_sessions pelo sync do Digisac.
      try {
        if (!token || !conn.subdomain) throw new Error("Digisac sem subdomínio ou sem token");
        const b = digisacBase(conn.subdomain);
        const ate = new Date(p.agora).toISOString(), desde = new Date(p.ini7).toISOString();
        const tot = await umaVez(`digt|${host}|${hash(token)}`, async () => ({
          s7: await totalDigisac(ctx, b, token, { createdAt: { $gte: desde, $lt: ate } }),
          abertas: await totalDigisac(ctx, b, token, { isOpen: true }),
        }));
        linhas.push(linha(base, "atendimentos_7d", await nexo.contarSessoes(conn.client_id, desde, ate), tot.s7, TOL_SESSOES, { janela: { de: desde, ate } }));
        linhas.push(linha(base, "atendimentos_abertos_agora", await nexo.contarSessoesAbertas(conn.client_id), tot.abertas, TOL_AO_VIVO, { metodo: "isOpen na fonte x IN_PROGRESS+PENDING no Nexo" }));
      } catch (err) { falha(base, ["atendimentos_7d", "atendimentos_abertos_agora"], err, [token]); }
    }
  }

  if (fontes.has("wts")) {
    const todos = await nexo.clientesWts();
    const porConta = new Map<string, ClienteWts[]>();
    for (const c of todos) porConta.set(c.wts_company_id, [...(porConta.get(c.wts_company_id) ?? []), c]);
    for (const donos of porConta.values()) {
      const alvo = donos.filter((c) => !opts.onlyClientId || c.id === opts.onlyClientId);
      if (!alvo.length) continue;
      const token = donos.find((c) => c.wts_api_token)?.wts_api_token ?? opts.tokenWtsPadrao ?? null;
      try {
        if (!token) throw new Error("WTS sem token");
        const peloCard = donos.length > 1 ? await nexo.donoPeloCard(donos.map((c) => c.id)) : new Map<string, string>();
        const dono = roteadorWts(donos, peloCard);
        const desde = p.ini7, ate = p.agora;
        const recentes = await paginarSessoes(ctx, token, "&OrderBy=createdat&OrderDirection=DESCENDING", (s) => (msDeIso(s.createdAt) ?? 0) < desde);
        const abertas = [
          ...(await paginarSessoes(ctx, token, "&Status=IN_PROGRESS")),
          ...(await paginarSessoes(ctx, token, "&Status=PENDING")),
        ];
        const semDono = { recentes: 0, abertas: 0 };
        const s7 = new Map<string, number>(), ab = new Map<string, number>();
        for (const s of recentes) {
          const ini = msDeIso(s.startAt) ?? msDeIso(s.createdAt);
          if (ini == null || ini < desde || ini >= ate) continue;
          const d = dono(s);
          if (!d) { semDono.recentes++; continue; }
          s7.set(d, (s7.get(d) ?? 0) + 1);
        }
        const vistas = new Set<string>();
        for (const s of abertas) {
          if (vistas.has(s.id)) continue;
          vistas.add(s.id);
          const d = dono(s);
          if (!d) { semDono.abertas++; continue; }
          ab.set(d, (ab.get(d) ?? 0) + 1);
        }
        const desdeIso = new Date(desde).toISOString(), ateIso = new Date(ate).toISOString();
        for (const c of alvo) {
          const base = { client_id: c.id, crm_connection_id: null, fonte: "wts" as const, rodado_em };
          const detalheConta = { clientes_na_conta: donos.length, sessoes_sem_dono: semDono };
          linhas.push(linha(base, "sessoes_7d", await nexo.contarSessoes(c.id, desdeIso, ateIso), s7.get(c.id) ?? 0, TOL_SESSOES, { janela: { de: desdeIso, ate: ateIso }, ...detalheConta }));
          linhas.push(linha(base, "sessoes_abertas_agora", await nexo.contarSessoesAbertas(c.id), ab.get(c.id) ?? 0, TOL_AO_VIVO, { metodo: "Status IN_PROGRESS + PENDING", ...detalheConta }));
        }
      } catch (err) {
        for (const c of alvo) falha({ client_id: c.id, crm_connection_id: null, fonte: "wts", rodado_em }, ["sessoes_7d", "sessoes_abertas_agora"], err, [token]);
      }
    }
  }

  await nexo.gravar(linhas);
  const por_fonte: ResumoRodada["por_fonte"] = {};
  for (const l of linhas) {
    const r = (por_fonte[l.fonte] ??= { ok: 0, divergentes: 0, nao_lidas: 0 });
    if (l.ok === null) r.nao_lidas++; else if (l.ok) r.ok++; else r.divergentes++;
  }
  const resumo: ResumoRodada = {
    rodado_em,
    linhas: linhas.length,
    ok: linhas.filter((l) => l.ok === true).length,
    divergentes: linhas.filter((l) => l.ok === false).length,
    nao_lidas: linhas.filter((l) => l.ok === null).length,
    por_fonte,
    ms: agora() - inicio,
  };
  return { resumo, linhas };
}
