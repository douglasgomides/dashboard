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
import { fetchComRetry } from "./integration-http.js";

const FLW_BASE = "https://api.wts.chat";
const PAGE_SIZE = 100;
const BATCH_SIZE = 500;
// Trava de segurança: 150 páginas x 100 = 15 mil cards por painel. Com 50 (5 mil) a Dra. Juliana Paola, com 4.276
// cards e a API listando do mais antigo para o mais novo, ia perder justamente os cards novos (auditoria 30/10/2026).
const MAX_PAGES = 150;

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
  /** Situação que não é erro (ex.: leitura das tags ainda em andamento). Não vai para last_error. */
  avisos?: string[];
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
  const res = await fetchComRetry(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`FlwChat ${path} falhou (${res.status}): ${(await res.text()).slice(0, 160)}`);
  }
  return res.json();
}

/** Abertos no Nexo que não vieram na lista completa do painel. null quando a lista parece incompleta (menos da
 *  metade dos abertos): melhor não fechar nada do que fechar o painel inteiro por uma resposta ruim da API. */
export function cardsFechadosNaOrigem(abertosNoNexo: string[], vistos: Set<string>): string[] | null {
  const fechados = abertosNoNexo.filter((id) => !vistos.has(id));
  if (abertosNoNexo.length >= 20 && vistos.size < abertosNoNexo.length / 2) return null;
  return fechados;
}

async function fetchCards(token: string, panelId: string, deadlineMs?: number): Promise<{ cards: FlwCard[]; parcial: boolean; teto?: boolean }> {
  const all: FlwCard[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await flwGet(token, "/crm/v1/panel/card", { panelId, pageSize: PAGE_SIZE, pageNumber: page });
    all.push(...((body?.items ?? []) as FlwCard[]));
    if (!body?.hasMorePages) return { cards: all, parcial: false };
    if (deadlineMs && Date.now() > deadlineMs) return { cards: all, parcial: true };
  }
  return { cards: all, parcial: true, teto: true };
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

// Leitura das tags dos contatos em partes, com retomada. A conta da Clinic Desk tem mais de 24 mil contatos e a
// leitura inteira não cabe numa rodada: antes ela parava na página 50 e os cards cujo contato não tinha sido lido
// eram gravados SEM a tag, apagando a origem que já existia. Agora:
//  - as tags lidas ficam em crm_contato_tags (só cresce; um contato sem tag é gravado com lista vazia);
//  - a primeira leitura percorre todos os contatos por data de criação, em várias rodadas, guardando a página em
//    config.tags_varredura; ao terminar, config.tags_ate recebe o início da varredura;
//  - depois, cada rodada lê só os contatos alterados desde config.tags_ate (ordem por alteração, mais novo primeiro);
//  - enquanto a primeira leitura não termina, a origem pela tag fica Parcial.
export interface EstadoTags {
  tags_ate?: string | null;
  /** ordem "desc": do contato mais novo para o mais antigo. Varredura sem ordem é da versão antiga (crescente). */
  tags_varredura?: { pagina: number; inicio: string; ordem?: "desc" } | null;
}

export interface PaginaContatos {
  itens: Array<{ id?: string; tagIds?: string[] | null; updatedAt?: string | null }>;
  temMais: boolean;
  totalPaginas?: number;
}

export const MAX_PAGINAS_TAGS = 120;
const TEMPO_TAGS_MS = 60_000;

export async function lerTagsDosContatos(opts: {
  estado: EstadoTags;
  nomes: Map<string, string>;
  buscarPagina: (modo: "varredura" | "alteracoes", pagina: number) => Promise<PaginaContatos>;
  salvar: (linhas: Array<{ contato_id: string; tags: string[]; atualizado_em: string | null }>) => Promise<void>;
  agora: string;
  deadlineMs?: number;
  maxPaginas?: number;
}): Promise<{ estado: EstadoTags; completa: boolean; aviso: string | null }> {
  const max = opts.maxPaginas ?? MAX_PAGINAS_TAGS;
  const paraLinha = (c: PaginaContatos["itens"][number]) => ({
    contato_id: c.id!,
    tags: (c.tagIds ?? []).map((id) => opts.nomes.get(id)).filter((n): n is string => !!n),
    atualizado_em: c.updatedAt ?? null,
  });
  // Varredura iniciada na ordem antiga (crescente) recomeça na ordem nova: retomar da página onde parou pularia os
  // contatos mais novos. O que já foi lido continua guardado.
  const emAndamento = opts.estado.tags_varredura?.ordem === "desc" ? opts.estado.tags_varredura : null;
  const recomecar = !!opts.estado.tags_varredura && !emAndamento;
  const varredura = emAndamento ?? (opts.estado.tags_ate && !recomecar ? null : { pagina: 1, inicio: opts.agora, ordem: "desc" as const });

  if (varredura) {
    let pagina = varredura.pagina;
    let total: number | undefined;
    for (let lidas = 0; lidas < max; lidas++, pagina++) {
      const p = await opts.buscarPagina("varredura", pagina);
      total = p.totalPaginas ?? total;
      await opts.salvar(p.itens.filter((c) => c.id).map(paraLinha));
      if (!p.temMais) return { estado: { tags_ate: varredura.inicio, tags_varredura: null }, completa: true, aviso: null };
      if (opts.deadlineMs && Date.now() > opts.deadlineMs) { pagina++; break; }
      if (lidas === max - 1) { pagina++; break; }
    }
    return {
      estado: { tags_ate: opts.estado.tags_ate ?? null, tags_varredura: { pagina, inicio: varredura.inicio, ordem: "desc" } },
      completa: false,
      aviso: `tags dos contatos: primeira leitura em andamento (página ${pagina - 1}${total ? ` de ${total}` : ""}); a origem pela tag fica parcial até terminar`,
    };
  }

  // Só as alterações desde a última leitura completa. O marco só avança quando chega ao fim do que mudou.
  const desde = opts.estado.tags_ate!;
  let maior = desde;
  for (let pagina = 1; pagina <= max; pagina++) {
    const p = await opts.buscarPagina("alteracoes", pagina);
    const novos = p.itens.filter((c) => c.id && (c.updatedAt ?? "") > desde);
    await opts.salvar(novos.map(paraLinha));
    for (const c of novos) if ((c.updatedAt ?? "") > maior) maior = c.updatedAt!;
    const chegouAoMarco = novos.length < p.itens.length;
    if (!p.temMais || chegouAoMarco) return { estado: { tags_ate: maior, tags_varredura: null }, completa: true, aviso: null };
    if (opts.deadlineMs && Date.now() > opts.deadlineMs) break;
  }
  return {
    estado: { tags_ate: desde, tags_varredura: null },
    completa: true,
    aviso: "tags dos contatos: as alterações não couberam nesta rodada e continuam na próxima",
  };
}

async function nomesDasTags(token: string): Promise<Map<string, string>> {
  const nomes = new Map<string, string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await flwGet(token, "/core/v1/tag", { pageSize: 200, pageNumber: page });
    const itens = (Array.isArray(body) ? body : (body?.items ?? [])) as Array<{ id?: string; name?: string }>;
    for (const t of itens) if (t?.id && t.name) nomes.set(t.id, t.name);
    if (Array.isArray(body) || !body?.hasMorePages) break;
  }
  return nomes;
}

