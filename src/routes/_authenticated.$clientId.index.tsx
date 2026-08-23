import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { getMonthlyMetrics } from "@/lib/client-data";

export const Route = createFileRoute("/_authenticated/$clientId/")({
  component: MonthlyOverview,
});

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function sum(rows: { [k: string]: any }[], key: string) {
  return rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
}

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
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

function MonthlyOverview() {
  const { clientId } = Route.useParams();
  const { start, end } = monthBounds();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["monthly-metrics", clientId, start, end],
    queryFn: () => getMonthlyMetrics(clientId, start, end),
  });

  if (isLoading) {
    return <p style={{ color: "var(--text-dim)" }}>Carregando métricas do mês…</p>;
  }

  const data = rows ?? [];
  if (data.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-sm"
        style={{ background: "var(--warn-bg)", borderColor: "var(--warn-border)", color: "var(--text)" }}
      >
        Sem dados sincronizados pra este mês ainda. Rode <code>npm run sync:instagram</code> depois de
        cadastrar a conta do cliente em <code>instagram_accounts</code>.
      </div>
    );
  }

  const newFollowers = sum(data, "new_followers");
  const reach = sum(data, "reach");
  const saves = sum(data, "saves");
  const interactions = sum(data, "total_interactions");
  const engagementRate = reach > 0 ? ((interactions / reach) * 100).toFixed(1) + "%" : "—";

  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    Alcance: d.reach ?? 0,
    Interações: d.total_interactions ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Novos seguidores" value={newFollowers.toLocaleString("pt-BR")} />
        <KpiCard label="Alcance" value={reach.toLocaleString("pt-BR")} />
        <KpiCard label="Taxa de engajamento" value={engagementRate} hint="interações ÷ alcance" />
        <KpiCard label="Salvamentos" value={saves.toLocaleString("pt-BR")} />
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h2 className="mb-3 text-sm font-semibold">Alcance × interações no mês</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="reachFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <Tooltip />
            <Area type="monotone" dataKey="Alcance" stroke="var(--accent)" fill="url(#reachFill)" />
            <Area type="monotone" dataKey="Interações" stroke="var(--good)" fillOpacity={0} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
