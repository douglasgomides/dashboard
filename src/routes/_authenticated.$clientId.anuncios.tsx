import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { getAdsResumo, getAdsPorDia, getAdsPorObjetivo, getAdsDiagnostico } from "@/lib/client-data";
import { SyncButton } from "@/components/sync-button";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { fmtNum, fmtBRL } from "@/lib/format";

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

function Veredito({ nome }: { nome: string }) {
  return (
    <span
      className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ color: COR_VEREDITO[nome] ?? "var(--text-dim)", borderColor: "var(--border)" }}
    >
      {nome}
    </span>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && (
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
          {hint}
        </div>
      )}
    </div>
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

  if (isLoading) {
    return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  }

  if (!resumo || gasto === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <SyncButton clientId={clientId} alvo="anuncios" />
        </div>
        <div
          className="rounded-xl border p-4 text-sm"
          style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
        >
          Investimento em anúncios do Meta (Facebook e Instagram), por dia e por campanha.
        </div>
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
          Sem investimento registrado em {periodLabel}. Se a clínica anuncia, falta ligar a conta de anúncio a este
          cliente no cadastro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <SyncButton clientId={clientId} alvo="anuncios" />
      </div>

      <div
        className="rounded-xl border p-4 text-sm"
        style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
      >
        Investimento em anúncios do Meta em {periodLabel}, direto da conta de anúncio — não é estimativa.{" "}
        <strong>Conversa iniciada</strong> (Direct ou WhatsApp) é o resultado que dá para medir aqui: esta conta não
        tem pixel nem formulário instalado, então "leads" e "visitas à página" chegam zerados e ficam de fora. O sync
        roda automaticamente todo dia.
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard label="Investido" value={fmtBRL(gasto)} hint={`${fmtNum(n(resumo.campanhas))} campanhas`} />
        <KpiCard
          label="Conversas iniciadas"
          value={fmtNum(conversas)}
          hint="Direct e WhatsApp"
        />
        <KpiCard
          label="Custo por conversa"
          value={conversas > 0 ? fmtBRL(nOrNull(resumo.custo_por_conversa) ?? gasto / conversas) : "—"}
          hint={conversas > 0 ? "Investido ÷ conversas" : "Nenhuma conversa no período"}
        />
        <KpiCard label="Impressões" value={fmtNum(n(resumo.impressoes))} hint={`CPM ${fmtBRL(nOrNull(resumo.cpm))}`} />
        <KpiCard
          label="Cliques no link"
          value={fmtNum(n(resumo.cliques_link))}
          hint={`CPC ${fmtBRL(nOrNull(resumo.cpc))}`}
        />
        <KpiCard label="CTR" value={`${(nOrNull(resumo.ctr) ?? 0).toFixed(2)}%`} hint="Cliques ÷ impressões" />
      </div>

      {(diagnostico?.length ?? 0) > 0 && (
        <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="mb-1 text-sm font-semibold">Diagnóstico das campanhas</h2>
          <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
            A régua é a mediana desta conta no período — {fmtBRL(medianaCusto)} por conversa — e não benchmark de
            mercado. "Escalar" é quem converte a menos de 60% dessa mediana; "Cortar", quem passa do dobro. Campanha
            que rodou pouco fica como indeterminada, em vez de receber um veredito de mentira.
          </p>

          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
            {porVeredito.map((v) => (
              <div key={v.nome} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                <Veredito nome={v.nome} />
                <div className="mt-2 text-lg font-semibold">{fmtBRL(v.gasto)}</div>
                <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                  {v.campanhas} {v.campanhas === 1 ? "campanha" : "campanhas"} · {fmtNum(v.conversas)}{" "}
                  {v.conversas === 1 ? "conversa" : "conversas"}
                </div>
              </div>
            ))}
          </div>

          {desperdicio > 0 && (
            <p className="mb-4 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
              <strong>{fmtBRL(desperdicio)}</strong> ({((desperdicio / gasto) * 100).toFixed(0)}% da verba) foram para
              campanhas que não geraram uma única conversa no período.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
                  <th className="pb-2">Campanha</th>
                  <th className="pb-2">Veredito</th>
                  <th className="pb-2 text-right">Investido</th>
                  <th className="pb-2 text-right">Conversas</th>
                  <th className="pb-2 text-right">Custo</th>
                  <th className="pb-2 text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {(diagnostico ?? []).map((r) => (
                  <tr key={r.campaign_id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2">
                      <div className="flex items-start gap-2">
                        {r.thumbnail_url && (
                          <img
                            src={r.thumbnail_url}
                            alt=""
                            loading="lazy"
                            className="h-10 w-10 shrink-0 rounded object-cover"
                            style={{ border: "1px solid var(--border)" }}
                            /* A URL é CDN do Instagram e expira; o sync diário
                               a renova. Se mesmo assim vier quebrada, some em
                               vez de mostrar ícone de imagem partida. */
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                        <div>
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
                          <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
                            {r.motivo}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <Veredito nome={r.veredito} />
                    </td>
                    <td className="py-2 text-right">{fmtBRL(n(r.gasto))}</td>
                    <td className="py-2 text-right">{fmtNum(n(r.conversas))}</td>
                    <td className="py-2 text-right font-medium">
                      {r.custo_por_conversa == null ? "—" : fmtBRL(n(r.custo_por_conversa))}
                    </td>
                    <td className="py-2 text-right" style={{ color: "var(--text-dim)" }}>
                      {r.ctr == null ? "—" : `${n(r.ctr).toFixed(2)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h2 className="mb-1 text-sm font-semibold">Investimento e conversas por dia</h2>
        <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
          As barras são o gasto do dia; a linha, as conversas iniciadas. Dias em que a linha não acompanha a barra são
          os que merecem olhada.
        </p>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="dia" tickFormatter={tickDate} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="esq" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="dir" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
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
      </div>

      {(porObjetivo?.length ?? 0) > 1 && (
        <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="mb-1 text-sm font-semibold">Por objetivo da campanha</h2>
          <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
            O objetivo escolhido ao subir a campanha muda o custo por conversa mais do que qualquer outro ajuste. Vale
            comparar quanto foi investido em cada um.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
                  <th className="pb-2">Objetivo</th>
                  <th className="pb-2 text-right">Campanhas</th>
                  <th className="pb-2 text-right">Investido</th>
                  <th className="pb-2 text-right">% da verba</th>
                  <th className="pb-2 text-right">Conversas</th>
                  <th className="pb-2 text-right">Custo por conversa</th>
                </tr>
              </thead>
              <tbody>
                {(porObjetivo ?? []).map((r) => {
                  const fatia = gasto > 0 ? (n(r.gasto) / gasto) * 100 : 0;
                  return (
                    <tr key={r.objetivo} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5">{r.objetivo}</td>
                      <td className="py-1.5 text-right" style={{ color: "var(--text-dim)" }}>
                        {fmtNum(n(r.campanhas))}
                      </td>
                      <td className="py-1.5 text-right">{fmtBRL(n(r.gasto))}</td>
                      <td className="py-1.5 text-right" style={{ color: "var(--text-dim)" }}>
                        {fatia.toFixed(0)}%
                      </td>
                      <td className="py-1.5 text-right">{fmtNum(n(r.conversas))}</td>
                      <td className="py-1.5 text-right font-medium">
                        {r.custo_por_conversa == null ? "—" : fmtBRL(n(r.custo_por_conversa))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Alcance não aparece somado aqui de propósito: somar o alcance de cada dia conta a mesma pessoa várias vezes, e
        o número viraria uma versão inflada das impressões.
      </p>
    </div>
  );
}