export async function tagsDaConexao(supabase: SupabaseClient, connId: string): Promise<Map<string, string[]>> {
  const porContato = new Map<string, string[]>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("crm_contato_tags")
      .select("contato_id, tags")
      .eq("crm_connection_id", connId)
      .neq("tags", "{}")
      .order("contato_id")
      .range(de, de + 999);
    if (error) throw error;
    for (const r of data ?? []) porContato.set(r.contato_id as string, r.tags as string[]);
    if ((data ?? []).length < 1000) return porContato;
  }
}

// Support Clinic → WTS (Dr. Sergio Maia): cada mudança de status do orçamento cria um card NOVO no painel, e o card
// antigo do mesmo item fica parado em Pendente ou Orçado. Em 2.895 cards, 458 abertos tinham um card mais novo do mesmo
// paciente e procedimento (339 viraram Liberado). Contados como "em aberto", inflavam o funil e o "esfriou".
// Com config.cards_por_item, o card aberto que tem um card mais novo do mesmo item (painel + contato + procedimento)
// é marcado em removido_na_origem, como os cards que somem do CRM, e guarda o id do card que o substituiu. Liberado
// repetido no mesmo dia e com o mesmo valor também é marcado (cópia). A marcação é refeita a cada sync.
type LinhaCard = Record<string, unknown> & { outcome?: unknown; occurred_at?: unknown; price?: unknown; pipeline_id?: unknown; raw_payload?: Record<string, unknown> };

