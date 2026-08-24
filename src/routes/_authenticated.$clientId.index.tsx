import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getMonthlyMetrics, getMetricsTrend, getPostsForAnalytics } from "@/lib/client-data";
import { formatLabel } from "@/lib/methodology";
import type { ContentFormat } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/$clientId/")({
  component: MonthlyOverview,
});

const TREND_DAYS = 90;
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const PERIODS = [
  { label: "Madrugada (0h–5h)", test: (h: number) => h < 6 },
  { label: "Manhã (6h–11h)", test: (h: number) => h >= 6 && h < 12 },
  { label: "Tarde (12h–17h)", test: (h: number) => h >= 12 && h < 18 },
  { label: "Noite (18h–23h)", test: (h: number) => h >= 18 },
];

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function sum(rows: { [k: string]: any }[], key: string) {
  return rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
}

function tickDate(d: string) {
  return d.slice(5);
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

function SinaisDeInteresse({ reach, contactTaps, newFollowers }: { reach: number; contactTaps: number; newFollowers: number }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-1 text-sm font-semibold">Alcance e sinais de interesse do mês</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        A Meta depreciou "visitas ao perfil" na API — não é mais possível montar um funil real com % de conversão
        entre essas etapas. São sinais paralelos, não um funil sequencial.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Alcance
          </div>
          <div className="mt-1 text-xl font-semibold">{reach.toLocaleString("pt-BR")}</div>
        </div>
        <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Toques em botões de contato
          </div>
          <div className="mt-1 text-xl font-semibold">{contactTaps.toLocaleString("pt-BR")}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
            endereço, ligar, e-mail, mensagem
          </div>
        </div>
        <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Novos seguidores
          </div>
          <div className="mt-1 text-xl font-semibold">{newFollowers.toLocaleString("pt-BR")}</div>
        </div>
      </div>
    </div>
  );
}

