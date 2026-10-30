/**
 * Sync WTS Chat → Supabase para atendimento no WhatsApp.
 *
 * Roda pelo endpoint HTTP (api/sync/wts.ts) que o n8n chama todo dia, e
 * também pelo botão "Sincronizar atendimento" dentro do dashboard.
 *
 * Três armadilhas desta API, todas descobertas testando contra a conta real,
 * e todas silenciosas — é por isso que este arquivo é do jeito que é:
 *
 * 1. FILTRO DE DATA DE CRIAÇÃO NÃO FUNCIONA. Testei quinze grafias
 *    (CreatedAt.Gt, StartDate, Period.Start, From, MinCreatedAt...). A API
 *    aceita todas, não filtra nenhuma e devolve a base inteira como se tivesse
 *    filtrado. Exceção confirmada em 30/10/2026: UpdatedAt.After filtra (usado
 *    para reler as sessões alteradas depois do corte). O mesmo vale para ChannelId e TagIds. Só Status e DepartmentId
 *    filtram de verdade. Por isso a janela aqui é feita paginando do mais novo
 *    para o mais velho e parando na marca — nunca confie num parâmetro de data.
 *
 * 2. PageSize > 100 devolve erro 500 com corpo de validação, não um 400.
 *
 * 3. Path inexistente responde 401 "Acesso negado", não 404. Rota errada se
 *    parece exatamente com falta de permissão.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";

const WTS_BASE = "https://api.wts.chat";
const PAGE_SIZE = 100;

// Teto de segurança: a conta tem ~37 mil sessões, então um backfill completo
// são ~370 páginas. O limite existe para uma função da Vercel não rodar até o
// timeout sem gravar nada.
/** Páginas de sessões alteradas depois do corte relidas por rodada. */
const MAX_PAGINAS_MEXIDAS = 20;
const MAX_PAGINAS = 400;

export type WtsSyncEnv = {
  wtsToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Janela móvel em dias. Ignorado quando `full` é true. */
  syncDays?: number;
  /** Backfill: varre tudo, sem marca de corte. */
  full?: boolean;
  clientId?: string;
};

export type WtsSyncResult = {
  client_id: string;
  client_name: string;
  company_id: string;
  paginas: number;
  sessoes: number;
  departamentos: number;
  agentes: number;
  mais_antiga?: string;
  mais_recente?: string;
  errors: string[];
};

type WtsSession = {
  id: string;
  createdAt: string;
  startAt?: string | null;
  endAt?: string | null;
  status?: string | null;
  departmentId?: string | null;
  userId?: string | null;
  channelId?: string | null;
  contactId?: string | null;
  timeWait?: string | null;
  timeService?: string | null;
  firstResponseAt?: string | null;
};

async function wtsGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${WTS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  const texto = await res.text();
  if (!res.ok) {
    // Vale repetir: 401 aqui costuma ser rota errada, não token inválido.
    throw new Error(`WTS ${path} respondeu ${res.status}: ${texto.slice(0, 300)}`);
  }
  return JSON.parse(texto) as T;
}

/** "00:40:45" → 2445. Devolve null para vazio ou formato inesperado. */
export function duracaoParaSegundos(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const partes = String(valor).split(":");
  if (partes.length !== 3) return null;
  const [h, m, s] = partes.map((p) => Number(p));
  if (![h, m, s].every((n) => Number.isFinite(n))) return null;
  return h * 3600 + m * 60 + Math.trunc(s);
}

