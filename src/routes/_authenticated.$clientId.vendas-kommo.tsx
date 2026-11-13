import { useMemo, type ReactNode } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { nomeCrm } from "@/lib/crm-provedor";
import { getCrmProvider } from "@/lib/client-data";
import { fmtTaxa } from "@/lib/metricas";
import { useQuery } from "@tanstack/react-query";
import { getCrmFunilPorCampoAlt, getCrmLeadsPorEtapa } from "@/lib/client-data";
import { NAO_INFORMADO, abertosDaLinha, fechadosDaLinha, resumoVendas, soNaoInformado, type FunilRow } from "@/lib/vendas-origem";
import { NxCard, NxPizza } from "@/components/nx";
import { CmBarras, CmLeitura, CmMetodo, icT } from "@/components/nx/comercial-base";
import { PaginaNexo, LeituraDaTela } from "@/components/nx/pagina";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { NxCarregando, NxErro, NxTabela } from "@/components/nx/blocos";
import { usePublicarContagem } from "@/components/nx/abas-em-pasta";
import { fatosPorOrigem } from "@/lib/leitura/fatos-comercial";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { hojeBrasilia } from "@/lib/status-fonte";

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

export const Route = createFileRoute("/_authenticated/$clientId/vendas-kommo")({
  component: VendasKommoPage,
});

const fmtN = (n: number) => n.toLocaleString("pt-BR");

/** No máximo estas origens ficam no gráfico do topo; a tabela por fonte, nos Detalhes, lista todas com todos os números. */
const ORIGENS_NO_GRAFICO = 6;

/** Tabela por fonte ou procedimento: as mesmas colunas e os mesmos números de antes, agora em NxTabela. */
function FunilTable({ title, rows, colLabel }: { title: string; rows: FunilRow[]; colLabel: string }) {
  if (rows.length === 0) return null;
  const comFechados = rows.some((r) => fechadosDaLinha(r) > 0);
  const colunas = [
    { chave: "chave", titulo: colLabel },
    { chave: "total", titulo: "Total", numerica: true },
    { chave: "ganhos", titulo: "Ganhos", numerica: true },
    { chave: "perdidos", titulo: "Perdidos", numerica: true },
    { chave: "andamento", titulo: "Em andamento", numerica: true },
    ...(comFechados ? [{ chave: "fechados", titulo: "Fechados sem resultado", numerica: true }] : []),
    { chave: "taxa", titulo: "Taxa de ganho", numerica: true },
  ];
  const linhas = rows.map((r) => ({
    chave: <b>{r.chave}</b>,
    total: r.total,
    ganhos: r.ganhos,
    perdidos: r.perdidos,
    andamento: abertosDaLinha(r),
    fechados: fechadosDaLinha(r),
    taxa: fmtTaxa(r.ganhos, r.total),
  })) as Record<string, ReactNode>[];
  return (
    <NxCard nivel={2} icone={icT("file-text")} titulo={title}>
      <NxTabela rotulo={title} colunas={colunas} linhas={linhas} chaveDaLinha={(_, k) => k} />
    </NxCard>
  );
}

