import { useMemo, type ReactNode } from "react";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { configCrm } from "@/lib/crm-operacao-data";
import { fmtTaxa } from "@/lib/metricas";
import { useQuery } from "@tanstack/react-query";
import { InfoDica } from "@/components/visual";
import { NxCard, NxLinhaTempo, NxMedidor, NxSectionHeader, NxTag } from "@/components/nx";
import { CmAviso, CmBarras, CmKpi, CmMetodo, CmRecolhido, icT } from "@/components/nx/comercial-base";
import { PaginaNexo, LeituraDaTela } from "@/components/nx/pagina";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { NxCarregando, NxErro } from "@/components/nx/blocos";
import { NxFunilDesenhado } from "@/components/nx/funil-desenhado";
import { fatosDoFunil } from "@/lib/leitura/fatos-comercial";
import { hojeBrasilia } from "@/lib/status-fonte";
import { deFunilComercial } from "@/lib/funil-desenhado";
import type { NomeIcone } from "@/lib/registro-de-telas";
import { VisoesComerciais } from "@/components/crm-visoes";
import {
  getCrmMetricasEssenciais,
  getCrmLeadsPorDia,
  getCrmAtividadeRecente,
  getCrmProvider,
  getCrmFunilPorCampoPeriodoAlt,
  getCrmLeadsPorDiaPeriodo,
  getCrmResumoPeriodo,
  getCrmPessoasPeriodo,
  getCrmPessoasNovasPorDia,
} from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { SyncButton } from "@/components/sync-button";
import { ListaLimitacoes } from "@/components/insight-card";
import { QualidadeDados, BaseVivaCrm } from "@/components/qualidade-dados";
import { AtendimentoResumo } from "@/components/atendimento-resumo";
import { LinksShortio } from "@/components/links-shortio";
import { ChecklistDados, FunilOndeQuebra, ProblemasPorTipo, useDiagnosticoComercial } from "@/components/comercial-diagnostico";

import { ehNegocioProprio } from "@/lib/negocio-proprio";
import { CrmNegocioProprio } from "@/components/crm-negocio-proprio";
import { OrcamentosPorTipo } from "@/components/orcamentos-por-tipo";
import { FunisPeriodo } from "@/components/funis-periodo";
import { mensagemDeErro } from "@/lib/erro-amigavel";

// Nome de exibição do CRM — evita chamar tudo de "Kommo" quando o cliente é Clint.
function nomeCrm(provider: string | null | undefined): string {
  if (provider === "clint") return "Clint";
  if (provider === "rdstation") return "RD Station";
  if (provider === "flwchat") return "WTS Chat";
  if (provider === "digisac") return "Digisac";
  if (provider === "kommo") return "Kommo";
  if (provider === "planilha") return "planilha";
  return "CRM";
}

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

export const Route = createFileRoute("/_authenticated/$clientId/crm-painel")({
  component: CrmPainelPage,
});

function fmtBRL(n: number) {
  return "R$ " + Math.round(n).toLocaleString("pt-BR");
}
function fmtN(n: number) {
  return n.toLocaleString("pt-BR");
}
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const info = (rotulo: string, texto?: string) => (texto ? <InfoDica texto={texto} rotulo={`Sobre ${rotulo}`} /> : undefined);

