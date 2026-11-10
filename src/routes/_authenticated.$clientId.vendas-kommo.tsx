import { createFileRoute } from "@tanstack/react-router";
import { nomeCrm } from "@/lib/crm-provedor";
import { getCrmProvider } from "@/lib/client-data";
import { fmtTaxa } from "@/lib/metricas";
import { Carregando } from "@/components/sem-fonte";
import { useQuery } from "@tanstack/react-query";
import { getCrmFunilPorCampoAlt, getCrmLeadsPorEtapa } from "@/lib/client-data";
import { abertosDaLinha, fechadosDaLinha, resumoVendas, soNaoInformado, type FunilRow } from "@/lib/vendas-origem";
import { NxCard, NxPizza } from "@/components/nx";
import { CmBarras, CmKpi, CmLeitura, CmMetodo, CmTopo, icT } from "@/components/nx/comercial-base";

export const Route = createFileRoute("/_authenticated/$clientId/vendas-kommo")({
  component: VendasKommoPage,
});

const fmtN = (n: number) => n.toLocaleString("pt-BR");

function FunilTable({ title, rows, colLabel }: { title: string; rows: FunilRow[]; colLabel: string }) {
  if (rows.length === 0) return null;
  const comFechados = rows.some((r) => fechadosDaLinha(r) > 0);
  return (
    <NxCard nivel={2} icone={icT("file-text")} titulo={title}>
      <div className="cm-tabela">
        <table className="empilha">
          <thead>
            <tr className="text-left">
              <th>{colLabel}</th>
              <th className="text-right">Total</th>
              <th className="text-right">Ganhos</th>
              <th className="text-right">Perdidos</th>
              <th className="text-right">Em andamento</th>
              {comFechados && <th className="text-right">Fechados sem resultado</th>}
              <th className="text-right">Taxa de ganho</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const emAndamento = abertosDaLinha(r);
              return (
                <tr key={r.chave}>
                  <td style={{ fontWeight: 600 }}>{r.chave}</td>
                  <td data-label="Total" className="text-right">{r.total}</td>
                  <td data-label="Ganhos" className="text-right" style={{ color: "var(--good)", fontWeight: 600 }}>{r.ganhos}</td>
                  <td data-label="Perdidos" className="text-right" style={{ color: "var(--danger)", fontWeight: 600 }}>{r.perdidos}</td>
                  <td data-label="Em andamento" className="text-right" style={{ color: "var(--muted-ink)" }}>{emAndamento}</td>
                  {comFechados && (
                    <td data-label="Fechados sem resultado" className="text-right" style={{ color: "var(--muted-ink)" }}>
                      {fechadosDaLinha(r)}
                    </td>
                  )}
                  <td data-label="Taxa de ganho" className="cm-num">{fmtTaxa(r.ganhos, r.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </NxCard>
  );
}

function VendasKommoPage() {
  const { clientId } = Route.useParams();
  const { data: provider } = useQuery({ queryKey: ["crm-provider", clientId], queryFn: () => getCrmProvider(clientId) });
  const crm = nomeCrm(provider);

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
  const fontes = porFonte ?? [];
  const totalLeads = fontes.reduce((sum, r) => sum + r.total, 0);
  // As mesmas somas que o resumo em frases faz (resumoVendas), mostradas em cartões.
  const ganhos = fontes.reduce((s, r) => s + r.ganhos, 0);
  const perdidos = fontes.reduce((s, r) => s + r.perdidos, 0);
  const abertos = fontes.reduce((s, r) => s + abertosDaLinha(r), 0);
  const fechados = fontes.reduce((s, r) => s + fechadosDaLinha(r), 0);
  const ordenadas = [...fontes].sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(1, ...fontes.map((r) => r.total));
  // Pizza: as cinco maiores origens e o resto junto.
  const fatias = [
    ...ordenadas.slice(0, 5).map((r) => ({ rotulo: r.chave, valor: r.total })),
    ...(ordenadas.length > 5 ? [{ rotulo: "Outras origens", valor: ordenadas.slice(5).reduce((s, r) => s + r.total, 0) }] : []),
  ];

  return (
    <div className="nexo-comercial">
      <CmTopo pergunta="De qual origem vêm os leads e qual delas mais vira ganho?" detalhe={`CRM ${crm} · base inteira sincronizada (não usa o período do topo)`} />

      {isLoading ? (
        <Carregando texto="Lendo as vendas…" />
      ) : totalLeads === 0 ? (
        <p className="nx-vazio text-center text-sm">Ainda sem leads sincronizados do {crm} para este cliente.</p>
      ) : (
        <>
          <section className="nx-grade nx-grade--4" aria-label="Números da base">
            <CmKpi i={0} icone="users" rotulo="Leads no CRM" valor={fmtN(totalLeads)} />
            <CmKpi i={1} icone="checklist" rotulo="Status ganho" valor={fmtN(ganhos)} nota={`${fmtTaxa(ganhos, totalLeads)} dos leads`} />
            <CmKpi i={2} icone="x" rotulo="Perdidos" valor={fmtN(perdidos)} nota={`${fmtTaxa(perdidos, totalLeads)} dos leads`} />
            <CmKpi i={3} icone="target" rotulo="Em aberto" valor={fmtN(abertos)} nota={fechados > 0 ? `${fmtN(fechados)} fechados sem resultado` : undefined} />
          </section>

          <div className="cm-par">
            <NxCard id="por-origem" nivel={2} icone={icT("speakerphone")} titulo="Leads e ganhos por origem" subtitulo="Barra = leads da origem; ao lado, a taxa de status ganho">
              <CmBarras
                rotulo="Leads por origem"
                max={maxTotal}
                itens={ordenadas.map((r) => ({
                  chave: r.chave,
                  rotulo: r.chave,
                  valor: r.total,
                  texto: fmtN(r.total),
                  apoio: `${fmtTaxa(r.ganhos, r.total)} ganho`,
                  nota: `${fmtN(r.ganhos)} ganhos · ${fmtN(r.perdidos)} perdidos · ${fmtN(abertosDaLinha(r))} em andamento`,
                  tom: r.chave === "Não informado" ? ("g" as const) : undefined,
                }))}
              />
            </NxCard>
            <NxCard id="fatia-origem" nivel={2} icone={icT("chart-bar")} titulo="Fatia de cada origem" subtitulo={`${fmtN(totalLeads)} leads`}>
              <NxPizza rotulo="Fatia de cada origem nos leads" fatias={fatias} />
            </NxCard>
          </div>

          <CmLeitura id="resumo" titulo="Em resumo" itens={resumoVendas(fontes, totalLeads).map((texto) => ({ texto }))} />

          <CmMetodo titulo="Como ler este relatório">
            <p>
              Cruzamento de origem × status no CRM ({crm}), na base inteira sincronizada. Este relatório não usa o período do topo. Os campos dependem do
              provedor e do cadastro da equipe. Status ganho/perdido representa o registro da origem: ganho pode significar agendamento e exige conferência
              antes de ser tratado como venda.
            </p>
          </CmMetodo>

          <FunilTable title="Por fonte do lead" rows={fontes} colLabel="Fonte" />
          {soNaoInformado(porProcedimento ?? []) ? (
            <NxCard nivel={2} icone={icT("stethoscope")} titulo="Por tipo de procedimento">
              <p className="nx-vazio text-sm" style={{ margin: 0 }}>
                O {crm} não tem o campo de tipo de procedimento preenchido nos cards, então não dá para separar por procedimento.
              </p>
            </NxCard>
          ) : (
            <FunilTable title="Por tipo de procedimento" rows={porProcedimento ?? []} colLabel="Procedimento" />
          )}

          {(porEtapa?.length ?? 0) > 0 && (
            <NxCard
              nivel={2}
              icone={icT("filter")}
              titulo="Leads por etapa (todos os funis)"
              subtitulo="Onde estão todos os cards sincronizados, abertos ou já encerrados (ganhos, perdidos e fechados sem resultado), em qualquer pipeline da conta."
            >
              <div className="cm-tabela">
                <table className="empilha">
                  <thead>
                    <tr className="text-left">
                      <th>Pipeline</th>
                      <th>Etapa</th>
                      <th className="text-right">Leads</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(porEtapa ?? []).map((r) => (
                      <tr key={`${r.pipeline}-${r.etapa}`}>
                        <td data-label="Pipeline" style={{ color: "var(--muted-ink)" }}>{r.pipeline}</td>
                        <td data-label="Etapa" style={{ fontWeight: 600 }}>{r.etapa}</td>
                        <td data-label="Leads" className="cm-num">{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </NxCard>
          )}
        </>
      )}
    </div>
  );
}
