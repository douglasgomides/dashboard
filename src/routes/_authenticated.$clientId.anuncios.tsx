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
import { getAdsResumo, getAdsPorDia, getAdsPorCampanha, getAdsPorObjetivo } from "@/lib/client-data";
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
  const { data: porCampanha, isLoading: loadingCampanha } = useQuery({
    queryKey: ["ads-campanha", clientId, start, end],
    queryFn: () => getAdsPorCampanha(clientId, start, end),
  });

  const isLoading = loadingResumo || loadingDia || loadingObjetivo || loadingCampanha;
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

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h2 className="mb-1 text-sm font-semibold">Campanhas</h2>
        <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
          Ordenadas por quanto consumiram. A pergunta é para onde foi o dinheiro primeiro, e o que ele trouxe depois.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
                <th className="pb-2">Campanha</th>
                <th className="pb-2">Objetivo</th>
                <th className="pb-2 text-right">Investido</th>
                <th className="pb-2 text-right">Cliques no link</th>
                <th className="pb-2 text-right">Conversas</th>
                <th className="pb-2 text-right">Custo por conversa</th>
              </tr>
            </thead>
            <tbody>
              {(porCampanha ?? []).map((r, i) => (
                <tr key={`${r.campanha}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5" title={r.campanha}>
                    {shortCampanha(r.campanha)}
                  </td>
                  <td className="py-1.5 text-xs" style={{ color: "var(--text-dim)" }}>
                    {r.objetivo ?? "—"}
                  </td>
                  <td className="py-1.5 text-right">{fmtBRL(n(r.gasto))}</td>
                  <td className="py-1.5 text-right" style={{ color: "var(--text-dim)" }}>
                    {fmtNum(n(r.cliques_link))}
                  </td>
                  <td className="py-1.5 text-right">{fmtNum(n(r.conversas))}</td>
                  <td className="py-1.5 text-right font-medium">
                    {r.custo_por_conversa == null ? "—" : fmtBRL(n(r.custo_por_conversa))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Alcance não aparece somado aqui de propósito: somar o alcance de cada dia conta a mesma pessoa várias vezes, e
        o número viraria uma versão inflada das impressões.
      </p>
    </div>
  );
}