function TendenciaDeLeads({ clientId, start, end }: { clientId: string; start: string; end: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["crm-leads-dia-periodo", clientId, start, end],
    queryFn: () => getCrmLeadsPorDiaPeriodo(clientId, start, end),
  });
  const pessoasQ = useQuery({
    queryKey: ["crm-pessoas-dia-periodo", clientId, start, end],
    queryFn: () => getCrmPessoasNovasPorDia(clientId, start, end),
  });
  const porPessoa = pessoasQ.data && pessoasQ.data.some((r) => r.cards > r.pessoas_novas) ? pessoasQ.data : null;

  const rows = porPessoa
    ? porPessoa.map((r) => ({ dia: String(r.dia).slice(0, 10), total: r.pessoas_novas, cards: r.cards }))
    : (data ?? []).map((r) => ({ dia: String(r.dia).slice(0, 10), total: Number(r.total), cards: Number(r.total) }));

  return (
    <NxCard icone={icT("chart-bar")} titulo={porPessoa ? "Pessoas novas por dia" : "Leads novos por dia"} subtitulo={`Período: ${formatRangeLabel({ start, end })}`}>
      {isLoading ? (
        <p className="text-sm" style={{ color: "var(--muted-ink)" }}>Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="nx-vazio text-sm">Sem leads criados nesse período.</p>
      ) : (
        <NxLinhaTempo
          rotulo={porPessoa ? "Pessoas novas e orçamentos por dia" : "Leads novos por dia"}
          datas={rows.map((r) => r.dia)}
          series={
            porPessoa
              ? [
                  { rotulo: "Pessoas novas", valores: rows.map((r) => r.total), cor: "var(--b1)", area: true },
                  { rotulo: "Orçamentos no dia", valores: rows.map((r) => r.cards), cor: "var(--b4)" },
                ]
              : [{ rotulo: "Leads", valores: rows.map((r) => r.total), cor: "var(--b1)", area: true }]
          }
          formatarData={dataCurta}
          formatarValor={(n) => fmtN(Math.round(n))}
        />
      )}
    </NxCard>
  );
}

function PorCampo({
  clientId,
  title,
  fieldPatterns,
  emptyLabel,
  icone,
  start,
  end,
}: {
  icone: NomeIcone;
  clientId: string;
  start: string;
  end: string;
  title: string;
  fieldPatterns: string[];
  emptyLabel: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["crm-funil-campo-chart-periodo", clientId, fieldPatterns, start, end],
    queryFn: () => getCrmFunilPorCampoPeriodoAlt(clientId, fieldPatterns, start, end),
  });

  const rows = (data ?? [])
    .filter((r) => r.chave !== "Não informado")
    .slice(0, 8)
    .map((r) => ({ chave: r.chave, total: r.total }));
  const soma = rows.reduce((t, r) => t + r.total, 0);

  return (
    <NxCard icone={icT(icone)} titulo={title} subtitulo={`Top ${rows.length || 8} · ${soma ? fmtN(soma) + " leads" : "sem dados"}`}>
      {isLoading ? (
        <p className="text-sm" style={{ color: "var(--muted-ink)" }}>Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="nx-vazio text-sm">{emptyLabel}</p>
      ) : (
        <CmBarras rotulo={title} itens={rows.map((r) => ({ chave: r.chave, rotulo: r.chave, valor: r.total, texto: fmtN(r.total), apoio: fmtTaxa(r.total, soma) }))} />
      )}
    </NxCard>
  );
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function AtividadeRecente({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["crm-atividade-recente", clientId],
    queryFn: () => getCrmAtividadeRecente(clientId, 12),
  });
  const rows = data ?? [];
  return (
    <NxCard icone={icT("users")} titulo="Atividade recente" subtitulo="Últimos leads que entraram">
      {isLoading ? (
        <p className="text-sm" style={{ color: "var(--muted-ink)" }}>Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="nx-vazio text-sm">Nenhum lead recente.</p>
      ) : (
        <ul className="cm-lista">
          {rows.map((r) => (
            <li key={r.external_lead_id}>
              <span className="cm-lista__corpo">
                <span className="cm-lista__titulo">{r.nome}</span>
                <span className="cm-lista__sub">
                  {r.fonte} · {r.pipeline} · {r.criado_em ? timeAgo(r.criado_em) : "sem data"}
                </span>
              </span>
              <span className="cm-lista__fim">
                <NxTag tom="b" titulo={r.etapa}>{r.etapa}</NxTag>
              </span>
            </li>
          ))}
        </ul>
      )}
    </NxCard>
  );
}

function EntradaDoKanban({ clientId }: { clientId: string }) {
  const q = useQuery({ queryKey: ["crm-operacao-config", clientId], queryFn: () => configCrm(clientId), retry: false, staleTime: 60_000 });
  if (!q.data?.ativo) return null;
  return (
    <section className="cm-aviso" aria-label="Onde acompanhar os contatos">
      <span className="cm-aviso__ic" aria-hidden>i</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
        <p>
          <b>Este painel reúne os resultados importados do CRM.</b> Para organizar responsáveis, retornos e próximas ações da clínica, use Contatos e
          oportunidades. As movimentações do quadro ficam no acompanhamento da equipe.
        </p>
        <Link to="/$clientId/crm-contatos" params={{ clientId }} className="nx-botao" style={{ minHeight: 38 }}>
          Trabalhar os contatos
        </Link>
      </div>
    </section>
  );
}