async function sincronizarDepartamentos(
  supabase: SupabaseClient<Database>,
  token: string,
  clientId: string,
): Promise<number> {
  const deps = await wtsGet<Array<{ id: string; name: string }>>(token, "/core/v1/department");
  if (deps.length === 0) return 0;
  const linhas = deps.map((d) => ({
    client_id: clientId,
    department_id: d.id,
    name: d.name,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("wts_departments").upsert(linhas, {
    onConflict: "client_id,department_id",
  });
  if (error) throw new Error(`departamentos: ${error.message}`);
  return linhas.length;
}

async function sincronizarAgentes(
  supabase: SupabaseClient<Database>,
  token: string,
  clientId: string,
): Promise<number> {
  const agentes = await wtsGet<
    Array<{ id: string; userId: string | null; name: string; email: string | null; profile: string | null }>
  >(token, "/core/v1/agent");

  // A sessão referencia `userId`, não o `id` do agente. Guardar o id erraria
  // o join e a tela mostraria todo mundo como "agente desconhecido".
  const linhas = agentes
    .filter((a) => a.userId)
    .map((a) => ({
      client_id: clientId,
      user_id: a.userId as string,
      name: a.name ?? "(sem nome)",
      email: a.email,
      profile: a.profile,
      updated_at: new Date().toISOString(),
    }));
  if (linhas.length === 0) return 0;
  const { error } = await supabase.from("wts_agents").upsert(linhas, { onConflict: "client_id,user_id" });
  if (error) throw new Error(`agentes: ${error.message}`);
  return linhas.length;
}

function linhaDaSessao(clientId: string, s: WtsSession) {
  return {
    client_id: clientId,
    session_id: s.id,
    started_at: s.startAt ?? s.createdAt,
    ended_at: s.endAt ?? null,
    status: s.status ?? null,
    department_id: s.departmentId ?? null,
    user_id: s.userId ?? null,
    channel_id: s.channelId ?? null,
    contact_id: s.contactId ?? null,
    wait_seconds: duracaoParaSegundos(s.timeWait),
    service_seconds: duracaoParaSegundos(s.timeService),
    first_response_at: s.firstResponseAt ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function runWtsSync(env: WtsSyncEnv): Promise<WtsSyncResult[]> {
  const supabase = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const consulta = supabase
    .from("clients")
    .select("id, name, wts_company_id, wts_department_ids, wts_api_token")
    .eq("active", true)
    .not("wts_company_id", "is", null);
  const { data: clientes, error: erroClientes } = await consulta;
  if (erroClientes) throw new Error(erroClientes.message);
  if (!clientes || clientes.length === 0) return [];

  const dias = env.syncDays ?? 7;
  const corte = env.full ? null : new Date(Date.now() - dias * 86400_000);

  /*
   * Uma conta da WTS pode servir mais de um cliente.
   *
   * Dra. Juliana Paola e Mariela Muniz atendem na mesma clínica, no mesmo
   * WhatsApp. O que separa as duas é a EQUIPE que atendeu — nada mais separa:
   * tag do contato, número e agente foram testados e não dividem.
   *
   * Por isso o laço é por CONTA, não por cliente. Puxar a conta uma vez por
   * cliente traria as mesmas conversas três vezes e daria todas para os três.
   * Cada conversa é entregue a quem reivindica a equipe dela; o cliente sem
   * equipes declaradas (wts_department_ids nulo) recebe o resto — hoje isso é
   * o balde "Geral", que sozinho é 60% do volume e não pertence a nenhuma
   * das médicas.
   */
  const porConta = new Map<string, typeof clientes>();
  for (const c of clientes) {
    const conta = c.wts_company_id as string;
    if (!porConta.has(conta)) porConta.set(conta, []);
    (porConta.get(conta) as typeof clientes).push(c);
  }

  const resultados: WtsSyncResult[] = [];

  for (const [conta, donosDaConta] of porConta) {
    // O sync de um cliente também precisa conhecer os demais donos da conta.
    // Filtrar antes do roteamento fazia o cliente "Geral" receber as sessões
    // privadas das equipes dos outros clientes.
    const donos = donosDaConta.filter((c) => !env.clientId || c.id === env.clientId);
    if (donos.length === 0) continue;
    // Cada conta WTS pode ter token proprio (cliente com conta separada, como o
    // Dr. Sergio Maia). Usa o token de qualquer dono da conta; se nenhum tiver,
    // cai no token global (env.wtsToken).
    const contaToken =
      (donosDaConta.find((c) => c.wts_api_token)?.wts_api_token as string | undefined) ?? env.wtsToken;
    const curingas = donosDaConta.filter((c) => !c.wts_department_ids || c.wts_department_ids.length === 0);
    const curinga = curingas.length === 1 ? curingas[0] : undefined;
    const porEquipe = new Map<string, string>();
    const equipesAmbiguas = new Set<string>();
    for (const c of donosDaConta) {
      for (const dep of c.wts_department_ids ?? []) {
        if (porEquipe.has(dep) && porEquipe.get(dep) !== c.id) equipesAmbiguas.add(dep);
        porEquipe.set(dep, c.id);
      }
    }

    const res = new Map<string, WtsSyncResult>();
    for (const c of donos) {
      res.set(c.id, {
        client_id: c.id,
        client_name: c.name,
        company_id: conta,
        paginas: 0,
        sessoes: 0,
        departamentos: 0,
        agentes: 0,
        errors: [
          ...(curingas.length > 1 ? ["Conta WTS com vários clientes sem equipes: sessões sem dono explícito não serão importadas"] : []),
          ...(equipesAmbiguas.size ? ["Conta WTS com equipes vinculadas a mais de um cliente: sessões ambíguas não serão importadas"] : []),
        ],
      });
    }

    // Equipes e agentes valem para a conta inteira: gravados para todos os
    // clientes dela, senão o join da tela devolve "(agente desconhecido)".
    for (const c of donos) {
      const r = res.get(c.id) as WtsSyncResult;
      try {
        r.departamentos = await sincronizarDepartamentos(supabase, contaToken, c.id);
        r.agentes = await sincronizarAgentes(supabase, contaToken, c.id);
      } catch (err) {
        r.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    // Conta com mais de um cliente: o card do FlwChat diz de quem é a sessão (raw_payload.sessionId do card). Vale
    // antes da equipe: o atendimento da Juliana Paola caía na Mariela pela equipe "curinga" (auditoria de 30/10/2026:
    // 265 conversas). Sessão com card nos dois clientes fica pela regra da equipe.
    const donoPeloCard = new Map<string, string>();
    if (donosDaConta.length > 1) {
      const ambiguas = new Set<string>();
      leitura: for (const c of donosDaConta) {
        for (let de = 0; de < 50_000; de += 1000) {
          const { data, error } = await supabase.from("crm_leads").select("raw_payload->>sessionId").eq("client_id", c.id).eq("provider", "flwchat").not("raw_payload->>sessionId", "is", null).range(de, de + 999);
          // Sem os cards, segue pela regra da equipe (como antes), sem derrubar o sync.
          if (error) { donoPeloCard.clear(); break leitura; }
          for (const row of (data ?? []) as unknown as { sessionId: string | null }[]) {
            if (!row.sessionId) continue;
            const atual = donoPeloCard.get(row.sessionId);
            if (atual && atual !== c.id) ambiguas.add(row.sessionId);
            donoPeloCard.set(row.sessionId, c.id);
          }
          if ((data ?? []).length < 1000) break;
        }
      }
      for (const id of ambiguas) donoPeloCard.delete(id);
    }

    // Agrupa por dono antes de gravar: um upsert por cliente, não por linha.
    const gravarLote = async (lote: WtsSession[], onde: string) => {
      const porDono = new Map<string, ReturnType<typeof linhaDaSessao>[]>();
      for (const s of lote) {
        const peloCard = donoPeloCard.get(s.id);
        if (!peloCard && s.departmentId && equipesAmbiguas.has(s.departmentId)) continue;
        const donoId = peloCard ?? (s.departmentId ? porEquipe.get(s.departmentId) : undefined) ?? curinga?.id;
        // Sem equipe reivindicada e sem curinga, a conversa não tem dono.
        // Descartar em silêncio esconderia volume, então ela simplesmente
        // não é gravada e isso aparece na diferença entre total e somatório.
        if (!donoId || !res.has(donoId)) continue;
        if (!porDono.has(donoId)) porDono.set(donoId, []);
        (porDono.get(donoId) as ReturnType<typeof linhaDaSessao>[]).push(linhaDaSessao(donoId, s));
      }
      for (const [donoId, linhas] of porDono) {
        const r = res.get(donoId) as WtsSyncResult;
        const { error } = await supabase
          .from("wts_sessions")
          .upsert(linhas, { onConflict: "client_id,session_id" });
        if (error) {
          r.errors.push(`sessões ${onde}: ${error.message}`);
          continue;
        }
        r.sessoes += linhas.length;
        const datas = linhas.map((l) => l.started_at).sort();
        r.mais_antiga = r.mais_antiga && r.mais_antiga < datas[0] ? r.mais_antiga : datas[0];
        const ultima = datas[datas.length - 1];
        r.mais_recente = r.mais_recente && r.mais_recente > ultima ? r.mais_recente : ultima;
      }
    };

    try {
      let pagina = 1;
      let acabou = false;

      while (!acabou && pagina <= MAX_PAGINAS) {
        const url =
          `/chat/v1/session?PageSize=${PAGE_SIZE}&PageNumber=${pagina}` +
          `&OrderBy=createdat&OrderDirection=DESCENDING`;
        const resposta = await wtsGet<{ items: WtsSession[]; hasMorePages: boolean }>(contaToken, url);
        if (!Array.isArray(resposta?.items)) throw new Error("WTS devolveu página de sessões inválida");
        const itens = resposta.items;
        for (const r of res.values()) r.paginas = pagina;

        if (itens.length === 0) break;

        // Ordenação decrescente: a primeira sessão anterior ao corte significa
        // que daqui para trás é tudo antigo. É este passo que substitui o
        // filtro de data, que nesta API não funciona.
        let lote = itens;
        if (corte) {
          const idx = itens.findIndex((s) => new Date(s.createdAt) < corte);
          if (idx >= 0) {
            lote = itens.slice(0, idx);
            acabou = true;
          }
        }

        await gravarLote(lote, `página ${pagina}`);

        if (!resposta.hasMorePages) acabou = true;
        pagina += 1;
      }

      if (pagina > MAX_PAGINAS) {
        for (const r of res.values()) {
          r.errors.push(`parou no teto de ${MAX_PAGINAS} páginas — rode de novo para continuar o backfill`);
        }
      }

      // Sessão criada antes do corte mas mexida depois (fechou, mudou de equipe, ganhou tempo de atendimento): a
      // passada acima para no corte e nunca a relia, então ~15% das "abertas" já estavam fechadas no WTS. Este
      // filtro (UpdatedAt.After) funciona nesta API, ao contrário dos de criação (auditoria de 30/10/2026).
      if (corte) {
        for (let pag = 1; pag <= MAX_PAGINAS_MEXIDAS; pag++) {
          const resposta = await wtsGet<{ items: WtsSession[]; hasMorePages: boolean }>(contaToken,
            `/chat/v1/session?PageSize=${PAGE_SIZE}&PageNumber=${pag}&UpdatedAt.After=${encodeURIComponent(corte.toISOString())}`);
          if (!Array.isArray(resposta?.items)) throw new Error("WTS devolveu página de sessões alteradas inválida");
          await gravarLote(resposta.items.filter((x) => new Date(x.createdAt) < corte), `alteradas página ${pag}`);
          if (!resposta.hasMorePages || resposta.items.length === 0) break;
        }
      }
    } catch (err) {
      for (const r of res.values()) r.errors.push(err instanceof Error ? err.message : String(err));
    }

    for (const r of res.values()) {
      if (r.mais_recente && r.errors.length === 0) {
        const { error } = await supabase.from("wts_sync_state").upsert(
          { client_id: r.client_id, last_session_at: r.mais_recente, updated_at: new Date().toISOString() },
          { onConflict: "client_id" },
        );
        if (error) r.errors.push(`estado do sync: ${error.message}`);
      }
      resultados.push(r);
    }
  }

  return resultados;
}
