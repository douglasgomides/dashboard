import { createFileRoute } from "@tanstack/react-router";
import { fmtTaxa } from "@/lib/metricas";
import { Carregando, ResumoExecutivo } from "@/components/sem-fonte";
import { useQuery } from "@tanstack/react-query";
import { getCrmFunilPorCampoAlt, getCrmLeadsPorEtapa } from "@/lib/client-data";

export const Route = createFileRoute("/_authenticated/$clientId/vendas-kommo")({
  component: VendasKommoPage,
});

type FunilRow = { chave: string; total: number; ganhos: number; perdidos: number };

// Resumo em frases: volume, quanto já fechou e qual fonte converte mais (com 10+ leads, para não exagerar fonte pequena).
function resumoVendas(rows: FunilRow[], total: number): string[] {
  const ganhos = rows.reduce((s, r) => s + r.ganhos, 0);
  const perdidos = rows.reduce((s, r) => s + r.perdidos, 0);
  const comVolume = rows.filter((r) => r.total >= 10);
  const melhor = [...comVolume].sort((a, b) => b.ganhos / b.total - a.ganhos / a.total)[0];
  const maior = [...rows].sort((a, b) => b.total - a.total)[0];
  const pct = (a: number, b: number) => fmtTaxa(a, b);
  return [
    `${total.toLocaleString("pt-BR")} leads no CRM: ${ganhos.toLocaleString("pt-BR")} ganhos (${pct(ganhos, total)}), ${perdidos.toLocaleString("pt-BR")} perdidos e ${(total - ganhos - perdidos).toLocaleString("pt-BR")} ainda em aberto.`,
    maior ? `A fonte que mais traz leads é “${maior.chave}” (${pct(maior.total, total)} do total).` : "",
    melhor && melhor.ganhos > 0 ? `A que mais vira venda é “${melhor.chave}”: ${pct(melhor.ganhos, melhor.total)} dos leads fecharam.` : "Nenhuma fonte com 10+ leads tem venda marcada ainda: confira se o ganho está sendo registrado no CRM.",
  ];
}

function FunilTable({ title, rows, colLabel }: { title: string; rows: FunilRow[]; colLabel: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <table className="w-full text-sm empilha">
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
                <td data-label="Total" className="py-1.5 text-right">{r.total}</td>
                <td data-label="Ganhos" className="py-1.5 text-right" style={{ color: "var(--good)" }}>
                  {r.ganhos}
                </td>
                <td data-label="Perdidos" className="py-1.5 text-right" style={{ color: "var(--danger)" }}>
                  {r.perdidos}
                </td>
                <td data-label="Em andamento" className="py-1.5 text-right" style={{ color: "var(--text-dim)" }}>
                  {emAndamento}
                </td>
                <td data-label="Taxa de ganho" className="py-1.5 text-right font-medium">{fmtTaxa(r.ganhos, r.total)}</td>
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
    queryFn: () => getCrmFunilPorCampoAlt(clientId, ["%Fonte do Lead%", "%Origem do Lead%"]),
  });
  const { data: porProcedimento, isLoading: loadingProcedimento } = useQuery({
    queryKey: ["crm-funil-procedimento", clientId],
    queryFn: () => getCrmFunilPorCampoAlt(clientId, ["%Tipo de Procedim%"]),
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
        <Carregando texto="Lendo as vendas…" />
      ) : totalLeads === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
          Ainda sem leads sincronizados do Kommo pra esse cliente.
        </p>
      ) : (
        <>
          <ResumoExecutivo frases={resumoVendas(porFonte ?? [], totalLeads)} />
          <FunilTable title="Por fonte do lead" rows={porFonte ?? []} colLabel="Fonte" />
          <FunilTable title="Por tipo de procedimento" rows={porProcedimento ?? []} colLabel="Procedimento" />

          {(porEtapa?.length ?? 0) > 0 && (
            <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
              <h2 className="mb-1 text-sm font-semibold">Leads por etapa (todos os funis)</h2>
              <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
                Onde os leads sincronizados estão parados agora, em qualquer pipeline da conta.
              </p>
              <table className="w-full text-sm empilha">
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
                      <td data-label="Pipeline" className="py-1.5" style={{ color: "var(--text-dim)" }}>
                        {r.pipeline}
                      </td>
                      <td data-label="Etapa" className="py-1.5">{r.etapa}</td>
                      <td data-label="Leads" className="py-1.5 text-right">{r.total}</td>
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