function CrmPainelPage() {
  const { clientId } = Route.useParams();
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  return ehNegocioProprio(clientId) ? <CrmNegocioProprio clientId={clientId} start={start} end={end} /> : <CrmClinicaPage />;
}

function CrmClinicaPage() {
  const { clientId } = Route.useParams();
  const metricasQ = useQuery({
    queryKey: ["crm-metricas-essenciais", clientId],
    queryFn: () => getCrmMetricasEssenciais(clientId),
  });
  const { data: crmProvider } = useQuery({
    queryKey: ["crm-provider", clientId],
    queryFn: () => getCrmProvider(clientId),
  });
  const crmNome = nomeCrm(crmProvider);
  // Periodo do seletor do cabecalho (inclui "Ultimos 7 dias").
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  const periodoQ = useQuery({
    queryKey: ["crm-resumo-periodo", clientId, start, end],
    queryFn: () => getCrmResumoPeriodo(clientId, start, end),
  });
  const pessoasQ = useQuery({
    queryKey: ["crm-pessoas-periodo", clientId, start, end],
    queryFn: () => getCrmPessoasPeriodo(clientId, start, end),
  });
  const pessoas = pessoasQ.data && pessoasQ.data.pessoas < pessoasQ.data.cards ? pessoasQ.data : null;
  const { data: m, isLoading } = metricasQ;
  const { data: periodo } = periodoQ;
  // A leitura usa o mesmo período dos números do topo.
  const diag = useDiagnosticoComercial(clientId, start, end);
  const hoje = hojeBrasilia();

  // Leitura do funil: calculada na hora, só do que a tela já carregou (sem consulta nova, sem IA). Só contagens entram.
  const fatos = useMemo(
    () =>
      diag.data
        ? fatosDoFunil({ de: start, ate: end, hoje, funil: diag.data.funil, dados: diag.data.dados, insights: diag.data.insights, limitacoes: diag.data.limitacoes })
        : null,
    [diag.data, start, end, hoje],
  );
  // O funil desenhado (Conversou · Virou lead · Atendido · Agendou · Fechou): a mesma conta do diagnóstico, só desenhada. Esta tela
  // não tem período anterior em memória (nenhuma consulta nova), então não há contorno nem ▲/▼.
  const funilDesenhado = useMemo(() => (diag.data ? deFunilComercial(diag.data) : null), [diag.data]);

  const ehRelatorio = clientId === "8d4b3b3f-74a7-419a-a113-35ebc02cb37f";
  const temSync = (crmProvider === "kommo" || crmProvider === "clint" || crmProvider === "rdstation" || crmProvider === "flwchat" || crmProvider === "digisac") && !ehRelatorio;
  const periodoTxt = formatRangeLabel({ start, end });
  const cabecalho = {
    tela: "crm-painel" as const,
    titulo: "Funil comercial",
    pergunta: "Onde o funil comercial está quebrando?",
    decisao: "D1" as const,
    meta: ehRelatorio ? (
      <span>
        Relatório semanal 31/08–04/09/2026 · <b>não atualiza sozinho</b>
      </span>
    ) : (
      <span>
        CRM {crmNome} · ao vivo, atualiza todo dia{crmProvider === "kommo" ? " · leads, não conversas" : ""}
      </span>
    ),
    acao: temSync ? <SyncButton clientId={clientId} alvo="crm" /> : undefined,
  };

  if (isLoading) return <PaginaNexo {...cabecalho} leitura={<LeituraDaTela fatos={null} carregando semSelo />} corpo={<NxCarregando texto="Lendo o CRM…" linhas={3} />} />;

  if (metricasQ.isError)
    return (
      <PaginaNexo
        {...cabecalho}
        leitura={<LeituraDaTela fatos={null} carregando={false} erro="A consulta falhou." semSelo />}
        corpo={<NxErro texto="Não foi possível carregar os números do CRM. A consulta falhou. Nenhum resultado foi substituído por zero." onTentar={() => void metricasQ.refetch()} />}
      />
    );

  const leituraDoFunil = <LeituraDaTela fatos={fatos} carregando={diag.isLoading} erro={diag.error ? "A leitura do funil falhou." : null} semSelo />;

  if (!m || m.total_leads === 0) {
    return (
      <PaginaNexo
        {...cabecalho}
        leitura={leituraDoFunil}
        corpo={
          <div className="nexo-comercial">
            <EntradaDoKanban clientId={clientId} />
            <QualidadeDados clientId={clientId} fonte="crm" titulo="Dados do CRM com erro" />
            <p className="nx-vazio text-center text-sm">Ainda sem leads sincronizados do {crmNome} pra esse cliente.</p>
          </div>
        }
      />
    );
  }

  const decididos = m.ganhos + m.perdidos;
  const taxaConversao = decididos > 0 ? fmtTaxa(m.ganhos, decididos) : null;
  // Em aberto é só o card aberto. O card fechado na origem sem resultado (FlwChat) aparece à parte.
  // Banco sem a contagem nova: vale a conta antiga (total menos ganhos e perdidos).
  const temAbertos = m.abertos != null && Number.isFinite(Number(m.abertos));
  const fechadosSemResultado = temAbertos ? Number(m.fechados ?? 0) : 0;
  const emDisputa = temAbertos ? Number(m.abertos) : m.total_leads - decididos;
  // Zero que não é fato: há leads em aberto, mas nenhuma etapa foi marcada como "consulta agendada"
  // nem "em atendimento". O número real só aparece depois que a equipe marca as etapas em "A analisar".
  const etapasPorConfirmar = emDisputa > 0 && m.consultas_agendadas === 0 && m.em_atendimento === 0;
  // Consulta agendada sem nenhuma etapa marcada (pelo nome ou pela equipe): "sem dado", nunca 0.
  const consultaSemEtapa = m.consulta_configurada === false || (m.consulta_configurada == null && etapasPorConfirmar);
  const MOTIVO_CONSULTA = "sem dado: nenhuma etapa do CRM está marcada como consulta agendada (a equipe marca em A analisar)";
  const baseCurta = decididos > 0 && decididos < m.total_leads * 0.3;

  const base = m.total_leads;
  const fontePct = m.fonte_preenchida_pct;

  // Os 4 cartões do topo: os mesmos números que a tela já mostra (D-07). Sem medida vira "Sem dado" listrado, nunca 0.
  const novos = pessoas ? pessoas.pessoas_novas : periodo?.novos;
  const ganhosDoPeriodo = pessoas ? pessoas.ganhos : periodo?.ganhos;
  const carregandoPeriodo = periodoQ.isPending;
  const cartoes: [ReactNode, ReactNode, ReactNode, ReactNode] = [
    <NxCartaoNumero
      key="novos"
      icone="users"
      titulo="Leads novos"
      subtitulo={periodoTxt}
      valor={carregandoPeriodo ? "…" : novos != null ? fmtN(novos) : null}
      semMedida={!carregandoPeriodo && novos == null}
      legenda="no período"
    />,
    <NxCartaoNumero
      key="ganhos"
      icone="checklist"
      titulo={pessoas ? "Cards ganhos" : "Ganhos"}
      subtitulo={pessoas ? `valor dos ganhos: ${fmtBRL(pessoas.valor_ganho)}` : periodoTxt}
      valor={carregandoPeriodo ? "…" : ganhosDoPeriodo != null ? fmtN(ganhosDoPeriodo) : null}
      semMedida={!carregandoPeriodo && ganhosDoPeriodo == null}
      legenda="no período"
    />,
    <NxCartaoNumero
      key="consulta"
      icone="calendar"
      titulo="Em consulta agendada hoje"
      subtitulo="base inteira"
      valor={fmtN(m.consultas_agendadas)}
      semMedida={consultaSemEtapa}
      legenda={consultaSemEtapa ? undefined : "cards"}
    />,
    <NxCartaoNumero
      key="atendimento"
      icone="message-circle"
      titulo="Em atendimento"
      subtitulo={etapasPorConfirmar ? "as etapas ainda não foram marcadas" : m.em_atendimento_valor > 0 ? fmtBRL(m.em_atendimento_valor) : "base inteira"}
      valor={fmtN(m.em_atendimento)}
      semMedida={etapasPorConfirmar}
      legenda={etapasPorConfirmar ? undefined : "cards"}
    />,
  ];

  const alertas = [
    !ehRelatorio && <QualidadeDados key="qualidade" clientId={clientId} fonte="crm" titulo="Dados do CRM com erro" />,
    diag.data?.dados.crmCompartilhado && (
      <CmAviso key="compartilhado" tom="critico" titulo="Mesmos dados de outro cliente:">
        esta conta de CRM também está ligada a {diag.data.dados.crmCompartilhado.clientes} outro(s) cliente(s)
        {diag.data.dados.crmCompartilhado.nomes.length ? ` (${diag.data.dados.crmCompartilhado.nomes.join(", ")})` : ""}. Os números abaixo não são só deste médico.
      </CmAviso>
    ),
  ].filter(Boolean);

  return (
    <PaginaNexo
      {...cabecalho}
      leitura={leituraDoFunil}
      cartoes={cartoes}
      principal={
        funilDesenhado ? (
          <NxCard id="funil-comercial" nivel={2} icone={icT("filter")} titulo="Onde o funil quebra" subtitulo="Conversou → Fechou · toque numa etapa">
            <NxFunilDesenhado titulo="Funil comercial do período" funil={funilDesenhado} />
          </NxCard>
        ) : undefined
      }
      corpo={alertas.length ? <div className="nexo-comercial">{alertas}</div> : undefined}
      detalhe={
        <div className="nexo-comercial">
          <EntradaDoKanban clientId={clientId} />

          <NxCard id="crm-periodo" nivel={2} icone={icT("calendar")} titulo="No período selecionado" subtitulo={`Leads criados entre ${periodoTxt}`}>
            {periodoQ.isPending ? (
              <p role="status" className="text-sm">Carregando os números do período…</p>
            ) : periodoQ.isError ? (
              <div role="alert" className="space-y-2 text-sm">
                <p>Não foi possível consultar os números deste período. A base geral continua disponível abaixo.</p>
                <button type="button" className="ws-action ws-action--secondary" disabled={periodoQ.isFetching} onClick={() => void periodoQ.refetch()}>
                  Tentar novamente
                </button>
              </div>
            ) : periodo && pessoas ? (
              <>
                <div className="nx-grade nx-grade--4">
                  <CmKpi i={0} icone="users" rotulo="Leads novos" valor={fmtN(pessoas.pessoas_novas)} info={info("Leads novos", "Pessoas que aparecem pela primeira vez no CRM no período, em funil de captação; não conta quem já é paciente nem funil de compra.")} />
                  <CmKpi i={1} icone="users" rotulo="Pessoas no período" valor={fmtN(pessoas.pessoas)} info={info("Pessoas no período", "Pessoas diferentes com pelo menos um card criado no período, novas ou não.")} />
                  <CmKpi i={2} icone="file-text" rotulo="Cards criados" valor={fmtN(pessoas.cards)} nota={`até ${fmtN(pessoas.max_cards_por_pessoa)} por pessoa`} info={info("Cards criados", "A mesma pessoa pode ter vários cards (orçamentos, retornos, funis diferentes).")} />
                  <CmKpi i={3} icone="checklist" rotulo="Cards ganhos" valor={fmtN(pessoas.ganhos)} nota={`valor dos ganhos: ${fmtBRL(pessoas.valor_ganho)}`} />
                </div>
                <CmMetodo titulo="Por que leads novos é menor que cards">
                  <p>
                    Leads novos contam <b>pessoas</b>, não cards. No período foram {fmtN(pessoas.cards)} cards de {fmtN(pessoas.pessoas)} pessoas (até{" "}
                    {fmtN(pessoas.max_cards_por_pessoa)} por pessoa): {fmtN(pessoas.pessoas_novas)} são leads novos e {fmtN(pessoas.pessoas_recorrentes)} já tinham
                    registro antes, são pacientes da casa ou estão só em funil de compra ({fmtN(pessoas.cards_de_recorrentes)} dos cards). Valor dos cards no
                    período: {fmtBRL(pessoas.valor)}.
                  </p>
                </CmMetodo>
              </>
            ) : periodo ? (
              <div className="nx-grade nx-grade--4">
                <CmKpi i={0} icone="users" rotulo="Leads novos" valor={fmtN(periodo.novos)} />
                <CmKpi i={1} icone="checklist" rotulo="Ganhos" valor={fmtN(periodo.ganhos)} />
                <CmKpi i={2} icone="x" rotulo="Perdidos" valor={fmtN(periodo.perdidos)} />
                <CmKpi i={3} icone="briefcase" rotulo="Valor dos cards" valor={fmtBRL(periodo.valor)} />
              </div>
            ) : (
              <p className="nx-vazio text-sm">Sem dado: o CRM não devolveu os números deste período. Isso não quer dizer que foram zero.</p>
            )}
            {!ehRelatorio && (
              <CmMetodo titulo="De onde vêm estes números">
                <p>O que está acontecendo no CRM ({crmNome}) agora, direto do banco; atualiza sozinho todo dia.</p>
                {crmProvider === "kommo" && (
                  <p>
                    Os números aqui são de <strong>leads</strong> (os negócios/cards do funil), não de conversas de chat. Por isso ficam menores que as
                    “Conversas em andamento” que o Kommo mostra: um mesmo lead pode ter várias conversas, e muita conversa nunca vira lead.
                  </p>
                )}
              </CmMetodo>
            )}
            {ehRelatorio && (
              <CmMetodo titulo="De onde vêm estes números">
                <p>Números do relatório de CRM da semana 31/08–04/09/2026 (gerado em 08/09/2026), enviado pela equipe da clínica e exportado do Kommo. Não atualiza automaticamente.</p>
              </CmMetodo>
            )}
          </NxCard>

          <NxCard id="onde-quebra" nivel={2} icone={icT("filter")} titulo="Onde o funil quebra, passo a passo" subtitulo={`Entrou → foi atendido → agendou → comprou · ${periodoTxt}`}>
            {diag.isLoading && <p className="text-sm" style={{ color: "var(--muted-ink)" }}>Calculando o funil…</p>}
            {diag.error && <p className="text-sm" style={{ color: "var(--crit)" }}>{mensagemDeErro(diag.error, "o funil")}</p>}
            {diag.data && <FunilOndeQuebra funil={diag.data.funil} />}
            <CmMetodo>
              <p>
                Quatro passos, cada um com quantos chegaram e o percentual sobre o passo anterior (base diferente da “taxa de conversão” mais abaixo, que continua
                sendo ganhos ÷ (ganhos + perdidos) da base inteira). A caixa no topo mostra onde mais gente fica pelo caminho.
              </p>
            </CmMetodo>
          </NxCard>

          {diag.data && (
            <NxCard id="travando" nivel={2} icone={icT("bulb")} titulo="O que está travando" subtitulo="Cada problema com o tipo, quem resolve e o que fazer" className="cm-leitura">
              <ProblemasPorTipo porTipo={diag.data.porTipo} clientId={clientId} />
            </NxCard>
          )}
          {diag.data && <ListaLimitacoes itens={diag.data.limitacoes} />}

          {!ehRelatorio && <FunisPeriodo clientId={clientId} start={start} end={end} />}
          {!ehRelatorio && <OrcamentosPorTipo clientId={clientId} start={start} end={end} />}

          {/* A leitura de sempre do CRM: mesmos números, fórmulas e janelas de antes. */}
          <NxSectionHeader titulo="Base geral do CRM · histórico completo" subtitulo="Todo o histórico sincronizado; não segue o período do topo." />

          {(etapasPorConfirmar || consultaSemEtapa || fechadosSemResultado > 0) && (
            <div className="cm-avisos">
              {(etapasPorConfirmar || consultaSemEtapa) && (
                <CmAviso tom="atencao" titulo="A configurar:">
                  {etapasPorConfirmar
                    ? "as etapas de consulta agendada e em atendimento ainda não foram marcadas."
                    : "nenhuma etapa do CRM está marcada como consulta agendada, então esse número fica sem dado."}
                </CmAviso>
              )}
              {fechadosSemResultado > 0 && (
                <CmAviso
                  tom="atencao"
                  titulo={`${fmtN(fechadosSemResultado)} cards fechados sem resultado:`}
                  detalhe={<>Eles não contam como em aberto, nem como ganho, nem como perdido. Para entrarem na conversão, a equipe precisa marcar ganho ou perdido no próprio {crmNome}.</>}
                >
                  o {crmNome} fechou esses cards sem dizer se ganharam ou perderam.
                </CmAviso>
              )}
            </div>
          )}

          <div className="nx-grade cm-grade-5">
            <CmKpi i={0} icone="users" rotulo="Leads na base" valor={fmtN(m.total_leads)} info={info("Leads na base", "Todo o histórico, sem os removidos no CRM e só leads com etapa conhecida (não segue o período).")} />
            <CmKpi
              i={1}
              icone="calendar"
              rotulo="Em consulta agendada hoje"
              valor={consultaSemEtapa ? "sem dado" : fmtN(m.consultas_agendadas)}
              apagado={consultaSemEtapa}
              info={info("Em consulta agendada hoje", consultaSemEtapa ? MOTIVO_CONSULTA : "Todo o histórico, não segue o período. O número do período está em \"Por funil, no período\".")}
            />
            <CmKpi
              i={2}
              icone="message-circle"
              rotulo="Em atendimento"
              valor={etapasPorConfirmar ? "a configurar" : fmtN(m.em_atendimento)}
              apagado={etapasPorConfirmar}
              nota={etapasPorConfirmar ? "as etapas ainda não foram marcadas" : m.em_atendimento_valor > 0 ? fmtBRL(m.em_atendimento_valor) : undefined}
            />
            <CmKpi i={3} icone="file-text" rotulo="Cards criados (7 dias)" valor={fmtN(m.novos_7d)} />
            <CmKpi
              i={4}
              icone="target"
              rotulo="Campo de origem preenchido"
              valor={fontePct == null ? "sem dado" : `${fontePct}%`}
              apagado={fontePct == null}
              info={info("Campo de origem preenchido", fontePct == null ? "Preenchimento indisponível." : "Mede o preenchimento, inclusive nomes de funil. A validade da origem aparece no checklist de dados.")}
            />
          </div>

          <div className="cm-par">
            <NxCard id="funil-base" nivel={2} icone={icT("filter")} titulo="Funil: do lead ao resultado" subtitulo={`${fmtN(base)} leads na base · cada barra é a fatia da base`}>
              <CmBarras
                rotulo="Leads da base em cada situação"
                max={base}
                itens={[
                  { chave: "base", rotulo: "Leads na base", valor: m.total_leads, texto: fmtN(m.total_leads), apoio: fmtTaxa(m.total_leads, base), icone: "users" },
                  { chave: "disputa", rotulo: "Ainda em disputa", valor: emDisputa, texto: fmtN(emDisputa), apoio: fmtTaxa(emDisputa, base), nota: "cards abertos", icone: "target" },
                  ...(fechadosSemResultado > 0
                    ? [{ chave: "fechados", rotulo: "Fechados sem resultado", valor: fechadosSemResultado, texto: fmtN(fechadosSemResultado), apoio: fmtTaxa(fechadosSemResultado, base), nota: "o CRM fechou sem dizer se ganhou ou perdeu", tom: "g" as const, icone: "x" as const }]
                    : []),
                  {
                    chave: "atendimento",
                    rotulo: "Em atendimento",
                    valor: etapasPorConfirmar ? null : m.em_atendimento,
                    texto: etapasPorConfirmar ? "a configurar" : fmtN(m.em_atendimento),
                    apoio: etapasPorConfirmar ? undefined : fmtTaxa(m.em_atendimento, base),
                    nota: !etapasPorConfirmar && m.em_atendimento_valor > 0 ? fmtBRL(m.em_atendimento_valor) : undefined,
                    icone: "message-circle",
                  },
                  {
                    chave: "consulta",
                    rotulo: "Em consulta agendada hoje",
                    valor: consultaSemEtapa ? null : m.consultas_agendadas,
                    texto: consultaSemEtapa ? "sem dado" : fmtN(m.consultas_agendadas),
                    apoio: consultaSemEtapa ? undefined : fmtTaxa(m.consultas_agendadas, base),
                    nota: consultaSemEtapa ? "nenhuma etapa marcada como consulta agendada" : undefined,
                    icone: "calendar",
                  },
                  { chave: "ganhos", rotulo: "Ganhos", valor: m.ganhos, texto: fmtN(m.ganhos), apoio: fmtTaxa(m.ganhos, base), tom: "up", icone: "checklist" },
                  { chave: "perdidos", rotulo: "Perdidos", valor: m.perdidos, texto: fmtN(m.perdidos), apoio: fmtTaxa(m.perdidos, base), tom: "dn", icone: "x" },
                ]}
              />
              <CmMetodo>
                <p>
                  Cada barra mostra quantos leads estão naquela situação e o percentual sobre os {fmtN(base)} leads da base. Taxa de conversão = ganhos ÷ (ganhos +
                  perdidos). “Ainda em disputa” são os cards abertos. Os fechados no CRM sem dizer se ganharam ou perderam aparecem à parte e não entram em nenhuma
                  das contas.
                </p>
              </CmMetodo>
            </NxCard>
            <NxCard id="conversao" className="cm-medidor-cheio" nivel={2} icone={icT("target")} titulo="Taxa de conversão" subtitulo="Ganhos ÷ (ganhos + perdidos), base inteira">
              {decididos > 0 ? (
                <NxMedidor
                  rotulo="Taxa de conversão"
                  centro={taxaConversao ?? "sem dado"}
                  legendaCentro="taxa de conversão"
                  segmentos={[
                    { rotulo: `Ganhos · ${fmtN(m.ganhos)}`, valor: m.ganhos, cor: "var(--b1)" },
                    { rotulo: `Perdidos · ${fmtN(m.perdidos)}`, valor: m.perdidos, cor: "var(--b5)" },
                  ]}
                />
              ) : (
                <div className="cm-numerao">
                  <b>sem dado</b>
                  <span>Nenhum card ganho ou perdido ainda.</span>
                </div>
              )}
              {baseCurta && (
                <CmAviso tom="atencao">
                  Só {fmtN(decididos)} de {fmtN(m.total_leads)} leads têm resultado: a taxa ainda descreve uma parte pequena da base.
                </CmAviso>
              )}
            </NxCard>
          </div>

          {diag.data && (
            <CmRecolhido titulo="Checklist de dados" subtitulo="O que precisa estar no CRM para o painel conseguir responder">
              <ChecklistDados itens={diag.data.checklist} clientId={clientId} />
            </CmRecolhido>
          )}

          {!ehRelatorio && <BaseVivaCrm clientId={clientId} />}
          {!ehRelatorio && <AtendimentoResumo clientId={clientId} />}
          {!ehRelatorio && <LinksShortio clientId={clientId} />}
          {/* Coorte, estoque e movimentos (src/lib/crm-visoes.ts). */}
          <VisoesComerciais clientId={clientId} start={start} end={end} />

          <CmRecolhido titulo="Ver dados completos" subtitulo="Leads por dia, atividade recente, fonte e procedimento">
            <div className="cm-par">
              <TendenciaDeLeads clientId={clientId} start={start} end={end} />
              <AtividadeRecente clientId={clientId} />
            </div>
            <div className="cm-par cm-par--igual">
              <PorCampo clientId={clientId} start={start} end={end} title="Leads por fonte" fieldPatterns={["%Fonte do Lead%", "%Origem do Lead%"]} emptyLabel="Nenhum lead com fonte identificada ainda." icone="speakerphone" />
              <PorCampo
                clientId={clientId}
                start={start}
                end={end}
                title="Leads por tipo de procedimento"
                fieldPatterns={["%Tipo de Procedim%"]}
                emptyLabel="O CRM não tem o campo de tipo de procedimento preenchido nos cards deste período."
                icone="stethoscope"
              />
            </div>
          </CmRecolhido>
        </div>
      }
    />
  );
}