function MelhoresHorarios({ posts }: { posts: any[] }) {
  const ranked = useMemo(() => {
    const buckets = new Map<string, { weekday: string; period: string; total: number; count: number }>();
    for (const p of posts) {
      if (!p.posted_at || p.engagement == null) continue;
      const d = new Date(p.posted_at);
      const weekday = WEEKDAYS[d.getUTCDay()];
      const period = PERIODS.find((per) => per.test(d.getUTCHours()))?.label ?? "—";
      const key = `${weekday}__${period}`;
      const entry = buckets.get(key) ?? { weekday, period, total: 0, count: 0 };
      entry.total += p.engagement ?? 0;
      entry.count += 1;
      buckets.set(key, entry);
    }
    return Array.from(buckets.values())
      .filter((b) => b.count >= 2)
      .map((b) => ({ ...b, avg: b.total / b.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
  }, [posts]);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-1 text-sm font-semibold">Melhores horários pra postar</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
        Últimos {TREND_DAYS} dias, por engajamento médio (horário em UTC).
      </p>
      {ranked.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Poucos posts pra ranquear com confiança ainda.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
              <th className="pb-2">Dia</th>
              <th className="pb-2">Período</th>
              <th className="pb-2 text-right">Posts</th>
              <th className="pb-2 text-right">Engajamento médio</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr key={`${r.weekday}-${r.period}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5">{r.weekday}</td>
                <td className="py-1.5">{r.period}</td>
                <td className="py-1.5 text-right">{r.count}</td>
                <td className="py-1.5 text-right font-medium">{r.avg.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EngajamentoPorFormato({ posts }: { posts: any[] }) {
  const data = useMemo(() => {
    const groups = new Map<string, { total: number; count: number }>();
    for (const p of posts) {
      const key: ContentFormat | "não classificado" = p.format ?? "não classificado";
      const entry = groups.get(key) ?? { total: 0, count: 0 };
      entry.total += p.engagement ?? 0;
      entry.count += 1;
      groups.set(key, entry);
    }
    return Array.from(groups.entries()).map(([key, v]) => ({
      formato: key === "não classificado" ? key : formatLabel(key as ContentFormat),
      "Engajamento médio": v.count > 0 ? Math.round(v.total / v.count) : 0,
    }));
  }, [posts]);

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-3 text-sm font-semibold">Engajamento médio por formato</h2>
      {data.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Sem posts suficientes ainda.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="formato" tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <Tooltip />
            <Bar dataKey="Engajamento médio" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Painel de "por que esse alcance": lista os posts publicados no dia
// clicado num dos gráficos de linha/área, ordenados por alcance.
function DrillDownDoDia({ date, posts }: { date: string | null; posts: any[] }) {
  if (!date) {
    return (
      <div
        className="rounded-xl border border-dashed p-4 text-center text-xs"
        style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
      >
        Clique em um ponto dos gráficos acima pra ver o que foi publicado naquele dia.
      </div>
    );
  }

  const dayPosts = posts
    .filter((p) => p.posted_at && p.posted_at.slice(0, 10) === date)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}>
      <h2 className="mb-3 text-sm font-semibold">
        O que aconteceu em {new Date(date + "T12:00:00").toLocaleDateString("pt-BR")}
      </h2>
      {dayPosts.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Nenhum post publicado nesse dia — o alcance/interações vieram de posts anteriores continuando a circular.
        </p>
      ) : (
        <ul className="space-y-2">
          {dayPosts.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <a href={p.permalink ?? "#"} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                {(p.caption ?? p.windsor_media_id).split("\n")[0].slice(0, 90)}
              </a>
              <div className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                Alcance {(p.reach ?? 0).toLocaleString("pt-BR")} · Engajamento {(p.engagement ?? 0).toLocaleString("pt-BR")} ·
                Salvos {(p.saved ?? 0).toLocaleString("pt-BR")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MonthlyOverview() {
  const { clientId } = Route.useParams();
  const { start, end } = monthBounds();
  const since = daysAgo(TREND_DAYS);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["monthly-metrics", clientId, start, end],
    queryFn: () => getMonthlyMetrics(clientId, start, end),
  });

  const { data: trend } = useQuery({
    queryKey: ["metrics-trend", clientId, since],
    queryFn: () => getMetricsTrend(clientId, since),
  });

  const { data: postsForAnalytics } = useQuery({
    queryKey: ["posts-analytics", clientId, since],
    queryFn: () => getPostsForAnalytics(clientId, since),
  });

  function handleChartClick(e: any) {
    if (e?.activeLabel) setSelectedDate(e.activeLabel);
  }

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
  const contactTaps = sum(data, "profile_links_taps");
  const engagementRate = reach > 0 ? ((interactions / reach) * 100).toFixed(1) + "%" : "—";

  const chartData = data.map((d) => ({
    date: d.date,
    Alcance: d.reach ?? 0,
    Interações: d.total_interactions ?? 0,
  }));

  const trendData = (trend ?? []).map((d) => ({
    date: d.date,
    Alcance: d.reach ?? 0,
    "Seguidores ganhos": d.new_followers ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Novos seguidores" value={newFollowers.toLocaleString("pt-BR")} />
        <KpiCard label="Alcance" value={reach.toLocaleString("pt-BR")} />
        <KpiCard label="Taxa de engajamento" value={engagementRate} hint="interações ÷ alcance" />
        <KpiCard label="Salvamentos" value={saves.toLocaleString("pt-BR")} />
      </div>

      <SinaisDeInteresse reach={reach} contactTaps={contactTaps} newFollowers={newFollowers} />

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h2 className="mb-1 text-sm font-semibold">Alcance × interações no mês</h2>
        <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
          Clique em um ponto pra ver o que foi publicado naquele dia.
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} onClick={handleChartClick} style={{ cursor: "pointer" }}>
            <defs>
              <linearGradient id="reachFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tickFormatter={tickDate} tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
            <Tooltip labelFormatter={tickDate} />
            <Area type="monotone" dataKey="Alcance" stroke="var(--accent)" fill="url(#reachFill)" />
            <Area type="monotone" dataKey="Interações" stroke="var(--good)" fillOpacity={0} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h2 className="mb-1 text-sm font-semibold">Tendência geral — últimos {TREND_DAYS} dias</h2>
        <p className="mb-3 text-xs" style={{ color: "var(--text-dim)" }}>
          Alcance e seguidores ganhos lado a lado, pra ver o efeito de mudanças ao longo do tempo. Clique em um
          ponto pra ver o que foi publicado naquele dia.
        </p>
        {trendData.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Sem histórico suficiente ainda.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} onClick={handleChartClick} style={{ cursor: "pointer" }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={tickDate} tick={{ fontSize: 10 }} stroke="var(--text-faint)" interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="var(--text-faint)" />
              <Tooltip labelFormatter={tickDate} />
              <Line yAxisId="left" type="monotone" dataKey="Alcance" stroke="var(--accent)" dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="Seguidores ganhos" stroke="var(--good)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <DrillDownDoDia date={selectedDate} posts={postsForAnalytics ?? []} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EngajamentoPorFormato posts={postsForAnalytics ?? []} />
        <MelhoresHorarios posts={postsForAnalytics ?? []} />
      </div>
    </div>
  );
}
