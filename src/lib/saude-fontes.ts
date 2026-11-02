// Saúde das fontes de cada cliente: até que data cada fonte tem dado, lido do próprio banco.
// Usa a RPC client_sync_status quando ela existe; se a migração ainda não foi aplicada, lê as
// tabelas com as mesmas regras (RLS vale igual), para o selo e a Visão geral não sumirem.
import { supabase } from "@/integrations/supabase/client";
import { statusDaFonte, diasEntre, hojeBrasilia, FOLGA_META_INSTAGRAM, FONTES, type FonteId, type CorStatus, type Divergencia } from "@/lib/status-fonte";
import { divergenciasAoVivo, type LinhaAoVivoNumeros } from "@/lib/conferencia-ao-vivo";

export type LinhaFonte = {
  fonte: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_rows: number | null;
  data_ate: string | null;
  // Por que está parada, descoberto pelo sync na origem (ex.: erro de pagamento na Meta) e de quem é a ação.
  motivo?: string | null;
  motivo_dono?: string | null;
  /** Última conferência ao vivo desta fonte com diferença (null quando bateu ou não houve rodada). */
  divergencia?: Divergencia | null;
};

/**
 * Divergências da última conferência ao vivo (tabela conferencia_ao_vivo; o admin lê tudo, o membro só o próprio
 * cliente pela RLS). Janela de 14 dias, como o resumo da tela de Conferência. Falha na leitura não derruba o selo:
 * fica sem a informação.
 */
export async function lerDivergencias(clientId?: string): Promise<Map<string, Map<string, Divergencia>>> {
  try {
    const desde = new Date(Date.now() - 14 * 86_400_000).toISOString();
    let q = (supabase as any).from("conferencia_ao_vivo").select("client_id, crm_connection_id, fonte, metrica, ok, nexo, fonte_valor, rodado_em")
      .gte("rodado_em", desde).order("rodado_em", { ascending: false }).limit(5000);
    if (clientId) q = q.eq("client_id", clientId);
    const { data, error } = await q;
    if (error) return new Map();
    return divergenciasAoVivo((data ?? []) as LinhaAoVivoNumeros[]) as Map<string, Map<string, Divergencia>>;
  } catch {
    return new Map();
  }
}

function comDivergencias(linhas: LinhaFonte[], porFonte: Map<string, Divergencia> | undefined): LinhaFonte[] {
  if (!porFonte?.size) return linhas;
  return linhas.map((l) => (porFonte.has(l.fonte) ? { ...l, divergencia: porFonte.get(l.fonte) ?? null } : l));
}

export type Fontes = { tem_instagram: boolean; tem_anuncios: boolean; tem_crm: boolean; tem_atendimento: boolean } | null;

async function ultima(tabela: string, coluna: string, clientId: string): Promise<string | null> {
  const { data } = await (supabase as any)
    .from(tabela)
    .select(coluna)
    .eq("client_id", clientId)
    .not(coluna, "is", null)
    .order(coluna, { ascending: false })
    .limit(1);
  const v = data?.[0]?.[coluna];
  return v ? String(v).slice(0, 10) : null;
}

export async function dadosAte(clientId: string): Promise<LinhaFonte[]> {
  const [igDia, igPost, ads, crm, wts] = await Promise.all([
    ultima("instagram_account_daily_metrics", "date", clientId),
    ultima("instagram_posts", "metrics_updated_at", clientId),
    ultima("meta_ads_daily", "date", clientId),
    // Data do lead, não a da sincronização (o Kommo grava received_at = agora a cada rodada).
    ultima("crm_leads", "occurred_at", clientId).then(async (d) => d ?? (await ultima("crm_leads", "received_at", clientId))),
    // WhatsApp: WTS ou qualquer conversa gravada (Kommo, Clint...), a mesma regra de client_sync_status.
    Promise.all([ultima("wts_sessions", "started_at", clientId), ultima("conversas", "ultima_msg_em", clientId)]).then(([w, c]) => (w && c ? (w > c ? w : c) : (w ?? c))),
  ]);
  // Instagram vale o dado MAIS ANTIGO entre a conta e os posts (caso da Marcelly: posts parados, conta em dia).
  const ig = igDia && igPost ? (igDia < igPost ? igDia : igPost) : (igDia ?? igPost);
  const l = (fonte: string, data_ate: string | null): LinhaFonte => ({
    fonte, last_attempt_at: null, last_success_at: null, last_error: null, last_rows: null, data_ate,
  });
  return [l("instagram", ig), l("anuncios", ads), l("crm", crm), l("atendimento", wts)];
}

