/**
 * Sync dos painéis de vendas do FlwChat / Synkronos (plataforma WTS) para crm_leads.
 *
 * API: https://api.wts.chat, token permanente em `Authorization: Bearer pn_...`
 * (Ajustes > Integrações > Integração via API). Mesma plataforma do WTS Chat.
 *
 * Duas particularidades da API:
 *  - GET /crm/v1/panel varia por conta: na Synkronos (Marcella) só lista os painéis
 *    pessoais ("Minhas tarefas"); no Support Clinic (Sergio) lista todos os painéis da
 *    empresa (scope COMPANY). Por isso os painéis lidos ficam explícitos em
 *    crm_connections.config.panel_ids, e painel interno (Enfermagem, Administrativo) fica de fora.
 *  - As etapas só vêm com `?includeDetails=Steps`; sem isso o card traz stepTitle nulo.
 *  - A listagem devolve só os cards ABERTOS: ganho/perdido fechado não aparece.
 *    Painéis sem etapa final (Marcella) só mostram o que está aberto.
 *
 * Modelagem, igual ao que Kommo, Clint e RD Station já gravam:
 *  - o painel vira "pipeline" e a etapa vira "status" (crm_pipeline_statuses);
 *  - o valor do card (monetaryAmount) vira price;
 *  - cards de teste (título começando com "teste") são ignorados.
 * config.etapas_ganho / config.etapas_perdido (listas de trechos do nome da etapa,
 * sem diferenciar maiúscula) definem outcome won/lost; o resto fica "open". Painéis
 * que mantêm os fechados numa etapa final (ex.: "Agendado") devolvem esses cards
 * normalmente, então o ganho/perdido aparece de verdade.
 * A equipe pode confirmar o significado de cada etapa na aba "A analisar": isso grava em
 * crm_etapa_resultado e passa na frente de config.etapas_*.
 * config.painel_desde = { "<panelId>": "AAAA-MM-DD" } descarta cards criados antes
 * da data, para não repetir o histórico que já veio de outra fonte (planilha).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const FLW_BASE = "https://api.wts.chat";
const PAGE_SIZE = 100;
const BATCH_SIZE = 500;
// Trava de segurança: 50 páginas x 100 = 5 mil cards por painel.
const MAX_PAGES = 50;

export interface FlwChatSyncEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  onlyClientId?: string;
  deadlineMs?: number;
}

export interface FlwChatSyncResult {
  clientId: string;
  connectionId: string;
  paineis: number;
  cards: number;
  errors: string[];
}

interface FlwStep {
  id: string;
  title?: string | null;
}

interface FlwPanel {
  id: string;
  title?: string | null;
  steps?: FlwStep[] | null;
}

interface FlwCard {
  id: string;
  title?: string | null;
  stepId?: string | null;
  monetaryAmount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  customFields?: Record<string, unknown> | null;
  contactIds?: string[] | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function flwGet(token: string, path: string, query: Record<string, string | number> = {}): Promise<any> {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])));
  const url = `${FLW_BASE}${path}${qs.size ? `?${qs.toString()}` : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000), redirect: "error" });
  if (!res.ok) {
    throw new Error(`FlwChat ${path} falhou (${res.status}): ${(await res.text()).slice(0, 160)}`);
  }
  return res.json();
}

async function fetchCards(token: string, panelId: string, deadlineMs?: number): Promise<{ cards: FlwCard[]; parcial: boolean }> {
  const all: FlwCard[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await flwGet(token, "/crm/v1/panel/card", { panelId, pageSize: PAGE_SIZE, pageNumber: page });
    all.push(...((body?.items ?? []) as FlwCard[]));
    if (!body?.hasMorePages) return { cards: all, parcial: false };
    if (deadlineMs && Date.now() > deadlineMs) return { cards: all, parcial: true };
  }
  return { cards: all, parcial: true };
}

// O painel de orçamentos descreve cada card como "NOME DO PROCEDIMENTO - 1 Sessão(ões) 1 Vez(es) a cada 7 dias".
// O nome do procedimento é o que vem antes do " - N Sessão". Entra no payload no formato dos campos
// customizados do Kommo, que é o que crm_funil_por_campo lê para o gráfico "por tipo de procedimento".
function procedimentoDaDescricao(descricao: unknown): string | null {
  if (typeof descricao !== "string") return null;
  const m = descricao.replace(/\s+/g, " ").trim().match(/^(.+?)\s+-\s+\d+\s+Sess/i);
  const nome = m?.[1]?.trim();
  return nome ? nome : null;
}

// A equipe do Instituto Geia passou a registrar a origem do contato nas observações do card
// (Orgânico, Instagram, Conteúdo; Indicação aparece nos cards reais). Só vale quando a observação
// cita exatamente uma categoria: citando duas ou nenhuma, fica vazio em vez de adivinhar.
const ORIGENS_DA_DESCRICAO: Array<[string, RegExp]> = [
  ["Orgânico", /\borganic[oa]\b/],
  ["Instagram", /\binstagram\b/],
  ["Conteúdo", /\bconteudo\b/],
  ["Indicação", /\bindicacao\b/],
];

export function origemDaDescricao(descricao: unknown): string | null {
  if (typeof descricao !== "string") return null;
  const texto = descricao.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
  const achadas = ORIGENS_DA_DESCRICAO.filter(([, re]) => re.test(texto)).map(([nome]) => nome);
  return achadas.length === 1 ? achadas[0] : null;
}

// Tags do contato (Ajustes > Etiquetas no WTS). A equipe do Dr. Sergio Maia marca o contato com
// "Origem · Instagram", "Tipo · Paciente" etc. A tag fica no CONTATO, não no card, e a listagem
// de contatos só devolve as tags com IncludeDetails=Tags. Liga por conexão com config.tags_contato.
const PREFIXO_ORIGEM = /^origem\s*[·:\-]\s*/i;
const PREFIXO_TIPO = /^tipo\s*[·:\-]\s*/i;

