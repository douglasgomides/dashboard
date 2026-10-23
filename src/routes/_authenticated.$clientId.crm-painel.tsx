import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { configCrm } from "@/lib/crm-operacao-data";
import { fmtTaxa } from "@/lib/metricas";
import { Carregando } from "@/components/sem-fonte";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  Users,
  CalendarCheck,
  Headset,
  Sparkles,
  Target,
  Trophy,
  XCircle,
  Hourglass,
  Percent,
  Filter,
  TrendingUp,
  Megaphone,
  Stethoscope,
  Activity,
  Info,
  AlertTriangle,
  ChevronDown,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import { Painel, Kpi, Selo, BarraFina, Ajuda } from "@/components/visual";
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

// Faixa curta com ícone: aviso/contexto em uma linha; o texto longo vai no "i".
function Faixa({
  icone: Icon,
  cor = "var(--accent)",
  children,
  ajuda,
  alerta = false,
}: {
  icone: LucideIcon;
  cor?: string;
  children: React.ReactNode;
  ajuda?: React.ReactNode;
  alerta?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm"
      style={{
        background: alerta ? `color-mix(in srgb, ${cor} 12%, transparent)` : "var(--accent-soft)",
        borderColor: "var(--border)",
      }}
    >
      <Icon size={16} aria-hidden style={{ color: cor }} className="shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {ajuda && <Ajuda>{ajuda}</Ajuda>}
    </div>
  );
}

