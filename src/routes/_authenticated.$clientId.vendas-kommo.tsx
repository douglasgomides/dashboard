import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getCrmFunilPorCampo, getCrmLeadsPorEtapa } from "@/lib/client-data";

export const Route = createFileRoute("/_authenticated/$clientId/vendas-kommo")({
  component: VendasKommoPage,
});

type FunilRow = { chave: string; total: number; ganhos: number; perdidos: number };

function FunilTable({ title, rows, colLabel }: { title: string; rows: FunilRow[]; colLabel: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
            <th className="pb-2">{colLabel}</th>
            <th className="pb-2 text-right">Total</th>
            <th className="pb-2 text-right">Ganhos</th>
            <th className="pb-2 text-right">Perdidos</th>
            <th className="pb-2 text-right">Em andamento</th>
            <th className="pb-2 text-right">Taxa de ganho</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const emAndamento = r.total - r.ganhos - r.perdidos;
            const taxaGanho = r.total > 0 ? (r.ganhos / r.total) * 100 : 0;
            return (
              <tr key={r.chave} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5">{r.chave}</td>
                <td className="py-1.5 text-right">{r.total}</td>
                <td className="py-1.5 text-right" style={{ color: "var(--good)" }}>
                  {r.ganhos}
                </td>
                <td className="py-1.5 text-right" style={{ color: "var(--danger)" }}>
                  {r.perdidos}
                </td>
                <td className="py-1.5 text-right" style={{ color: "var(--text-dim)" }}>
                  {emAndamento}
                </td>
                <td className="py-1.5 text-right font-medium">{taxaGanho.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VendasKommoPage() {
  const { clientId } = Route.useParams();

  const { data: porFonte, isLoading: loadingFonte } = useQuery({
    queryKey: ["crm-funil-fonte", clientId],
    queryFn: () => getCrmFunilPorCampo(clientId, "%Fonte do Lead%"),
  });
  const { data: porProcedimento, isLoading: loadingProcedimento } = useQuery({
    queryKey: ["crm-funil-procedimento", clientId],
    queryFn: () => getCrmFunilPorCampo(clientId, "%Tipo de Procedim%"),
  });
  const { data: porEtapa, isLoading: loadingEtapa } = useQuery({
    queryKey: ["crm-leads-etapa", clientId],
    queryFn: () => getCrmLeadsPorEtapa(clientId),
  });

  const isLoading = loadingFonte || loadingProcedimento || loadingEtapa;
  const totalLeads = (porFonte ?? []).reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4 text-sm"
        style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
      >
        Cruzamento real de origem × resultado, direto do CRM (Kommo) — "Fonte do Lead" e "Tipo de Procedimento" são
        preenchidos pela própria equipe comercial, não inferidos. Status "Ganho"/"Perdido" é o mesmo em qualquer
        funil da conta. O sync roda automaticamente todo dia.
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-dim)" }}>Carregando…</p>
      ) : totalLeads === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
          Ainda sem leads sincronizados do Kommo pra esse cliente.
        </p>
      ) : (
        <>
          <FunilTable title="Por fonte do lead" rows={porFonte ?? []} colLabel="Fonte" />
          <FunilTable title="Por tipo de procedimento" rows={porProcedimento ?? []} colLabel="Procedimento" />

          {(porEtapa?.length ?? 0) > 0 && (
            <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <h2 className="mb-1 text-sm font-semibold">Leads por etapa (todos os funis)</h2>
              <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
                Onde os leads sincronizados estão parados agora, em qualquer pipeline da conta.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
                    <th className="pb-2">Pipeline</th>
                    <th className="pb-2">Etapa</th>
                    <th className="pb-2 text-right">Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {(porEtapa ?? []).map((r) => (
                    <tr key={`${r.pipeline}-${r.etapa}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5" style={{ color: "var(--text-dim)" }}>
                        {r.pipeline}
                      </td>
                      <td className="py-1.5">{r.etapa}</td>
                      <td className="py-1.5 text-right">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