/** Origem pela tag "Origem · X". Duas origens diferentes ou "Não identificada" ficam vazias, em vez de adivinhar. */
export function origemDasTags(nomes: string[]): string | null {
  const origens = [...new Set(nomes.filter((n) => PREFIXO_ORIGEM.test(n)).map((n) => n.replace(PREFIXO_ORIGEM, "").trim()).filter(Boolean))];
  if (origens.length !== 1) return null;
  return /^n[ãa]o identificad/i.test(origens[0]) ? null : origens[0];
}

/** Tipo do contato pela tag "Tipo · X" (Paciente, Lead novo, Equipe, Fornecedor ou representante…). Só quando há um. */
export function tipoDasTags(nomes: string[]): string | null {
  const tipos = [...new Set(nomes.filter((n) => PREFIXO_TIPO.test(n)).map((n) => n.replace(PREFIXO_TIPO, "").trim()).filter(Boolean))];
  return tipos.length === 1 ? tipos[0] : null;
}

async function tagsDosContatos(token: string, deadlineMs?: number): Promise<{ porContato: Map<string, string[]>; parcial: boolean }> {
  const nomes = new Map<string, string>();
  for (const t of ((await flwGet(token, "/core/v1/tag", { pageSize: 200 })) ?? []) as Array<{ id?: string; name?: string }>) {
    if (t?.id && t.name) nomes.set(t.id, t.name);
  }
  const porContato = new Map<string, string[]>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await flwGet(token, "/core/v1/contact", { pageSize: PAGE_SIZE, pageNumber: page, IncludeDetails: "Tags" });
    for (const c of (body?.items ?? []) as Array<{ id?: string; tagIds?: string[] | null }>) {
      const tags = (c.tagIds ?? []).map((id) => nomes.get(id)).filter((n): n is string => !!n);
      if (c.id && tags.length) porContato.set(c.id, tags);
    }
    if (!body?.hasMorePages) return { porContato, parcial: false };
    if (deadlineMs && Date.now() > deadlineMs) return { porContato, parcial: true };
  }
  return { porContato, parcial: true };
}