function VendasKommoPage() {
  const { clientId } = Route.useParams();
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  const { data: provider } = useQuery({ queryKey: ["crm-provider", clientId], queryFn: () => getCrmProvider(clientId) });
  const crm = nomeCrm(provider);
  const hoje = hojeBrasilia();

  const fonteQ = useQuery({
    queryKey: ["crm-funil-fonte", clientId],
    queryFn: () => getCrmFunilPorCampoAlt(clientId, ["%Fonte do Lead%", "%Origem do Lead%"]),
  });
  const procedimentoQ = useQuery({
    queryKey: ["crm-funil-procedimento", clientId],
    queryFn: () => getCrmFunilPorCampoAlt(clientId, ["%Tipo de Procedim%"]),
  });
  const etapaQ = useQuery({
    queryKey: ["crm-leads-etapa", clientId],
    queryFn: () => getCrmLeadsPorEtapa(clientId),
  });
  const { data: porFonte, isLoading: loadingFonte } = fonteQ;
  const { data: porProcedimento, isLoading: loadingProcedimento } = procedimentoQ;
  const { data: porEtapa, isLoading: loadingEtapa } = etapaQ;

  const isLoading = loadingFonte || loadingProcedimento || loadingEtapa;
  const fontes = useMemo(() => porFonte ?? [], [porFonte]);
  const totalLeads = fontes.reduce((sum, r) => sum + r.total, 0);

  // Leitura por regra (sem consulta nova, sem IA): só as contagens por origem que a tela já carregou.
  const fatos = useMemo(() => (isLoading || fonteQ.isError ? null : fatosPorOrigem({ hoje, linhas: fontes })), [isLoading, fonteQ.isError, hoje, fontes]);

  // Contagem em cinza da aba Por origem na pasta (D-07): as origens com venda (ganho) que a tela lista, sem "Não informado",
  // que não é uma origem. null quando a tela diz que não há dado; "—" na pasta, nunca 0.
  usePublicarContagem({
    clientId,
    de: start,
    ate: end,
    rota: "/_authenticated/$clientId/vendas-kommo",
    valor: isLoading ? undefined : fonteQ.isError ? null : fontes.filter((r) => r.chave !== NAO_INFORMADO && r.ganhos > 0).length || null,
  });

  const cabecalho = {
    tela: "vendas-kommo" as const,
    titulo: "Resultados por origem do CRM",
    pergunta: "De qual origem vêm os contatos que fecham?",
    decisao: "D3" as const,
    meta: (
      <span>
        CRM {crm} · base inteira sincronizada (não usa o período do topo: {formatRangeLabel({ start, end })})
      </span>
    ),
  };

  if (isLoading) return <PaginaNexo {...cabecalho} leitura={<LeituraDaTela fatos={null} carregando semSelo />} corpo={<NxCarregando texto="Lendo as vendas…" linhas={3} />} />;

  if (fonteQ.isError)
    return (
      <PaginaNexo
        {...cabecalho}
        leitura={<LeituraDaTela fatos={null} carregando={false} erro="A consulta falhou." semSelo />}
        corpo={<NxErro texto="Não foi possível carregar os resultados por origem. A consulta falhou. Nenhum resultado foi substituído por zero." onTentar={() => void fonteQ.refetch()} />}
      />
    );

  const leitura = <LeituraDaTela fatos={fatos} carregando={false} semSelo />;

  if (totalLeads === 0)
    return <PaginaNexo {...cabecalho} leitura={leitura} corpo={<p className="nx-vazio text-center text-sm">Ainda sem leads sincronizados do {crm} para este cliente.</p>} />;

  // As mesmas somas que o resumo em frases faz (resumoVendas), mostradas em cartões.
  const ganhos = fontes.reduce((s, r) => s + r.ganhos, 0);
  const perdidos = fontes.reduce((s, r) => s + r.perdidos, 0);
  const abertos = fontes.reduce((s, r) => s + abertosDaLinha(r), 0);
  const fechados = fontes.reduce((s, r) => s + fechadosDaLinha(r), 0);
  const ordenadas = [...fontes].sort((a, b) => b.total - a.total);
  const noGrafico = ordenadas.slice(0, ORIGENS_NO_GRAFICO);
  const maxTotal = Math.max(1, ...fontes.map((r) => r.total));
  // Pizza: as cinco maiores origens e o resto junto.
  const fatias = [
    ...ordenadas.slice(0, 5).map((r) => ({ rotulo: r.chave, valor: r.total })),
    ...(ordenadas.length > 5 ? [{ rotulo: "Outras origens", valor: ordenadas.slice(5).reduce((s, r) => s + r.total, 0) }] : []),
  ];

  const cartoes: [ReactNode, ReactNode, ReactNode, ReactNode] = [
    <NxCartaoNumero key="leads" icone="users" titulo="Leads no CRM" subtitulo="base inteira" valor={fmtN(totalLeads)} legenda="contatos sincronizados" />,
    <NxCartaoNumero key="ganho" icone="checklist" titulo="Status ganho" subtitulo={`${fmtTaxa(ganhos, totalLeads)} dos leads`} valor={fmtN(ganhos)} legenda="cards" />,
    <NxCartaoNumero key="perdidos" icone="x" titulo="Perdidos" subtitulo={`${fmtTaxa(perdidos, totalLeads)} dos leads`} valor={fmtN(perdidos)} legenda="cards" />,
    <NxCartaoNumero key="abertos" icone="target" titulo="Em aberto" subtitulo={fechados > 0 ? `${fmtN(fechados)} fechados sem resultado` : "base inteira"} valor={fmtN(abertos)} legenda="cards" />,
  ];

  return (
    <PaginaNexo
      {...cabecalho}
      leitura={leitura}
      cartoes={cartoes}
      principal={
        <NxCard
          id="por-origem"
          nivel={2}
          icone={icT("speakerphone")}
          titulo="Leads e ganhos por origem"
          subtitulo={
            ordenadas.length > ORIGENS_NO_GRAFICO
              ? `As ${ORIGENS_NO_GRAFICO} maiores de ${ordenadas.length} origens; a tabela dos Detalhes lista todas`
              : "Barra = leads da origem; ao lado, a taxa de status ganho"
          }
        >
          <CmBarras
            rotulo="Leads por origem"
            max={maxTotal}
            itens={noGrafico.map((r) => ({
              chave: r.chave,
              rotulo: r.chave,
              valor: r.total,
              texto: fmtN(r.total),
              apoio: `${fmtTaxa(r.ganhos, r.total)} ganho`,
              nota: `${fmtN(r.ganhos)} ganhos · ${fmtN(r.perdidos)} perdidos · ${fmtN(abertosDaLinha(r))} em andamento`,
              tom: r.chave === NAO_INFORMADO ? ("g" as const) : undefined,
            }))}
          />
        </NxCard>
      }
      detalhe={
        <div className="nexo-comercial">
          <NxCard id="fatia-origem" nivel={2} icone={icT("chart-bar")} titulo="Fatia de cada origem" subtitulo={`${fmtN(totalLeads)} leads`}>
            <NxPizza rotulo="Fatia de cada origem nos leads" fatias={fatias} />
          </NxCard>

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
              <NxTabela
                rotulo="Leads por etapa (todos os funis)"
                colunas={[
                  { chave: "pipeline", titulo: "Pipeline" },
                  { chave: "etapa", titulo: "Etapa" },
                  { chave: "total", titulo: "Leads", numerica: true },
                ]}
                linhas={(porEtapa ?? []).map((r) => ({ pipeline: r.pipeline, etapa: <b>{r.etapa}</b>, total: r.total })) as Record<string, ReactNode>[]}
                chaveDaLinha={(_, k) => k}
              />
            </NxCard>
          )}
        </div>
      }
    />
  );
}