// Se a função do banco realmente não existe (migração não aplicada), não insiste por 10 minutos: o console fica limpo
// e cada tela poupa uma chamada. Qualquer OUTRO erro (sessão vencida, instabilidade, 5xx) NÃO trava: antes um erro
// passageiro ficava gravado na aba e o painel passava a usar a leitura reserva, que não traz o motivo da parada
// (pagamento, campanha, token do cliente) e mostrava "sem dado novo na origem" para tudo.
const CHAVE_RPC = "dc:rpc-sync-status-ausente";
const VALIDADE_TRAVA_MS = 10 * 60_000;
const lerTrava = (): boolean => {
  try {
    const t = Number(sessionStorage.getItem(CHAVE_RPC));
    return Number.isFinite(t) && t > 0 && Date.now() - t < VALIDADE_TRAVA_MS;
  } catch {
    return false;
  }
};
let rpcIndisponivel = lerTrava();
const funcaoAusente = (erro: unknown): boolean => {
  const e = erro as { code?: string; status?: number; message?: string } | null;
  return !!e && (e.code === "PGRST202" || e.code === "42883" || e.status === 404 || /could not find the function|does not exist/i.test(e.message ?? ""));
};

export async function statusDoCliente(clientId: string): Promise<LinhaFonte[]> {
  const [linhas, divergencias] = await Promise.all([statusSemConferencia(clientId), lerDivergencias(clientId)]);
  return comDivergencias(linhas, divergencias.get(clientId));
}

async function statusSemConferencia(clientId: string): Promise<LinhaFonte[]> {
  if (rpcIndisponivel && !lerTrava()) { rpcIndisponivel = false; }
  if (rpcIndisponivel) return dadosAte(clientId);
  const cliente = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: LinhaFonte[] | null; error: unknown }>;
  };
  const { data, error } = await cliente.rpc("client_sync_status", { p_client_id: clientId });
  if (!error) return data ?? [];
  if (funcaoAusente(error)) {
    rpcIndisponivel = true;
    try {
      sessionStorage.setItem(CHAVE_RPC, String(Date.now()));
    } catch {
      /* sem storage: só perde a economia de chamada */
    }
  }
  return dadosAte(clientId);
}

/** Dias sem dado novo, contados no fuso de Brasília (mesma conta de status-fonte.ts). */
export function diasDeAtraso(dataAte: string): number {
  return diasEntre(hojeBrasilia(), dataAte);
}

// Feriados nacionais (e pontos facultativos que a clínica costuma folgar) para contar dias úteis. Atualizar todo ano.
const FERIADOS = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04",
  "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-20", "2026-12-25", "2027-01-01",
]);
const isoDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const diaUtil = (ms: number) => {
  const dow = new Date(ms).getUTCDay();
  return dow !== 0 && dow !== 6 && !FERIADOS.has(isoDe(ms));
};

/* Dias úteis (segunda a sexta, sem feriado) depois de dataAte, contando hoje. CRM e WhatsApp só ganham dado em dia de
   expediente: uma sexta sem lead nova seguida de fim de semana e feriado não é uma fonte parada. */
export function diasUteisDeAtraso(dataAte: string, hoje: Date = new Date()): number {
  const [a, m, d] = dataAte.slice(0, 10).split("-").map(Number);
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let n = 0;
  for (let t = Date.UTC(a, m - 1, d) + 86400000; t <= base; t += 86400000) { if (diaUtil(t)) { n++; } }
  return n;
}

/* Atraso de uma fonte: anúncios e Instagram têm dado todo dia (dias corridos); CRM e WhatsApp, só em dia útil. */
export function atrasoDaFonte(l: { fonte?: string; data_ate: string | null; last_success_at?: string | null }): number {
  if (!l.data_ate) { return 0; }
  if (l.fonte === "instagram") {
    const porDado = Math.max(0, diasDeAtraso(l.data_ate) - FOLGA_META_INSTAGRAM);
    return l.last_success_at ? Math.max(porDado, Math.max(0, diasDeAtraso(l.last_success_at.slice(0, 10)))) : porDado;
  }
  return l.fonte === "crm" || l.fonte === "atendimento" ? diasUteisDeAtraso(l.data_ate) : diasDeAtraso(l.data_ate);
}

