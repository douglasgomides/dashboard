/**
 * Sync do Digisac (CRM + atendimento) da IGM Palmas: Dra. Rafaela e Dr. Antonione.
 *
 * Digisac é, ao mesmo tempo, mensageria e CRM. A API (https://<conta>.digisac.io/api/v1)
 * autentica com `Authorization: Bearer <token>` e pagina com `perPage` e `page`
 * (a resposta traz `data`, `total`, `lastPage`). O filtro e a ordem vão no parâmetro
 * `query`, um JSON: `{"where":{"updatedAt":{"$gte":"..."}},"order":[["updatedAt","ASC"]]}`.
 *
 * Duas coisas entram daqui, cada uma onde o dashboard já lê:
 *  - CONTATOS viram `crm_leads`. O que identifica o médico, a origem e o status são as
 *    ETIQUETAS que a equipe da clínica passou a usar em 14/10/2026:
 *      "Dra. Rafaela" / "Dr. Antonione"  -> funil (pipeline) do médico;
 *      "Instagram [Origem]", "Google ADS [Origem]", "Indicação [Origem]", "Unimed [Origem]" -> source;
 *      "Agendado", "Não agendado", "Sem resposta" -> etapa.
 *    Contato sem etiqueta de médico cai em "Sem médico identificado", e é isso mesmo: o
 *    painel mostra quanto falta etiquetar, em vez de chutar um médico.
 *  - ATENDIMENTOS (tickets) viram `wts_sessions`, `wts_departments` e `wts_agents`, as
 *    mesmas tabelas que a aba Atendimento já lê para os clientes da WTS.
 *
 * O token fica em crm_connections.access_token. Sync incremental pelo `updatedAt`, com
 * 1 dia de sobreposição, e a marca d'água guardada por tabela (wts_sync_state para
 * atendimentos, crm_connections.config.contatos_ate para contatos).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { integrationHost, integrationRequest } from "./integration-http.js";

const PAGE_SIZE = 200;
const BATCH_SIZE = 500;
const MAX_PAGES = 100; // 100 x 200 = 20 mil registros. Passar disso é bug de paginação.
const SOBREPOSICAO_MS = 24 * 3600_000;

export interface DigisacSyncEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  onlyClientId?: string;
  // Instante (epoch ms) a partir do qual paramos de paginar para não estourar o teto da função.
  deadlineMs?: number;
}

export interface DigisacSyncResult {
  clientId: string;
  connectionId: string;
  contatos: number;
  atendimentos: number;
  errors: string[];
}

interface DigisacTag {
  id?: string;
  label?: string | null;
}

interface DigisacContact {
  id: string;
  isGroup?: boolean;
  isMe?: boolean;
  isBroadcast?: boolean;
  hadChat?: boolean;
  name?: string | null;
  internalName?: string | null;
  alternativeName?: string | null;
  data?: { number?: string | null } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
  tags?: DigisacTag[] | null;
}

interface DigisacTicket {
  id: string;
  isOpen?: boolean;
  departmentId?: string | null;
  contactId?: string | null;
  userId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  metrics?: { waitingTime?: number | null; messagingTime?: number | null } | null;
}

// ---------- regras de etiqueta (exportadas para teste) ----------

export const FUNIS_MEDICO = [
  { id: "rafaela", nome: "Dra. Rafaela", etiqueta: "dra. rafaela" },
  { id: "antonione", nome: "Dr. Antonione", etiqueta: "dr. antonione" },
] as const;
export const FUNIL_AMBOS = { id: "ambos", nome: "Dra. Rafaela e Dr. Antonione" };
export const FUNIL_SEM_MEDICO = { id: "sem-medico", nome: "Sem médico identificado" };

// Ordem de prioridade: se o contato tem duas etiquetas de status, vale a mais adiantada.
export const ETAPAS = [
  { id: "agendado", nome: "Consulta agendada", etiqueta: "agendado" },
  { id: "nao-agendado", nome: "Não agendou", etiqueta: "não agendado" },
  { id: "sem-resposta", nome: "Sem resposta", etiqueta: "sem resposta" },
  { id: "novo", nome: "Novo contato", etiqueta: "" },
] as const;

function norm(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

export function funilDoContato(labels: string[]): { id: string; nome: string } {
  const set = new Set(labels.map(norm));
  const achados = FUNIS_MEDICO.filter((f) => set.has(f.etiqueta));
  if (achados.length === 2) return FUNIL_AMBOS;
  if (achados.length === 1) return { id: achados[0].id, nome: achados[0].nome };
  return FUNIL_SEM_MEDICO;
}

export function etapaDoContato(labels: string[]): { id: string; nome: string } {
  const set = new Set(labels.map(norm));
  for (const e of ETAPAS) {
    if (e.etiqueta && set.has(e.etiqueta)) return { id: e.id, nome: e.nome };
  }
  return { id: "novo", nome: "Novo contato" };
}

// "Instagram [Origem]" -> "Instagram". Só etiqueta com [Origem] conta como origem.
export function origemDoContato(labels: string[]): string | null {
  for (const l of labels) {
    const m = String(l ?? "").match(/^(.*?)\s*\[origem\]\s*$/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

// Digisac: isOpen=false é encerrado; aberto com atendente é em andamento; aberto sem atendente está na fila.
export function statusDoAtendimento(t: Pick<DigisacTicket, "isOpen" | "userId">): "COMPLETED" | "IN_PROGRESS" | "PENDING" {
  if (!t.isOpen) return "COMPLETED";
  return t.userId ? "IN_PROGRESS" : "PENDING";
}

// ---------- HTTP ----------

export function baseUrl(subdomain: string): string {
  const host = integrationHost(subdomain, "digisac");
  return `https://${host}/api/v1`;
}

export async function digGet(base: string, token: string, path: string, query: Record<string, string | number> = {}, tentativa = 0): Promise<any> {
  const target = new URL(base);
  if (target.protocol !== "https:" || target.username || target.password || target.port || target.pathname !== "/api/v1" || target.search || target.hash || integrationHost(target.hostname, "digisac") !== target.hostname || !/^\/[a-z][a-z0-9/_-]*$/i.test(path)) {
    throw new Error("URL da integração Digisac inválida");
  }
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])));
  const url = `${base}${path}${qs.toString() ? `?${qs.toString()}` : ""}`;
  const res = await fetch(url, integrationRequest({
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": "Mozilla/5.0 (DoctorCreatorDashboard)" },
  }));
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && tentativa < 2) {
      await new Promise((r) => setTimeout(r, 800 * (tentativa + 1)));
      return digGet(base, token, path, query, tentativa + 1);
    }
    // Nunca repetir o cabeçalho no erro: ele carrega o token.
    throw new Error(`Digisac ${path} falhou (${res.status})`);
  }
  return res.json();
}

async function paginar<T>(
  base: string,
  token: string,
  path: string,
  extra: Record<string, string | number>,
  filtro: { desde: string | null; ordem: boolean },
  deadlineMs?: number,
): Promise<{ itens: T[]; parcial: boolean }> {
  const itens: T[] = [];
  const query: Record<string, unknown> = {};
  if (filtro.desde) query.where = { updatedAt: { $gte: filtro.desde } };
  if (filtro.ordem) query.order = [["updatedAt", "ASC"]];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await digGet(base, token, path, {
      perPage: PAGE_SIZE,
      page,
      ...extra,
      ...(Object.keys(query).length ? { query: JSON.stringify(query) } : {}),
    });
    if (!Array.isArray(body?.data)) throw new Error(`Digisac ${path}: página inválida`);
    const rows: T[] = body.data;
    itens.push(...rows);
    const ultima = Number(body?.lastPage);
    if (!Number.isSafeInteger(ultima) || ultima < 0) throw new Error(`Digisac ${path}: paginação inválida`);
    if (rows.length === 0 || page >= ultima) return { itens, parcial: false };
    if (deadlineMs && Date.now() > deadlineMs) return { itens, parcial: true };
  }
  return { itens, parcial: true };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// A paginação por updatedAt pode repetir um registro entre páginas (ele muda enquanto lemos).
// O upsert recusa a mesma chave duas vezes no mesmo lote, então fica o último de cada.
function unicos<T>(rows: T[], chave: (r: T) => string): T[] {
  const m = new Map<string, T>();
  for (const r of rows) m.set(chave(r), r);
  return [...m.values()];
}

function maiorData(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a;
  if (!a) return b;
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
}

function menosSobreposicao(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? new Date(t - SOBREPOSICAO_MS).toISOString() : null;
}

// ---------- sync ----------

export async function runDigisacSync(env: DigisacSyncEnv): Promise<DigisacSyncResult[]> {
  const supabase: SupabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("crm_connections")
    .select("id, client_id, subdomain, access_token, config")
    .eq("provider", "digisac")
    .eq("active", true);
  if (env.onlyClientId) query = query.eq("client_id", env.onlyClientId);
  const { data: connections, error } = await query;
  if (error) throw error;

  const results: DigisacSyncResult[] = [];

  for (const conn of connections ?? []) {
    const errors: string[] = [];
    const token = conn.access_token as string | null;
    const subdomain = conn.subdomain as string | null;
    const vazio = { clientId: conn.client_id as string, connectionId: conn.id as string, contatos: 0, atendimentos: 0 };
    if (!token || !subdomain) {
      results.push({ ...vazio, errors: ["Conexão do Digisac sem subdomínio ou sem token"] });
      continue;
    }
    let base: string;
    try { base = baseUrl(subdomain); }
    catch (err) { results.push({ ...vazio, errors: [err instanceof Error ? err.message : String(err)] }); continue; }
    const agora = new Date().toISOString();
    const config = (conn.config && typeof conn.config === "object" ? conn.config : {}) as Record<string, unknown>;

    // 1) Equipes e atendentes
    try {
      const deps = await paginar<{ id: string; name?: string | null }>(base, token, "/departments", {}, { desde: null, ordem: false });
      const linhas = deps.itens.map((d) => ({ client_id: conn.client_id, department_id: d.id, name: d.name ?? "(sem nome)", updated_at: agora }));
      if (linhas.length > 0) {
        const { error: e } = await supabase.from("wts_departments").upsert(linhas, { onConflict: "client_id,department_id" });
        if (e) errors.push(`departamentos: ${e.message}`);
      }
      const users = await paginar<{ id: string; name?: string | null; email?: string | null; branch?: string | null }>(base, token, "/users", {}, { desde: null, ordem: false });
      const agentes = users.itens.map((u) => ({
        client_id: conn.client_id,
        user_id: u.id,
        name: u.name ?? "(sem nome)",
        email: u.email ?? null,
        profile: u.branch ?? null,
        updated_at: agora,
      }));
      if (agentes.length > 0) {
        const { error: e } = await supabase.from("wts_agents").upsert(agentes, { onConflict: "client_id,user_id" });
        if (e) errors.push(`atendentes: ${e.message}`);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    // 2) Atendimentos (tickets) -> wts_sessions
    let atendimentos = 0;
    try {
      const { data: estado, error: erroEstado } = await supabase.from("wts_sync_state").select("last_session_at").eq("client_id", conn.client_id).maybeSingle();
      if (erroEstado) throw new Error(`estado dos atendimentos: ${erroEstado.message}`);
      const desde = menosSobreposicao((estado?.last_session_at as string | null) ?? null);
      const r = await paginar<DigisacTicket>(base, token, "/tickets", {}, { desde, ordem: true }, env.deadlineMs);
      if (r.parcial) errors.push("Digisac: atendimentos interrompidos por tempo, o resto entra na próxima rodada");
      let marca: string | null = (estado?.last_session_at as string | null) ?? null;
      const linhas = r.itens
        .filter((t) => t?.id)
        .map((t) => {
          marca = maiorData(marca, t.updatedAt ?? t.startedAt ?? null);
          const espera = typeof t.metrics?.waitingTime === "number" ? Math.round(t.metrics.waitingTime) : null;
          const atend = typeof t.metrics?.messagingTime === "number" ? Math.round(t.metrics.messagingTime) : null;
          const inicio = t.startedAt ?? t.createdAt ?? null;
          return {
            client_id: conn.client_id,
            session_id: t.id,
            source_provider: "digisac",
            source_connection_id: conn.id,
            started_at: inicio,
            ended_at: t.endedAt ?? null,
            status: statusDoAtendimento(t),
            department_id: t.departmentId ?? null,
            user_id: t.userId ?? null,
            channel_id: null,
            contact_id: t.contactId ?? null,
            wait_seconds: espera,
            service_seconds: atend,
            first_response_at: inicio && espera != null ? new Date(new Date(inicio).getTime() + espera * 1000).toISOString() : null,
            updated_at: agora,
          };
        })
        .filter((l) => l.started_at);
      let falhouAtend = false;
      for (const batch of chunk(unicos(linhas, (l) => l.session_id), BATCH_SIZE)) {
        const { error: e } = await supabase.from("wts_sessions").upsert(batch, { onConflict: "client_id,session_id" });
        if (e) {
          errors.push(`atendimentos (${batch.length}): ${e.message}`);
          falhouAtend = true;
        } else atendimentos += batch.length;
      }
      // Só avança a marca d'água se tudo gravou: lote perdido precisa ser relido na próxima rodada.
      if (marca && !falhouAtend) {
        const { error } = await supabase.from("wts_sync_state").upsert({ client_id: conn.client_id, last_session_at: marca, updated_at: agora }, { onConflict: "client_id" });
        if (error) errors.push(`estado dos atendimentos: ${error.message}`);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    // 3) Contatos -> crm_leads
    let contatos = 0;
    try {
      const desde = menosSobreposicao(typeof config.contatos_ate === "string" ? (config.contatos_ate as string) : null);
      const r = await paginar<DigisacContact>(base, token, "/contacts", { include: "tags" }, { desde, ordem: true }, env.deadlineMs);
      if (r.parcial) errors.push("Digisac: contatos interrompidos por tempo, o resto entra na próxima rodada");
      let marca: string | null = typeof config.contatos_ate === "string" ? (config.contatos_ate as string) : null;
      const funisVistos = new Map<string, string>();
      const linhas = r.itens
        .filter((c) => c?.id)
        .map((c) => {
          marca = maiorData(marca, c.updatedAt ?? c.createdAt ?? null);
          return c;
        })
        // Grupo, o próprio número, lista de transmissão e quem nunca conversou não são lead.
        .filter((c) => !c.isGroup && !c.isMe && !c.isBroadcast && c.hadChat !== false && !c.deletedAt)
        .map((c) => {
          const labels = (c.tags ?? []).map((t) => String(t?.label ?? "")).filter(Boolean);
          const funil = funilDoContato(labels);
          const etapa = etapaDoContato(labels);
          funisVistos.set(funil.id, funil.nome);
          const numero = typeof c.data?.number === "string" ? c.data.number.replace(/\D/g, "") : "";
          return {
            crm_connection_id: conn.id,
            client_id: conn.client_id,
            provider: "digisac",
            external_lead_id: c.id,
            event_type: "sync",
            status_id: etapa.id,
            pipeline_id: funil.id,
            price: null,
            occurred_at: c.createdAt ?? null,
            outcome: "open",
            source: origemDoContato(labels),
            contact_name: c.name ?? c.internalName ?? c.alternativeName ?? null,
            contact_email: null,
            contact_phone: numero || null,
            // Só o que a regra precisa: nada de mensagem nem de dado clínico.
            raw_payload: { etiquetas: labels, atendimento_atual: null } as Record<string, unknown>,
            received_at: c.updatedAt ?? c.createdAt ?? agora,
          };
        });
      let falhouContatos = false;
      for (const batch of chunk(unicos(linhas, (l) => l.external_lead_id), BATCH_SIZE)) {
        const { error: e } = await supabase.from("crm_leads").upsert(batch, { onConflict: "crm_connection_id,external_lead_id" });
        if (e) {
          errors.push(`contatos (${batch.length}): ${e.message}`);
          falhouContatos = true;
        } else contatos += batch.length;
      }

      // Etapas de cada funil, para o painel nomear as colunas.
      const todosFunis = [...FUNIS_MEDICO.map((f) => ({ id: f.id as string, nome: f.nome as string })), FUNIL_AMBOS, FUNIL_SEM_MEDICO];
      for (const f of todosFunis) funisVistos.set(f.id, f.nome);
      const etapas = [...funisVistos.entries()].flatMap(([pid, pnome]) =>
        ETAPAS.map((e) => ({ crm_connection_id: conn.id, pipeline_id: pid, pipeline_name: pnome, status_id: e.id, status_name: e.nome })),
      );
      const { error: eEtapas } = await supabase.from("crm_pipeline_statuses").upsert(etapas, { onConflict: "crm_connection_id,pipeline_id,status_id" });
      if (eEtapas) errors.push(`etapas: ${eEtapas.message}`);

      if (marca && !falhouContatos) {
        const { error } = await supabase.from("crm_connections").update({ config: { ...config, contatos_ate: marca } }).eq("id", conn.id);
        if (error) errors.push(`estado dos contatos: ${error.message}`);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    results.push({ ...vazio, contatos, atendimentos, errors });
  }

  return results;
}