export async function runFlwChatSync(env: FlwChatSyncEnv): Promise<FlwChatSyncResult[]> {
  const supabase: SupabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = supabase
    .from("crm_connections")
    .select("id, client_id, access_token, config")
    .eq("provider", "flwchat")
    .eq("active", true);
  if (env.onlyClientId) query = query.eq("client_id", env.onlyClientId);
  const { data: connections, error } = await query;
  if (error) throw error;

  const results: FlwChatSyncResult[] = [];

  for (const conn of connections ?? []) {
    const errors: string[] = [];
    const token = conn.access_token as string | null;
    const config = (conn.config ?? {}) as {
      panel_ids?: string[];
      painel_desde?: Record<string, string>;
      etapas_ganho?: string[];
      etapas_perdido?: string[];
      tags_contato?: boolean;
    };
    // Mapeamento confirmado pela equipe (aba "A analisar"). Tabela ausente = sem mapeamento.
    const confirmadas = new Map<string, "won" | "lost" | "open">();
    {
      const { data: maps } = await supabase
        .from("crm_etapa_resultado")
        .select("pipeline_id, status_id, outcome")
        .eq("crm_connection_id", conn.id);
      for (const m of maps ?? []) confirmadas.set(`${m.pipeline_id}|${m.status_id}`, m.outcome as "won" | "lost" | "open");
    }
    const resultadoDaEtapa = (nome: string): "won" | "lost" | "open" => {
      const n = nome.toLowerCase();
      if ((config.etapas_perdido ?? []).some((t) => n.includes(t.toLowerCase()))) return "lost";
      if ((config.etapas_ganho ?? []).some((t) => n.includes(t.toLowerCase()))) return "won";
      return "open";
    };
    const panelIds = (config.panel_ids ?? []).filter((p) => typeof p === "string" && p.length > 0);

    if (!token) {
      results.push({ clientId: conn.client_id, connectionId: conn.id, paineis: 0, cards: 0, errors: ["Conexão sem access_token"] });
      continue;
    }
    if (panelIds.length === 0) {
      results.push({
        clientId: conn.client_id,
        connectionId: conn.id,
        paineis: 0,
        cards: 0,
        errors: ["Conexão sem config.panel_ids (a API não lista os painéis de vendas, os IDs vêm da URL do painel)"],
      });
      continue;
    }

    let tagsPorContato = new Map<string, string[]>();
    if (config.tags_contato) {
      try {
        const t = await tagsDosContatos(token, env.deadlineMs);
        tagsPorContato = t.porContato;
        if (t.parcial) errors.push("tags dos contatos: leitura interrompida por tempo, a origem pela tag fica incompleta nesta rodada");
      } catch (err) {
        errors.push(`tags dos contatos: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const stageRows: Record<string, unknown>[] = [];
    const leadRows: Record<string, unknown>[] = [];
    let paineisLidos = 0;

    for (const panelId of panelIds) {
      try {
        const panel = (await flwGet(token, `/crm/v1/panel/${panelId}`, { includeDetails: "Steps" })) as FlwPanel;
        const panelName = String(panel.title ?? panelId);
        const stepNames = new Map<string, string>();
        for (const s of panel.steps ?? []) {
          if (!s?.id) continue;
          const nome = String(s.title ?? s.id);
          stepNames.set(s.id, nome);
          stageRows.push({
            crm_connection_id: conn.id,
            pipeline_id: panelId,
            pipeline_name: panelName,
            status_id: s.id,
            status_name: nome,
          });
        }

        const { cards, parcial } = await fetchCards(token, panelId, env.deadlineMs);
        if (parcial) errors.push(`${panelName}: listagem interrompida por tempo, o restante entra na próxima rodada`);
        paineisLidos++;

        const desde = config.painel_desde?.[panelId] ?? null;
        for (const c of cards) {
          if (!c?.id) continue;
          const titulo = String(c.title ?? "").trim();
          if (/^teste/i.test(titulo)) continue;
          if (desde && c.createdAt && c.createdAt.slice(0, 10) < desde) continue;
          const origem = c.customFields?.["origem-do-lead"];
          const procedimento = procedimentoDaDescricao((c as { description?: unknown }).description);
          const tagsContato = tagsPorContato.get(c.contactIds?.[0] ?? "") ?? [];
          const origemTag = origemDasTags(tagsContato);
          leadRows.push({
            crm_connection_id: conn.id,
            client_id: conn.client_id,
            provider: "flwchat",
            external_lead_id: c.id,
            event_type: "sync",
            status_id: c.stepId ?? null,
            pipeline_id: panelId,
            price: typeof c.monetaryAmount === "number" && c.monetaryAmount > 0 ? c.monetaryAmount : null,
            occurred_at: c.createdAt ?? null,
            outcome: confirmadas.get(`${panelId}|${c.stepId ?? ""}`) ?? resultadoDaEtapa(stepNames.get(c.stepId ?? "") ?? ""),
            source: origemTag
              ?? (typeof origem === "string" && origem.trim()
                ? origem.trim()
                : origemDaDescricao((c as { description?: unknown }).description)),
            contact_name: titulo || null,
            raw_payload: {
              ...c,
              ...(procedimento ? { custom_fields_values: [{ field_name: "Tipo de Procedimento", values: [{ value: procedimento }] }] } : {}),
              ...(tagsContato.length ? { contato_tags: tagsContato, contato_tipo: tipoDasTags(tagsContato) } : {}),
            } as unknown as Record<string, unknown>,
            received_at: c.updatedAt ?? c.createdAt ?? new Date().toISOString(),
          });
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    let gravados = 0;
    for (const batch of chunk(leadRows, BATCH_SIZE)) {
      const { error: upsertError } = await supabase
        .from("crm_leads")
        .upsert(batch, { onConflict: "crm_connection_id,external_lead_id" });
      if (upsertError) errors.push(`cards (${batch.length}): ${upsertError.message}`);
      else gravados += batch.length;
    }

    if (stageRows.length > 0) {
      const { error: stageError } = await supabase
        .from("crm_pipeline_statuses")
        .upsert(stageRows, { onConflict: "crm_connection_id,pipeline_id,status_id" });
      if (stageError) errors.push(`etapas: ${stageError.message}`);
    }

    results.push({ clientId: conn.client_id, connectionId: conn.id, paineis: paineisLidos, cards: gravados, errors });
  }

  return results;
}