export type Tom = "bom" | "atencao" | "ruim" | "neutro";
const TOM_DA_COR: Record<CorStatus, Tom> = { verde: "bom", amarelo: "atencao", vermelho: "ruim", cinza: "neutro" };
/** Tom da fonte pela regra única (src/lib/status-fonte.ts). Linha sem data nem erro = sem dado para mostrar. */
export function tomDaFonte(
  l: Pick<LinhaFonte, "data_ate" | "last_error"> & { fonte?: string; last_success_at?: string | null; motivo?: string | null; motivo_dono?: string | null; divergencia?: Divergencia | null } | undefined,
): Tom {
  if (!l || (!l.data_ate && !l.last_error)) return "neutro";
  return TOM_DA_COR[statusDaFonte({
    fonte: l.fonte ?? null, ultimo_sucesso: l.last_success_at ?? null, cadastro: true, data_ate: l.data_ate, last_error: l.last_error,
    motivo: l.motivo ?? null, motivo_dono: l.motivo_dono ?? null, divergencia: l.divergencia ?? null,
  }).cor];
}

// ---------------------------------------------------------------- todos os clientes (admin)

export interface FontesDoCliente {
  fontes: NonNullable<Fontes>; // "ligado" pela regra única (cadastro OU dado OU planilha manual)
  cadastro: NonNullable<Fontes>; // só o cadastro (client_fontes)
  linhas: LinhaFonte[];
  naoUsa: FonteId[];
}

const FLAG: Record<FonteId, keyof NonNullable<Fontes>> = { instagram: "tem_instagram", anuncios: "tem_anuncios", crm: "tem_crm", atendimento: "tem_atendimento" };

/** Uma leitura para todos os clientes (RPC status_das_fontes, só admin). */
export async function lerStatusDasFontes(): Promise<Map<string, FontesDoCliente>> {
  const [{ data, error }, divergencias] = await Promise.all([(supabase as any).rpc("status_das_fontes"), lerDivergencias()]);
  if (error) throw error;
  const out = new Map<string, FontesDoCliente>();
  for (const r of (data ?? []) as any[]) {
    const fonte = r.fonte as FonteId;
    if (!FONTES.includes(fonte)) continue;
    const c = out.get(r.client_id) ?? {
      fontes: { tem_instagram: false, tem_anuncios: false, tem_crm: false, tem_atendimento: false },
      cadastro: { tem_instagram: false, tem_anuncios: false, tem_crm: false, tem_atendimento: false },
      linhas: [],
      naoUsa: [],
    };
    const data_ate = r.data_ate ? String(r.data_ate).slice(0, 10) : null;
    c.cadastro[FLAG[fonte]] = !!r.cadastro;
    c.fontes[FLAG[fonte]] = !!r.cadastro || !!data_ate || r.motivo_dono === "manual";
    c.linhas.push({ fonte, last_attempt_at: r.last_attempt_at, last_success_at: r.last_success_at, last_error: r.last_error, last_rows: null, data_ate, motivo: r.motivo, motivo_dono: r.motivo_dono, divergencia: divergencias.get(r.client_id)?.get(fonte) ?? null });
    if (r.nao_usa) c.naoUsa.push(fonte);
    out.set(r.client_id, c);
  }
  return out;
}

/** "É intencional, não mostrar mais": a fonte passa a aparecer como "Não usa". */
export async function marcarNaoUsa(clientId: string, fonte: FonteId, naoUsa: boolean): Promise<void> {
  const t = (supabase as any).from("fontes_nao_usadas");
  const { error } = naoUsa
    ? await t.upsert({ client_id: clientId, fonte, marcado_por: (await supabase.auth.getUser()).data.user?.id ?? null }, { onConflict: "client_id,fonte" })
    : await t.delete().eq("client_id", clientId).eq("fonte", fonte);
  if (error) throw error;
}

export function ddmm(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}