export function marcarSubstituidos<T extends LinhaCard>(
  linhas: T[],
  agora: string,
): Array<T & { removido_na_origem: string | null; raw_payload: NonNullable<T["raw_payload"]> & { substituido_por: string | null } }> {
  const chave = (l: T) => {
    const raw = l.raw_payload ?? {};
    const contato = Array.isArray(raw.contactIds) ? String(raw.contactIds[0] ?? "") : "";
    const campos = Array.isArray(raw.custom_fields_values) ? (raw.custom_fields_values as Array<{ values?: Array<{ value?: unknown }> }>) : [];
    const proc = String(campos[0]?.values?.[0]?.value ?? "").trim().toLowerCase();
    return contato && proc ? `${String(l.pipeline_id ?? "")}|${contato}|${proc}` : null;
  };
  const ordem = (l: T) => Number(l.raw_payload?.number ?? 0) || Date.parse(String(l.occurred_at ?? "")) || 0;
  const grupos = new Map<string, T[]>();
  for (const l of linhas) {
    const k = chave(l);
    if (k) grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const marcados = new Map<T, string>();
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => ordem(a) - ordem(b));
    g.forEach((l, i) => {
      const prox = g[i + 1];
      if (!prox) return;
      if (l.outcome === "open") marcados.set(l, String(prox.raw_payload?.id ?? ""));
    });
    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1], b = g[i];
      const mesmoDia = String(a.occurred_at ?? "").slice(0, 10) === String(b.occurred_at ?? "").slice(0, 10);
      if (a.outcome === "won" && b.outcome === "won" && mesmoDia && (a.price ?? null) === (b.price ?? null)) marcados.set(b, String(a.raw_payload?.id ?? ""));
    }
  }
  return linhas.map((l) => {
    const por = marcados.get(l);
    return {
      ...l,
      removido_na_origem: por !== undefined ? agora : null,
      raw_payload: { ...(l.raw_payload ?? {}), substituido_por: por ?? null },
    };
  });
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
    const avisos: string[] = [];
    const token = conn.access_token as string | null;
    const config = (conn.config ?? {}) as {
      panel_ids?: string[];
      painel_desde?: Record<string, string>;
      etapas_ganho?: string[];
      etapas_perdido?: string[];
      tags_contato?: boolean;
      cards_por_item?: boolean;
    } & EstadoTags;
    // Mapeamento confirmado pela equipe (aba "A analisar"). Se a leitura falhar, a conexão para aqui: regravar os
    // cards sem o mapeamento transformava todos os ganhos em "em aberto" (Dr. Sergio Maia: 1.818 ganhos dependem só
    // dele) e a rodada ficava registrada como sucesso (auditoria de 01/11/2026).
    const confirmadas = new Map<string, "won" | "lost" | "open">();
    {
      const { data: maps, error: erroMapa } = await supabase
        .from("crm_etapa_resultado")
        .select("pipeline_id, status_id, outcome")
        .eq("crm_connection_id", conn.id);
      if (erroMapa) {
        results.push({ clientId: conn.client_id, connectionId: conn.id, paineis: 0, cards: 0, errors: ["Não foi possível ler o significado das etapas (crm_etapa_resultado); cards não regravados nesta rodada"] });
        continue;
      }
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
        const nomes = await nomesDasTags(token);
        const leitura = await lerTagsDosContatos({
          estado: { tags_ate: config.tags_ate ?? null, tags_varredura: config.tags_varredura ?? null },
          nomes,
          agora: new Date().toISOString(),
          // Teto próprio: a leitura das tags vem antes dos cards e não pode gastar o tempo da rodada inteira.
          deadlineMs: Math.min(env.deadlineMs ?? Number.POSITIVE_INFINITY, Date.now() + TEMPO_TAGS_MS),
          buscarPagina: async (modo, pagina) => {
            const body = await flwGet(token, "/core/v1/contact", {
              pageSize: PAGE_SIZE,
              pageNumber: pagina,
              IncludeDetails: "Tags",
              // Do mais novo para o mais antigo também na primeira leitura: os contatos dos leads recentes são os que
              // contam nos números do período (antes, em ordem crescente, 776 dos 805 leads recentes da Juliana Paola
              // ficavam sem a tag lida até a varredura inteira acabar).
              orderBy: modo === "varredura" ? "createdAt" : "updatedAt",
              orderDirection: "DESCENDING",
            });
            return { itens: body?.items ?? [], temMais: !!body?.hasMorePages, totalPaginas: body?.totalPages };
          },
          salvar: async (linhas) => {
            if (!linhas.length) return;
            const { error: e } = await supabase
              .from("crm_contato_tags")
              .upsert(linhas.map((l) => ({ crm_connection_id: conn.id, ...l, lido_em: new Date().toISOString() })), { onConflict: "crm_connection_id,contato_id" });
            if (e) throw e;
          },
        });
        // Leitura em andamento não é falha: antes ia para last_error e acendia "sync com erro" (Juliana Paola e Mariela).
        if (leitura.aviso) avisos.push(leitura.aviso);
        const { error: e } = await supabase
          .from("crm_connections")
          .update({ config: { ...(conn.config ?? {}), ...leitura.estado } })
          .eq("id", conn.id);
        if (e) errors.push(`tags dos contatos: não deu para guardar o progresso (${e.message})`);
      } catch (err) {
        errors.push(`tags dos contatos: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Sempre do que já foi guardado: um contato que não foi lido nesta rodada mantém a tag da rodada anterior.
      try {
        tagsPorContato = await tagsDaConexao(supabase, conn.id);
      } catch (err) {
        errors.push(`tags guardadas: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const stageRows: Record<string, unknown>[] = [];
    const leadRows: Record<string, unknown>[] = [];
    let paineisLidos = 0;
    // Painéis listados por inteiro nesta rodada, com todos os ids vistos (inclusive os ignorados por teste ou data).
    const vistosPorPainel = new Map<string, Set<string>>();

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

        const { cards, parcial, teto } = await fetchCards(token, panelId, env.deadlineMs);
        if (teto) errors.push(`${panelName}: passou de ${MAX_PAGES * PAGE_SIZE} cards, o teto de leitura; os mais recentes podem ter ficado de fora`);
        else if (parcial) errors.push(`${panelName}: listagem interrompida por tempo, o restante entra na próxima rodada`);
        paineisLidos++;
        if (!parcial && !teto) vistosPorPainel.set(panelId, new Set(cards.map((c) => String(c?.id ?? "")).filter(Boolean)));

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
    const linhas = config.cards_por_item ? marcarSubstituidos(leadRows, new Date().toISOString()) : leadRows;
    for (const batch of chunk(linhas, BATCH_SIZE)) {
      const { error: upsertError } = await supabase
        .from("crm_leads")
        .upsert(batch, { onConflict: "crm_connection_id,external_lead_id" });
      if (upsertError) errors.push(`cards (${batch.length}): ${upsertError.message}`);
      else gravados += batch.length;
    }

    // A API só lista cards abertos: o que estava aberto no Nexo e sumiu da lista completa do painel foi fechado no
    // FlwChat (ganho ou perdido, a API não diz). Vira "closed" (fechado, resultado não informado) em vez de seguir
    // aberto para sempre. Se voltar a aparecer, o upsert acima devolve o resultado da etapa.
    if (gravados === linhas.length) {
      for (const [panelId, vistos] of vistosPorPainel) {
        try {
          const abertos: string[] = [];
          for (let de = 0; ; de += 1000) {
            const { data, error } = await supabase.from("crm_leads").select("external_lead_id")
              .eq("crm_connection_id", conn.id).eq("pipeline_id", panelId).eq("outcome", "open").is("removido_na_origem", null)
              .order("external_lead_id").range(de, de + 999);
            if (error) throw new Error(error.message);
            abertos.push(...(data ?? []).map((r) => String(r.external_lead_id)));
            if ((data?.length ?? 0) < 1000) break;
          }
          const fechados = cardsFechadosNaOrigem(abertos, vistos);
          if (fechados === null) {
            avisos.push(`painel ${panelId}: a lista veio com menos da metade dos cards abertos; nenhum card foi dado como fechado nesta rodada`);
            continue;
          }
          for (const lote of chunk(fechados, 300)) {
            const { error } = await supabase.from("crm_leads").update({ outcome: "closed" })
              .eq("crm_connection_id", conn.id).eq("pipeline_id", panelId).eq("outcome", "open").in("external_lead_id", lote);
            if (error) throw new Error(error.message);
          }
        } catch (err) {
          errors.push(`cards fechados no painel ${panelId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (stageRows.length > 0) {
      const { error: stageError } = await supabase
        .from("crm_pipeline_statuses")
        .upsert(stageRows, { onConflict: "crm_connection_id,pipeline_id,status_id" });
      if (stageError) errors.push(`etapas: ${stageError.message}`);
    }

    // Tags do contato lidas e guardadas chegam também aos cards que não estão mais abertos (a API só relista os abertos).
    if (config.tags_contato) {
      const { error: eAplicar } = await supabase.rpc("crm_aplicar_tags_contato", { p_connection_id: conn.id });
      if (eAplicar) errors.push(`aplicar tags nos cards: ${eAplicar.message}`);
    }
    results.push({ clientId: conn.client_id, connectionId: conn.id, paineis: paineisLidos, cards: gravados, errors, avisos });
  }

  return results;
}
