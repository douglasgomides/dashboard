import { createFileRoute, getRouteApi } from "@tanstack/react-router";
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
  type LucideIcon,
} from "lucide-react";
import { Painel, Kpi, Selo, BarraFina, Ajuda } from "@/components/visual";
import {
  getCrmMetricasEssenciais,
  getCrmLeadsPorDia,
  getCrmAtividadeRecente,
  getCrmProvider,
  getCrmFunilPorCampoPeriodoAlt,
  getCrmLeadsPorDiaPeriodo,
  getCrmResumoPeriodo,
} from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { SyncButton } from "@/components/sync-button";

// Nome de exibição do CRM — evita chamar tudo de "Kommo" quando o cliente é Clint.
function nomeCrm(provider: string | null | undefined): string {
  if (provider === "clint") return "Clint";
  if (provider === "rdstation") return "RD Station";
  if (provider === "flwchat") return "WTS Chat";
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
  const pct = valor !== null && base > 0 ? Math.round((valor / base) * 100) : null;
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
          <span className="truncate font-medium">{rotulo}</span>
          <span className="shrink-0 tabular-nums">
            <b className="font-semibold">{valor === null ? "—" : fmtN(valor)}</b>
            {pct !== null && (
              <span className="ml-1.5 text-xs" style={{ color: "var(--text-dim)" }}>
                {pct}%
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

  const rows = (data ?? []).map((r) => ({
    dia: new Date(r.dia + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    total: r.total,
  }));

  return (
    <Painel icone={TrendingUp} titulo="Novos leads por dia" resumo={`Período: ${formatRangeLabel({ start, end })}`} cor="var(--s1)">
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
            <Tooltip formatter={(value: number) => [fmtN(value), "leads"]} labelFormatter={(l) => `Dia ${l}`} />
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
                    {soma > 0 ? Math.round((r.total / soma) * 100) : 0}%
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
                <div className="truncate font-medium">{r.nome}</div>
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

function CrmPainelPage() {
  const { clientId } = Route.useParams();
  const { data: m, isLoading } = useQuery({
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
  const { data: periodo } = useQuery({
    queryKey: ["crm-resumo-periodo", clientId, start, end],
    queryFn: () => getCrmResumoPeriodo(clientId, start, end),
  });

  if (isLoading) return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;

  if (!m || m.total_leads === 0) {
    return (
      <p className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
        Ainda sem leads sincronizados do {crmNome} pra esse cliente.
      </p>
    );
  }

  const decididos = m.ganhos + m.perdidos;
  const taxaConversao = decididos > 0 ? Math.round((m.ganhos / decididos) * 100) : null;
  const emDisputa = m.total_leads - decididos;
  // Zero que não é fato: há leads em aberto, mas nenhuma etapa foi marcada como "consulta agendada"
  // nem "em atendimento". O número real só aparece depois que a equipe marca as etapas em "A analisar".
  const etapasPorConfirmar = emDisputa > 0 && m.consultas_agendadas === 0 && m.em_atendimento === 0;
  const baseCurta = decididos > 0 && decididos < m.total_leads * 0.3;

  const base = m.total_leads;
  const fontePct = m.fonte_preenchida_pct ?? 0;
  const ehRelatorio = clientId === "8d4b3b3f-74a7-419a-a113-35ebc02cb37f";

  return (
    <div className="space-y-4">
      {(crmProvider === "kommo" || crmProvider === "clint" || crmProvider === "rdstation" || crmProvider === "flwchat") && !ehRelatorio && (
        <div className="flex justify-end">
          <SyncButton clientId={clientId} alvo="crm" />
        </div>
      )}
      {ehRelatorio ? (
        <Faixa
          icone={Info}
          ajuda={
            <>
              Números do relatório de CRM da semana 31/08–04/09/2026 (gerado em 08/09/2026), enviado pela equipe da
              clínica e exportado do Kommo. Não atualiza automaticamente.
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
                  Os números aqui são de <strong>leads</strong> (os negócios/cards do funil), não de conversas de chat.
                  Por isso ficam menores que as “Conversas em andamento” que o Kommo mostra — um mesmo lead pode ter
                  várias conversas, e muita conversa nunca vira lead.
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

      {etapasPorConfirmar && (
        <Faixa icone={AlertTriangle} cor="var(--warn)" alerta>
          <b>A configurar:</b> as etapas de consulta agendada e em atendimento ainda não foram marcadas.
        </Faixa>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi icone={Users} rotulo="Leads na base" valor={fmtN(m.total_leads)} cor="var(--s1)" />
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
          rotulo="Fonte identificada"
          valor={`${fontePct}%`}
          dica={fontePct === 0 ? "nenhum lead com origem preenchida" : "dos leads têm origem preenchida"}
          cor={fontePct === 0 ? "var(--warn)" : "var(--s2)"}
        />
      </div>

      <Painel
        icone={Filter}
        titulo="Funil: do lead ao resultado"
        resumo={`${fmtN(base)} leads na base — cada barra é a fatia da base`}
        ajuda={
          <>
            Cada barra mostra quantos leads estão naquela situação e o percentual sobre os {fmtN(base)} leads da base.
            Taxa de conversão = ganhos ÷ (ganhos + perdidos). “Ainda em disputa” são os leads que não foram nem ganhos
            nem perdidos.
          </>
        }
      >
        <div className="grid gap-5 lg:grid-cols-5">
          <ul className="space-y-3.5 lg:col-span-3">
            <EtapaFunil icone={Users} rotulo="Leads na base" valor={m.total_leads} base={base} cor="var(--s1)" />
            <EtapaFunil icone={Hourglass} rotulo="Ainda em disputa" valor={emDisputa} base={base} cor="var(--s3)" extra="não ganhos nem perdidos" />
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
            <div className="mt-1 text-4xl font-semibold tabular-nums">{taxaConversao !== null ? `${taxaConversao}%` : "—"}</div>
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

      <Painel icone={Sparkles} titulo="No período selecionado" resumo={`Leads criados entre ${formatRangeLabel({ start, end })}`} cor="var(--s3)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi icone={Users} rotulo="Leads novos" valor={fmtN(periodo?.novos ?? 0)} cor="var(--accent)" />
          <Kpi icone={Trophy} rotulo="Ganhos" valor={fmtN(periodo?.ganhos ?? 0)} cor="var(--good)" />
          <Kpi icone={XCircle} rotulo="Perdidos" valor={fmtN(periodo?.perdidos ?? 0)} cor="var(--crit)" />
          <Kpi icone={Target} rotulo="Valor dos cards" valor={fmtBRL(periodo?.valor ?? 0)} cor="var(--s1)" />
        </div>
      </Painel>

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
  );
}