// Uma etapa do funil: ícone, nome, número, barra proporcional à base e % da base.
function EtapaFunil({
  icone: Icon,
  rotulo,
  valor,
  base,
  cor,
  extra,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: number | null;
  base: number;
  cor: string;
  extra?: string;
}) {
  const pct = valor !== null && base > 0 ? fmtTaxa(valor, base) : null;
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `color-mix(in srgb, ${cor} 16%, transparent)`, color: cor }}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="truncate font-medium" title={String(rotulo ?? "")}>{rotulo}</span>
          <span className="shrink-0 tabular-nums">
            <b className="font-semibold">{valor === null ? "—" : fmtN(valor)}</b>
            {pct !== null && (
              <span className="ml-1.5 text-xs" style={{ color: "var(--text-dim)" }}>
                {pct}
              </span>
            )}
          </span>
        </div>
        <div className="mt-1">
          <BarraFina valor={valor ?? 0} max={base} cor={cor} />
        </div>
        {extra && (
          <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-dim)" }}>
            {extra}
          </div>
        )}
      </div>
    </li>
  );
}

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
    ? porPessoa.map((r) => ({
        dia: new Date(r.dia + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        total: r.pessoas_novas,
        cards: r.cards,
      }))
    : (data ?? []).map((r) => ({
        dia: new Date(r.dia + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        total: r.total,
        cards: r.total,
      }));

  return (
    <Painel icone={TrendingUp} titulo={porPessoa ? "Pessoas novas por dia" : "Novos leads por dia"} resumo={`Período: ${formatRangeLabel({ start, end })}`} cor="var(--s1)">
      {isLoading ? (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Carregando…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Sem leads criados nesse período.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="var(--text-faint)" interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} stroke="var(--text-faint)" allowDecimals={false} width={32} />
            <Tooltip formatter={(value: number, _n: string, item: { payload?: { cards?: number } }) => [porPessoa ? `${fmtN(value)} (${fmtN(item.payload?.cards ?? 0)} orçamentos no dia)` : fmtN(value), porPessoa ? "pessoas novas" : "leads"]} labelFormatter={(l) => `Dia ${l}`} />
            <Bar dataKey="total" fill="var(--accent)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Painel>
  );
}

function PorCampo({
  clientId,
  title,
  fieldPatterns,
  emptyLabel,
  color,
  icone,
  start,
  end,
}: {
  icone: LucideIcon;
  clientId: string;
  start: string;
  end: string;
  title: string;
  fieldPatterns: string[];
  emptyLabel: string;
  color: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["crm-funil-campo-chart-periodo", clientId, fieldPatterns, start, end],
    queryFn: () => getCrmFunilPorCampoPeriodoAlt(clientId, fieldPatterns, start, end),
  });

  const rows = (data ?? [])
    .filter((r) => r.chave !== "Não informado")
    .slice(0, 8)
    .map((r) => ({ chave: r.chave, total: r.total }));

  const max = rows.reduce((m, r) => Math.max(m, r.total), 0);
  const soma = rows.reduce((t, r) => t + r.total, 0);

  return (
    <Painel icone={icone} titulo={title} resumo={`Top ${rows.length || 8} — ${soma ? fmtN(soma) + " leads" : "sem dados"}`} cor={color}>
      {isLoading ? (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Carregando…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.chave}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate" title={r.chave}>
                  {r.chave}
                </span>
                <span className="shrink-0 tabular-nums">
                  <b className="font-semibold">{fmtN(r.total)}</b>
                  <span className="ml-1.5 text-xs" style={{ color: "var(--text-dim)" }}>
                    {fmtTaxa(r.total, soma)}
                  </span>
                </span>
              </div>
              <div className="mt-1">
                <BarraFina valor={r.total} max={max} cor={color} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Painel>
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
    <Painel icone={Activity} titulo="Atividade recente" resumo="Últimos leads que entraram" cor="var(--s7)">
      {isLoading ? (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Carregando…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Nenhum lead recente.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {rows.map((r) => (
            <li key={r.external_lead_id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium" title={String(r.nome ?? "")}>{r.nome}</div>
                <div className="truncate text-xs" style={{ color: "var(--text-dim)" }}>
                  {r.fonte} · {r.pipeline}
                </div>
              </div>
              <div className="min-w-0 max-w-[45%] shrink-0 text-right">
                <span
                  className="inline-block max-w-full truncate rounded-full px-2 py-0.5 align-top text-xs font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}
                  title={r.etapa}
                >
                  {r.etapa}
                </span>
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>
                  {r.criado_em ? timeAgo(r.criado_em) : "—"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}


function EntradaDoKanban({clientId}:{clientId:string}) {
 const q=useQuery({queryKey:["crm-operacao-config",clientId],queryFn:()=>configCrm(clientId),retry:false,staleTime:60_000});
 if(!q.data?.ativo)return null;
 return <section className="rounded-xl border p-4 space-y-2" style={{borderColor:"var(--border)"}} aria-label="Onde acompanhar os contatos">
  <h2 className="font-semibold">Este painel reúne os resultados importados do CRM</h2>
  <p className="text-sm">Para organizar responsáveis, retornos e próximas ações da clínica, use Contatos e oportunidades. As movimentações do quadro ficam no acompanhamento da equipe.</p>
  <Link to="/$clientId/crm-contatos" params={{clientId}} className="ws-action">Trabalhar os contatos</Link>
 </section>;
}

function CrmPainelPage() {
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

  if (isLoading) return <Carregando texto="Lendo o CRM…" />;

  if (metricasQ.isError) return <div role="alert" className="space-y-3 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}><h2 className="font-semibold">Não foi possível carregar os números do CRM</h2><p className="text-sm">A consulta falhou. Nenhum resultado foi substituído por zero.</p><button type="button" className="ws-action ws-action--secondary" disabled={metricasQ.isFetching} onClick={() => void metricasQ.refetch()}>Tentar novamente</button></div>;

  if (!m || m.total_leads === 0) {
    return (
      <div className="space-y-4">
      <EntradaDoKanban clientId={clientId}/>
      <QualidadeDados clientId={clientId} fonte="crm" titulo="Dados do CRM com erro" />
      <p className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
        Ainda sem leads sincronizados do {crmNome} pra esse cliente.
      </p>
      </div>
    );
  }

  const decididos = m.ganhos + m.perdidos;
  const taxaConversao = decididos > 0 ? fmtTaxa(m.ganhos, decididos) : null;
  const emDisputa = m.total_leads - decididos;
  // Zero que não é fato: há leads em aberto, mas nenhuma etapa foi marcada como "consulta agendada"
  // nem "em atendimento". O número real só aparece depois que a equipe marca as etapas em "A analisar".
  const etapasPorConfirmar = emDisputa > 0 && m.consultas_agendadas === 0 && m.em_atendimento === 0;
  const baseCurta = decididos > 0 && decididos < m.total_leads * 0.3;

  const base = m.total_leads;
  const fontePct = m.fonte_preenchida_pct;
  const ehRelatorio = clientId === "8d4b3b3f-74a7-419a-a113-35ebc02cb37f";

  return (
    <div className="space-y-4">
      <EntradaDoKanban clientId={clientId}/>
      {!ehRelatorio && <QualidadeDados clientId={clientId} fonte="crm" titulo="Dados do CRM com erro" />}
      {(crmProvider === "kommo" || crmProvider === "clint" || crmProvider === "rdstation" || crmProvider === "flwchat" || crmProvider === "digisac") && !ehRelatorio && (
        <div className="flex justify-end">
          <SyncButton clientId={clientId} alvo="crm" />
        </div>
      )}
      {ehRelatorio ? (
        <Faixa
          icone={Info}
          ajuda={
            <>
              Números do relatório de CRM da semana 31/08–04/09/2026 (gerado em 08/09/2026), enviado pela equipe da clínica e exportado do
              Kommo. Não atualiza automaticamente.
            </>
          }
        >
          Relatório semanal 31/08–04/09/2026 · <b>não atualiza sozinho</b>
        </Faixa>
      ) : (
        <Faixa
          icone={Info}
          ajuda={
            <>
              O que está acontecendo no CRM ({crmNome}) agora — direto do banco, atualiza sozinho todo dia.
              {crmProvider === "kommo" && (
                <div className="mt-2">
                  Os números aqui são de <strong>leads</strong> (os negócios/cards do funil), não de conversas de chat. Por isso ficam
                  menores que as “Conversas em andamento” que o Kommo mostra — um mesmo lead pode ter várias conversas, e muita conversa
                  nunca vira lead.
                </div>
              )}
            </>
          }
        >
          CRM {crmNome} · ao vivo, atualiza todo dia
          {crmProvider === "kommo" && (
            <span className="ml-1 text-xs" style={{ color: "var(--text-dim)" }}>
              · leads, não conversas
            </span>
          )}
        </Faixa>
      )}

      {/* Camada 1: onde o funil quebra, o que está travando e o que falta medir. */}
      {diag.data?.dados.crmCompartilhado && (
        <Faixa icone={AlertTriangle} cor="var(--crit)" alerta>
          <b>Mesmos dados de outro cliente:</b> esta conta de CRM também está ligada a {diag.data.dados.crmCompartilhado.clientes} outro(s)
          cliente(s)
          {diag.data.dados.crmCompartilhado.nomes.length ? ` (${diag.data.dados.crmCompartilhado.nomes.join(", ")})` : ""}. Os números
          abaixo não são só deste médico.
        </Faixa>
      )}

      <Painel
        icone={Sparkles}
        titulo="No período selecionado"
        resumo={`${pessoas ? "Orçamentos criados" : "Leads criados"} entre ${formatRangeLabel({ start, end })}`}
        cor="var(--s3)"
      >
        {periodoQ.isPending ? <p role="status" className="text-sm">Carregando os números do período…</p> : periodoQ.isError ? <div role="alert" className="space-y-2 text-sm"><p>Não foi possível consultar os números deste período. A base geral continua disponível abaixo.</p><button type="button" className="ws-action ws-action--secondary" disabled={periodoQ.isFetching} onClick={() => void periodoQ.refetch()}>Tentar novamente</button></div> : periodo && pessoas ? <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi icone={Users} rotulo="Pessoas novas" valor={fmtN(pessoas.pessoas_novas)} cor="var(--accent)" dica="pessoas que aparecem pela primeira vez no CRM dentro do período" />
            <Kpi icone={Users} rotulo="Pessoas com orçamento" valor={fmtN(pessoas.pessoas)} cor="var(--s1)" dica="pessoas diferentes com pelo menos um orçamento criado no período, novas ou não" />
            <Kpi icone={Target} rotulo="Orçamentos criados" valor={fmtN(pessoas.cards)} cor="var(--s3)" dica="cada card do painel é um orçamento; a mesma pessoa pode ter vários" />
            <Kpi icone={Trophy} rotulo="Orçamentos ganhos" valor={fmtN(pessoas.ganhos)} cor="var(--good)" dica={`valor dos ganhos: ${fmtBRL(pessoas.valor_ganho)}`} />
          </div>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            Neste CRM cada card é um <b>orçamento</b>, não uma pessoa. No período foram {fmtN(pessoas.cards)} orçamentos de {fmtN(pessoas.pessoas)} pessoas
            (até {fmtN(pessoas.max_cards_por_pessoa)} por pessoa): {fmtN(pessoas.pessoas_novas)} apareceram pela primeira vez e{" "}
            {fmtN(pessoas.pessoas_recorrentes)} já tinham orçamento antes ({fmtN(pessoas.cards_de_recorrentes)} dos orçamentos). Valor dos cards no período:{" "}
            {fmtBRL(pessoas.valor)}.
          </p>
        </div> : periodo && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi icone={Users} rotulo="Leads novos" valor={fmtN(periodo.novos)} cor="var(--accent)" />
          <Kpi icone={Trophy} rotulo="Ganhos" valor={fmtN(periodo.ganhos)} cor="var(--good)" />
          <Kpi icone={XCircle} rotulo="Perdidos" valor={fmtN(periodo.perdidos)} cor="var(--crit)" />
          <Kpi icone={Target} rotulo="Valor dos cards" valor={fmtBRL(periodo.valor)} cor="var(--s1)" />
        </div>}
      </Painel>

      {/* Camada 2: a leitura de sempre do CRM — mesmos números, fórmulas e janelas de antes. */}
      <h2 className="pt-2 text-sm font-semibold" style={{ color: "var(--text-dim)" }}>
        Base geral do CRM · histórico completo
      </h2>

      {etapasPorConfirmar && (
        <Faixa icone={AlertTriangle} cor="var(--warn)" alerta>
          <b>A configurar:</b> as etapas de consulta agendada e em atendimento ainda não foram marcadas.
        </Faixa>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi icone={Users} rotulo="Leads na base" valor={fmtN(m.total_leads)} cor="var(--s1)" dica="todo o histórico, sem os removidos no CRM e só leads com etapa conhecida (não segue o período)" />
        <Kpi
          icone={CalendarCheck}
          rotulo="Consultas agendadas"
          valor={etapasPorConfirmar ? "—" : fmtN(m.consultas_agendadas)}
          dica={etapasPorConfirmar ? "a configurar: as etapas ainda não foram marcadas" : undefined}
          cor="var(--accent)"
        />
        <Kpi
          icone={Headset}
          rotulo="Em atendimento"
          valor={etapasPorConfirmar ? "—" : fmtN(m.em_atendimento)}
          dica={
            etapasPorConfirmar
              ? "a configurar: as etapas ainda não foram marcadas"
              : m.em_atendimento_valor > 0
                ? fmtBRL(m.em_atendimento_valor)
                : undefined
          }
          cor="var(--good)"
        />
        <Kpi icone={Sparkles} rotulo="Novos (7 dias)" valor={fmtN(m.novos_7d)} cor="var(--s3)" />
        <Kpi
          icone={Target}
          rotulo="Campo de origem preenchido"
          valor={fontePct == null ? "—" : `${fontePct}%`}
          dica={fontePct == null ? "preenchimento indisponível" : "Mede o preenchimento, inclusive nomes de funil. A validade da origem aparece no checklist de dados."}
          cor={fontePct === 0 ? "var(--warn)" : "var(--s2)"}
        />
      </div>

      <Painel
        icone={Filter}
        titulo="Onde o funil quebra"
        resumo={`Entrou → foi atendido → agendou → comprou · ${formatRangeLabel({ start, end })}`}
        ajuda={
          <>
            Quatro passos, cada um com quantos chegaram e o percentual sobre o passo anterior (base diferente da “taxa de conversão” mais
            abaixo, que continua sendo ganhos ÷ (ganhos + perdidos) da base inteira). A caixa no topo mostra onde mais gente fica pelo
            caminho.
          </>
        }
      >
        {diag.isLoading && (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Calculando o funil…
          </p>
        )}
        {diag.error && (
          <p className="text-sm" style={{ color: "var(--crit)" }}>
            Não deu para montar o funil: {(diag.error as Error).message}
          </p>
        )}
        {diag.data && <FunilOndeQuebra funil={diag.data.funil} />}
      </Painel>

      {diag.data && (
        <Painel icone={Target} titulo="O que está travando" resumo="Cada problema com o tipo, quem resolve e o que fazer">
          <ProblemasPorTipo porTipo={diag.data.porTipo} clientId={clientId} />
        </Painel>
      )}

      {diag.data && (
        <Painel
          icone={ScanSearch}
          titulo="Checklist de dados"
          resumo="O que precisa estar no CRM para o painel conseguir responder"
          cor="var(--s7)"
        >
          <ChecklistDados itens={diag.data.checklist} clientId={clientId} />
        </Painel>
      )}

      {diag.data && <ListaLimitacoes itens={diag.data.limitacoes} />}

      <Painel
        icone={Filter}
        titulo="Funil: do lead ao resultado"
        resumo={`${fmtN(base)} leads na base — cada barra é a fatia da base`}
        ajuda={
          <>
            Cada barra mostra quantos leads estão naquela situação e o percentual sobre os {fmtN(base)} leads da base. Taxa de conversão =
            ganhos ÷ (ganhos + perdidos). “Ainda em disputa” são os leads que não foram nem ganhos nem perdidos.
          </>
        }
      >
        <div className="grid gap-5 lg:grid-cols-5">
          <ul className="space-y-3.5 lg:col-span-3">
            <EtapaFunil icone={Users} rotulo="Leads na base" valor={m.total_leads} base={base} cor="var(--s1)" />
            <EtapaFunil
              icone={Hourglass}
              rotulo="Ainda em disputa"
              valor={emDisputa}
              base={base}
              cor="var(--s3)"
              extra="não ganhos nem perdidos"
            />
            <EtapaFunil
              icone={Headset}
              rotulo="Em atendimento"
              valor={etapasPorConfirmar ? null : m.em_atendimento}
              base={base}
              cor="var(--good)"
              extra={etapasPorConfirmar ? "a configurar" : m.em_atendimento_valor > 0 ? fmtBRL(m.em_atendimento_valor) : undefined}
            />
            <EtapaFunil
              icone={CalendarCheck}
              rotulo="Consultas agendadas"
              valor={etapasPorConfirmar ? null : m.consultas_agendadas}
              base={base}
              cor="var(--accent)"
              extra={etapasPorConfirmar ? "a configurar" : undefined}
            />
            <EtapaFunil icone={Trophy} rotulo="Ganhos" valor={m.ganhos} base={base} cor="var(--good)" />
            <EtapaFunil icone={XCircle} rotulo="Perdidos" valor={m.perdidos} base={base} cor="var(--crit)" />
          </ul>
          <div
            className="flex flex-col items-center justify-center rounded-xl p-4 text-center lg:col-span-2"
            style={{ background: "var(--surface-2)" }}
          >
            <Percent size={20} aria-hidden style={{ color: "var(--accent)" }} />
            <div className="mt-1 text-4xl font-semibold tabular-nums">{taxaConversao ?? "—"}</div>
            <div className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>
              taxa de conversão
            </div>
            <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
              ganhos ÷ (ganhos + perdidos)
            </div>
            {baseCurta && (
              <div className="mt-2">
                <Selo cor="var(--warn)">
                  <AlertTriangle size={12} aria-hidden />
                  só {fmtN(decididos)} de {fmtN(m.total_leads)} com resultado
                </Selo>
              </div>
            )}
          </div>
        </div>
      </Painel>

      {!ehRelatorio && <BaseVivaCrm clientId={clientId} />}
      {!ehRelatorio && <AtendimentoResumo clientId={clientId} />}
      {!ehRelatorio && <LinksShortio clientId={clientId} />}
      {/* Coorte, estoque e movimentos (src/lib/crm-visoes.ts). */}
      <VisoesComerciais clientId={clientId} start={start} end={end} />

      {/* Camada 3: dados completos, abertos sob demanda. */}
      <details className="group rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-semibold">
          Ver dados completos (leads por dia, atividade, fonte e procedimento)
          <ChevronDown size={16} aria-hidden className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 p-3 pt-0 sm:p-4 sm:pt-0">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TendenciaDeLeads clientId={clientId} start={start} end={end} />
            </div>
            <AtividadeRecente clientId={clientId} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PorCampo
              clientId={clientId}
              start={start}
              end={end}
              title="Leads por fonte"
              fieldPatterns={["%Fonte do Lead%", "%Origem do Lead%"]}
              emptyLabel="Nenhum lead com fonte identificada ainda."
              color="var(--accent)"
              icone={Megaphone}
            />
            <PorCampo
              clientId={clientId}
              start={start}
              end={end}
              title="Leads por tipo de procedimento"
              fieldPatterns={["%Tipo de Procedim%"]}
              emptyLabel="Nenhum lead com procedimento identificado ainda."
              color="var(--good)"
              icone={Stethoscope}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
