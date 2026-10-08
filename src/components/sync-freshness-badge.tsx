import { useQuery } from "@tanstack/react-query";
import { statusDoCliente, tomDaFonte, ddmm, type LinhaFonte } from "@/lib/saude-fontes";
import { motivoDaLinha, ROTULO_DONO } from "@/lib/motivos";

// Selo de frescura: "Dados: Instagram até 30/09 · Anúncios até 30/09 · CRM até
// 01/10". A data vem do DADO (RPC client_sync_status, ou a leitura direta das tabelas
// quando a migração ainda não existe), não da última tentativa: tentativa não prova dado novo.
// Cor por fonte: verde <= 1 dia de atraso, amarelo 2-3, vermelho > 3 ou com erro na última tentativa.

const ROTULOS: Record<string, string> = {
  instagram: "Instagram",
  anuncios: "Anúncios",
  crm: "CRM",
  atendimento: "WhatsApp",
};
// Comentários não têm data de dado; só entram se a última tentativa deu erro.
const ORDEM = ["instagram", "anuncios", "crm", "atendimento", "comentarios"];

const COR: Record<string, string> = {
  bom: "var(--good)",
  atencao: "var(--warn, #b7791f)",
  ruim: "var(--danger)",
  neutro: "var(--text-dim)",
};

function tituloDaFonte(l: LinhaFonte): string | undefined {
  const m = motivoDaLinha(l);
  if (!m) return l.last_error ?? undefined;
  return `${ROTULO_DONO[m.dono]}: ${m.texto}`;
}

export function SyncFreshnessBadge({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ["client-sync-status", clientId],
    queryFn: () => statusDoCliente(clientId),
    staleTime: 60_000,
    retry: false,
  });

  const linhas = ORDEM.map((f) => (data ?? []).find((l) => l.fonte === f)).filter(
    (l): l is LinhaFonte => !!l && (!!l.data_ate || (l.fonte === "comentarios" && !!l.last_error)),
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
        <span key={l.fonte} style={{ color: COR[tomDaFonte(l)], fontWeight: 600 }} title={tituloDaFonte(l)}>
          {i > 0 && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>· </span>}
          {ROTULOS[l.fonte] ?? "Comentários"}
          {l.data_ate ? ` até ${ddmm(l.data_ate)}` : ""}
          {tomDaFonte(l) === "ruim" ? (motivoDaLinha(l)?.dono === "nos" || !motivoDaLinha(l) ? " (erro)" : " (ver motivo)") : ""}
        </span>
      ))}
    </span>
  );
}
