import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Selo de frescura: "Dados: Instagram até 30/09 · Anúncios até 30/09 · CRM até
// 01/10". A data vem do DADO (RPC client_sync_status calcula max(date) etc.),
// não da última tentativa — tentativa não prova dado novo.
// Cor por fonte: verde <= 1 dia de atraso, amarelo 2-3, vermelho > 3 ou com
// erro na última tentativa.

type Linha = {
  fonte: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_rows: number | null;
  data_ate: string | null;
};

const ROTULOS: Record<string, string> = {
  instagram: "Instagram",
  anuncios: "Anúncios",
  crm: "CRM",
  atendimento: "WhatsApp",
};
// Comentários não têm data de dado; só entram se a última tentativa deu erro.
const ORDEM = ["instagram", "anuncios", "crm", "atendimento", "comentarios"];

function diasDeAtraso(dataAte: string): number {
  const [a, m, d] = dataAte.slice(0, 10).split("-").map(Number);
  const hoje = new Date();
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((base - Date.UTC(a, m - 1, d)) / 86400000);
}

function cor(l: Linha): string {
  if (l.last_error) return "var(--danger)";
  if (!l.data_ate) return "var(--text-dim)";
  const atraso = diasDeAtraso(l.data_ate);
  if (atraso <= 1) return "var(--good)";
  if (atraso <= 3) return "var(--warn, #b7791f)";
  return "var(--danger)";
}

function ddmm(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

export function SyncFreshnessBadge({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ["client-sync-status", clientId],
    queryFn: async () => {
      // RPC fora do types.ts gerado (criada junto com este componente).
      const rpc = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: Linha[] | null; error: unknown }>;
      const { data, error } = await rpc("client_sync_status", { p_client_id: clientId });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    retry: false,
  });

  // Sem RPC (migration ainda não aplicada) ou sem nenhuma fonte: não mostra nada.
  const linhas = ORDEM.map((f) => (data ?? []).find((l) => l.fonte === f)).filter(
    (l): l is Linha => !!l && (!!l.data_ate || (l.fonte === "comentarios" && !!l.last_error)),
  );
  if (linhas.length === 0) return null;

  return (
    <span
      className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
      style={{ color: "var(--text-dim)" }}
      title="Até que data cada fonte tem dado, lido do próprio banco. Vermelho: mais de 3 dias parado ou erro na última tentativa."
    >
      <span>Dados:</span>
      {linhas.map((l, i) => (
        <span key={l.fonte} style={{ color: cor(l), fontWeight: 600 }} title={l.last_error ?? undefined}>
          {i > 0 && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>· </span>}
          {ROTULOS[l.fonte] ?? "Comentários"}
          {l.data_ate ? ` até ${ddmm(l.data_ate)}` : ""}
          {l.last_error ? " (erro)" : ""}
        </span>
      ))}
    </span>
  );
}
