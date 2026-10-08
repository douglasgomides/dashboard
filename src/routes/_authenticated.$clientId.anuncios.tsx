import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { statusDoCliente, diasDeAtraso, ddmm } from "@/lib/saude-fontes";
import { motivoDaLinha, COR_DONO } from "@/lib/motivos";
import { SeloDono } from "@/components/selo-dono";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { getAdsResumo, getAdsPorDia, getAdsPorObjetivo, getAdsDiagnostico, getClientFontes } from "@/lib/client-data";
import { SyncButton } from "@/components/sync-button";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { fmtNum, fmtBRL } from "@/lib/format";
import {
  Wallet,
  MessageCircle,
  Coins,
  Eye,
  MousePointerClick,
  Percent, Stethoscope,
    Rocket,
  Scissors,
  TrendingDown,
  PauseCircle,
  CheckCircle2,
  HelpCircle,
  AlertTriangle,
  Info,
  CalendarDays,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { Painel, Kpi, Selo, Miniatura, BarraFina, Ajuda } from "@/components/visual";

export const Route = createFileRoute("/_authenticated/$clientId/anuncios")({
  component: AnunciosPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

// PostgREST devolve numeric como número, mas um sum() grande pode chegar como
// string dependendo da versão — coagir aqui evita "R$ NaN" na tela.
function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function nOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

// A ordem importa: "Escalar" primeiro porque é a única linha que pede uma
// ação de crescimento; "Cortar" logo depois porque é dinheiro saindo agora.
const ORDEM_VEREDITO = [
  "Escalar",
  "Cortar",
  "Atrai mas não converte",
  "Sem tração",
  "Manter",
  "Volume insuficiente",
] as const;

const COR_VEREDITO: Record<string, string> = {
  Escalar: "var(--good)",
  Cortar: "var(--danger)",
  "Atrai mas não converte": "var(--warn)",
  "Sem tração": "var(--warn)",
  Manter: "var(--text-dim)",
  "Volume insuficiente": "var(--text-faint)",
};

const ICONE_VEREDITO: Record<string, LucideIcon> = {
  Escalar: Rocket,
  Cortar: Scissors,
  "Atrai mas não converte": TrendingDown,
  "Sem tração": PauseCircle,
  Manter: CheckCircle2,
  "Volume insuficiente": HelpCircle,
};

function Veredito({ nome }: { nome: string }) {
  const Icon = ICONE_VEREDITO[nome] ?? HelpCircle;
  const cor = COR_VEREDITO[nome] ?? "var(--text-dim)";
  return (
    <Selo cor={cor === "var(--text-faint)" ? "var(--muted)" : cor}>
      <Icon size={12} aria-hidden />
      {nome}
    </Selo>
  );
}

// Faixa curta com ícone; o texto longo fica no "i".
function Faixa({
  icone: Icon,
  cor = "var(--accent)",
  alerta = false,
  ajuda,
  children,
}: {
  icone: LucideIcon;
  cor?: string;
  alerta?: boolean;
  ajuda?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm"
      style={{
        background: alerta ? `color-mix(in srgb, ${cor} 12%, transparent)` : "var(--accent-soft)",
        borderColor: "var(--border)",
      }}
    >
      <Icon size={16} aria-hidden className="shrink-0" style={{ color: cor }} />
      <div className="min-w-0 flex-1">{children}</div>
      {ajuda && <Ajuda>{ajuda}</Ajuda>}
    </div>
  );
}

// Quando a fonte está parada, diz POR QUÊ e de quem é a ação (pagamento, campanhas desligadas, acesso vencido...).
function MotivoParada({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ["client-sync-status", clientId],
    queryFn: () => statusDoCliente(clientId),
    staleTime: 60_000,
    retry: false,
  });
  const l = data?.find((x) => x.fonte === "anuncios");
  const parada = l?.data_ate ? diasDeAtraso(l.data_ate) > 3 : false;
  const m = parada || l?.motivo ? motivoDaLinha(l) : null;
  if (!l || !m) return null;
  return (
    <Faixa icone={AlertTriangle} cor={COR_DONO[m.dono]} alerta>
      <div className="flex flex-wrap items-center gap-2">
        <b>{l.data_ate ? `Sem dado novo desde ${ddmm(l.data_ate)}` : "Sem dado de anúncios"}</b>
        <SeloDono dono={m.dono} />
      </div>
      <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
        {m.texto}
      </div>
    </Faixa>
  );
}

function tickDate(d: string) {
  return d.slice(5);
}

// Nome de campanha impulsionada vem truncado pela própria Meta (termina em
// "..."), então cortar mais só piora — o limite aqui é generoso de propósito.
function shortCampanha(nome: string) {
  return nome.length > 64 ? nome.slice(0, 63) + "…" : nome;
}

function AnunciosPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });

  const { data: resumo, isLoading: loadingResumo } = useQuery({
    queryKey: ["ads-resumo", clientId, start, end],
    queryFn: () => getAdsResumo(clientId, start, end),
  });
  const { data: porDia, isLoading: loadingDia } = useQuery({
    queryKey: ["ads-dia", clientId, start, end],
    queryFn: () => getAdsPorDia(clientId, start, end),
  });
  const { data: porObjetivo, isLoading: loadingObjetivo } = useQuery({
    queryKey: ["ads-objetivo", clientId, start, end],
    queryFn: () => getAdsPorObjetivo(clientId, start, end),
  });
  const { data: diagnostico, isLoading: loadingDiagnostico } = useQuery({
    queryKey: ["ads-diagnostico", clientId, start, end],
    queryFn: () => getAdsDiagnostico(clientId, start, end),
  });

  const isLoading = loadingResumo || loadingDia || loadingObjetivo || loadingDiagnostico;

  const porVeredito = ORDEM_VEREDITO.map((nome) => {
    const linhas = (diagnostico ?? []).filter((r) => r.veredito === nome);
    return {
      nome,
      campanhas: linhas.length,
      gasto: linhas.reduce((a, r) => a + n(r.gasto), 0),
      conversas: linhas.reduce((a, r) => a + n(r.conversas), 0),
    };
  }).filter((v) => v.campanhas > 0);

  const custos = (diagnostico ?? [])
    .map((r) => (r.custo_por_conversa == null ? null : n(r.custo_por_conversa)))
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  const medianaCusto = custos.length ? custos[Math.floor(custos.length / 2)] : 0;

  const desperdicio = (diagnostico ?? [])
    .filter((r) => r.veredito === "Atrai mas não converte" || r.veredito === "Sem tração")
    .reduce((a, r) => a + n(r.gasto), 0);
  const gasto = n(resumo?.gasto);
  const conversas = n(resumo?.conversas);

  const serie = (porDia ?? []).map((r) => ({
    dia: r.dia,
    gasto: n(r.gasto),
    conversas: n(r.conversas),
  }));

  // Sem gasto no período: descobrir se a conta está pausada (já teve gasto antes),
  // se está ligada mas nunca gastou, ou se nem está ligada. O texto muda para cada caso.
  const vazio = !isLoading && (!resumo || gasto === 0);
  const { data: fontes } = useQuery({
    queryKey: ["fontes", clientId],
    queryFn: () => getClientFontes(clientId),
    enabled: vazio,
  });
  const { data: ultimoGasto } = useQuery({
    queryKey: ["ads-ultimo-gasto", clientId],
    queryFn: async () => {
      const dias = await getAdsPorDia(clientId, "2024-01-01", end);
      const comGasto = (dias ?? []).filter((r) => n(r.gasto) > 0);
      return comGasto.length ? comGasto[comGasto.length - 1].dia : null;
    },
    enabled: vazio,
  });

  if (isLoading) {
    return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  }

  if (!resumo || gasto === 0) {
    const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const mensagemVazia = ultimoGasto
      ? `Anúncios pausados: o último investimento registrado foi em ${dataBR(ultimoGasto)}. Não houve gasto em ${periodLabel}.`
      : fontes?.tem_anuncios
        ? `A conta de anúncios está ligada, mas ainda não tem nenhum gasto registrado.`
        : `Sem investimento registrado em ${periodLabel}. Se a clínica anuncia, falta ligar a conta de anúncio a este cliente no cadastro.`;
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <SyncButton clientId={clientId} alvo="anuncios" />
        </div>
        <MotivoParada clientId={clientId} />
        <Faixa icone={Info}>Investimento em anúncios do Meta (Facebook e Instagram), por dia e por campanha.</Faixa>
        <Faixa icone={ultimoGasto || fontes?.tem_anuncios ? PauseCircle : AlertTriangle} cor="var(--warn)" alerta>
          {mensagemVazia}
        </Faixa>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <SyncButton clientId={clientId} alvo="anuncios" />
      </div>

      <MotivoParada clientId={clientId} />
      <Faixa
        icone={CalendarDays}
        ajuda={
          <>
            Investimento em anúncios do Meta em {periodLabel}, direto da conta de anúncio — não é estimativa.{" "}
            <strong>Conversa iniciada</strong> (Direct ou WhatsApp) é o resultado que dá para medir aqui: esta conta não
            tem pixel nem formulário instalado, então "leads" e "visitas à página" chegam zerados e ficam de fora. O
            sync roda automaticamente todo dia.
          </>
        }
      >
        Meta Ads · {periodLabel} · dados reais da conta
      </Faixa>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi icone={Wallet} rotulo="Investido" valor={fmtBRL(gasto)} dica={`${fmtNum(n(resumo.campanhas))} campanhas`} cor="var(--s1)" />
        <Kpi icone={MessageCircle} rotulo="Conversas iniciadas" valor={fmtNum(conversas)} dica="Direct e WhatsApp" cor="var(--good)" />
        <Kpi
          icone={Coins}
          rotulo="Custo por conversa"
          valor={conversas > 0 ? fmtBRL(nOrNull(resumo.custo_por_conversa) ?? gasto / conversas) : "—"}
          dica={conversas > 0 ? "Investido ÷ conversas" : "Nenhuma conversa no período"}
          cor="var(--accent)"
        />
        <Kpi icone={Eye} rotulo="Impressões" valor={fmtNum(n(resumo.impressoes))} dica={`CPM ${fmtBRL(nOrNull(resumo.cpm))}`} cor="var(--s2)" />
        <Kpi
          icone={MousePointerClick}
          rotulo="Cliques no link"
          valor={fmtNum(n(resumo.cliques_link))}
          dica={`CPC ${fmtBRL(nOrNull(resumo.cpc))}`}
          cor="var(--s3)"
        />
        <Kpi icone={Percent} rotulo="CTR" valor={`${(nOrNull(resumo.ctr) ?? 0).toFixed(2)}%`} dica="Cliques ÷ impressões" cor="var(--s7)" />
      </div>

      {(diagnostico?.length ?? 0) > 0 && (
        <Painel
          icone={Stethoscope}
          titulo="Diagnóstico das campanhas"
          resumo={`Régua: mediana da conta, ${fmtBRL(medianaCusto)} por conversa`}
          cor="var(--ai)"
          ajuda={
            <>
              A régua é a mediana desta conta no período — {fmtBRL(medianaCusto)} por conversa — e não benchmark de
              mercado. "Escalar" é quem converte a menos de 60% dessa mediana; "Cortar", quem passa do dobro. Campanha
              que rodou pouco fica como indeterminada, em vez de receber um veredito de mentira.
            </>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
            {porVeredito.map((v) => (
              <div key={v.nome} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                <Veredito nome={v.nome} />
                <div className="mt-2 text-lg font-semibold tabular-nums">{fmtBRL(v.gasto)}</div>
                <div className="mt-1.5">
                  <BarraFina valor={v.gasto} max={gasto} cor={COR_VEREDITO[v.nome] ?? "var(--muted)"} />
                </div>
                <div className="mt-1.5 text-xs" style={{ color: "var(--text-dim)" }}>
                  {v.campanhas} {v.campanhas === 1 ? "campanha" : "campanhas"} · {fmtNum(v.conversas)}{" "}
                  {v.conversas === 1 ? "conversa" : "conversas"}
                </div>
              </div>
            ))}
          </div>

          {desperdicio > 0 && (
            <div className="mb-4">
              <Faixa icone={AlertTriangle} cor="var(--crit)" alerta>
                <strong>{fmtBRL(desperdicio)}</strong> ({((desperdicio / gasto) * 100).toFixed(0)}% da verba) foram para
                campanhas que não geraram uma única conversa no período.
              </Faixa>
            </div>
          )}

          <ul className="space-y-3">
            {(diagnostico ?? []).map((r) => {
              const custo = r.custo_por_conversa == null ? null : n(r.custo_por_conversa);
              const corCusto =
                custo === null || medianaCusto <= 0
                  ? "var(--muted)"
                  : custo <= medianaCusto * 0.6
                    ? "var(--good)"
                    : custo >= medianaCusto * 2
                      ? "var(--crit)"
                      : "var(--accent)";
              const maxCusto = Math.max(medianaCusto * 2, custo ?? 0);
              return (
                <li key={r.campaign_id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-start gap-3">
                    {r.thumbnail_url && <Miniatura url={r.thumbnail_url} className="h-12 w-12" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Veredito nome={r.veredito} />
                        {r.ctr != null && (
                          <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                            CTR {n(r.ctr).toFixed(2)}%
                          </span>
                        )}
                      </div>
                      <div className="mt-1 break-words text-sm font-medium">
                        {r.permalink ? (
                          <a
                            href={r.permalink}
                            target="_blank"
                            rel="noreferrer"
                            title={r.campanha}
                            className="underline underline-offset-2"
                            style={{ color: "var(--accent)" }}
                          >
                            {shortCampanha(r.campanha)}
                          </a>
                        ) : (
                          <span title={r.campanha}>{shortCampanha(r.campanha)}</span>
                        )}
                      </div>
                      {r.motivo && (
                        <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
                          {r.motivo}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-1" style={{ color: "var(--text-dim)" }}>
                        <Wallet size={12} aria-hidden /> Investido
                      </div>
                      <div className="mt-0.5 text-sm font-semibold tabular-nums">{fmtBRL(n(r.gasto))}</div>
                      <div className="mt-1">
                        <BarraFina valor={n(r.gasto)} max={gasto} cor="var(--s1)" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1" style={{ color: "var(--text-dim)" }}>
                        <MessageCircle size={12} aria-hidden /> Conversas
                      </div>
                      <div className="mt-0.5 text-sm font-semibold tabular-nums">{fmtNum(n(r.conversas))}</div>
                      <div className="mt-1">
                        <BarraFina valor={n(r.conversas)} max={conversas} cor="var(--good)" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1" style={{ color: "var(--text-dim)" }}>
                        <Coins size={12} aria-hidden /> Custo
                      </div>
                      <div className="mt-0.5 text-sm font-semibold tabular-nums">{custo === null ? "—" : fmtBRL(custo)}</div>
                      <div className="mt-1">
                        {custo === null ? <BarraFina valor={0} max={1} /> : <BarraFina valor={custo} max={maxCusto} cor={corCusto} />}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px]" style={{ color: "var(--muted)" }}>
            Barras de investido e conversas: fatia do total da conta. Barra de custo: comparada à mediana ({fmtBRL(medianaCusto)}); verde = bem abaixo, vermelho = o dobro ou mais.
          </p>
        </Painel>
      )}

      <Painel
        icone={CalendarDays}
        titulo="Investimento e conversas por dia"
        resumo="Barra = gasto do dia · linha = conversas"
        cor="var(--s2)"
        ajuda={
          <>
            As barras são o gasto do dia; a linha, as conversas iniciadas. Dias em que a linha não acompanha a barra são
            os que merecem olhada.
          </>
        }
      >
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="dia" tickFormatter={tickDate} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="esq" tick={{ fontSize: 11 }} width={36} />
              <YAxis yAxisId="dir" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} width={28} />
              <Tooltip
                formatter={(value: number | string, name: string) =>
                  name === "Gasto" ? fmtBRL(n(value)) : fmtNum(n(value))
                }
                labelFormatter={(d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR")}
              />
              <Legend />
              <Bar yAxisId="esq" dataKey="gasto" name="Gasto" fill="var(--accent)" />
              <Line yAxisId="dir" type="monotone" dataKey="conversas" name="Conversas" stroke="var(--good)" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Painel>

      {(porObjetivo?.length ?? 0) > 1 && (
        <Painel
          icone={Layers}
          titulo="Por objetivo da campanha"
          resumo="Quanto da verba foi para cada objetivo"
          cor="var(--s7)"
          ajuda={
            <>
              O objetivo escolhido ao subir a campanha muda o custo por conversa mais do que qualquer outro ajuste. Vale
              comparar quanto foi investido em cada um.
            </>
          }
        >
          <ul className="space-y-3">
            {(porObjetivo ?? []).map((r) => {
              const fatia = gasto > 0 ? (n(r.gasto) / gasto) * 100 : 0;
              return (
                <li key={r.objetivo}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium" title={r.objetivo}>
                      {r.objetivo}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <b className="font-semibold">{fmtBRL(n(r.gasto))}</b>
                      <span className="ml-1.5 text-xs" style={{ color: "var(--text-dim)" }}>
                        {fatia.toFixed(0)}% da verba
                      </span>
                    </span>
                  </div>
                  <div className="mt-1">
                    <BarraFina valor={n(r.gasto)} max={gasto} cor="var(--s7)" />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
                    <span>
                      {fmtNum(n(r.campanhas))} {n(r.campanhas) === 1 ? "campanha" : "campanhas"}
                    </span>
                    <span>{fmtNum(n(r.conversas))} conversas</span>
                    <span>
                      custo por conversa{" "}
                      <b style={{ color: "var(--text)" }}>{r.custo_por_conversa == null ? "—" : fmtBRL(n(r.custo_por_conversa))}</b>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Painel>
      )}

      <Faixa
        icone={Info}
        ajuda={
          <>
            Alcance não aparece somado aqui de propósito: somar o alcance de cada dia conta a mesma pessoa várias vezes,
            e o número viraria uma versão inflada das impressões.
          </>
        }
      >
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          Alcance não é somado de propósito (contaria a mesma pessoa várias vezes).
        </span>
      </Faixa>
    </div>
  );
}
