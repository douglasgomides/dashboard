// Saúde das fontes de cada cliente: até que data cada fonte tem dado, lido do próprio banco.
// Usa a RPC client_sync_status quando ela existe; se a migração ainda não foi aplicada, lê as
// tabelas com as mesmas regras (RLS vale igual), para o selo e a Visão geral não sumirem.
import { supabase } from "@/integrations/supabase/client";

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
};

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
    ultima("wts_sessions", "started_at", clientId),
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

export function diasDeAtraso(dataAte: string): number {
  const [a, m, d] = dataAte.slice(0, 10).split("-").map(Number);
  const hoje = new Date();
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((base - Date.UTC(a, m - 1, d)) / 86400000);
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
export function atrasoDaFonte(l: { fonte?: string; data_ate: string | null }): number {
  if (!l.data_ate) { return 0; }
  return l.fonte === "crm" || l.fonte === "atendimento" ? diasUteisDeAtraso(l.data_ate) : diasDeAtraso(l.data_ate);
}

export type Tom = "bom" | "atencao" | "ruim" | "neutro";
export function tomDaFonte(l: (Pick<LinhaFonte, "data_ate" | "last_error"> & { fonte?: string; motivo_dono?: string | null }) | undefined): Tom {
  if (!l) return "neutro";
  // Fonte sem acesso, alimentada à mão (planilha): não é alarme, é uma situação combinada. Fica em cinza.
  if (l.motivo_dono === "manual") return "neutro";
  if (l.last_error) return "ruim";
  if (!l.data_ate) return "neutro";
  const atraso = atrasoDaFonte(l);
  return atraso <= 1 ? "bom" : atraso <= 3 ? "atencao" : "ruim";
}

export function ddmm(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}
