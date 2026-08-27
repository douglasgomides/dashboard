import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { getCrmMetricasEssenciais, getCrmLeadsPorDia, getCrmFunilPorCampo } from "@/lib/client-data";

export const Route = createFileRoute("/_authenticated/$clientId/crm-painel")({
  component: CrmPainelPage,
});

function fmtBRL(n: number) {
  return "R$ " + Math.round(n).toLocaleString("pt-BR");
}
function fmtN(n: number) {
  return n.toLocaleString("pt-BR");
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="text-xs" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold" style={{ color: accent ?? "var(--text)" }}>
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

const PERIODS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

function TendenciaDeLeads({ clientId }: { clientId: string }) {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ["crm-leads-dia", clientId, days],
    queryFn: () => getCrmLeadsPorDia(clientId, days),
  });

  const rows = (data ?? []).map((r) => ({
    dia: new Date(r.dia + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    total: r.total,
  }));

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Novos leads por dia</h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setDays(p.days)}
              className="rounded-md px-2.5 py-1 text-xs font-medium"
              style={
                days === p.days
                  ? { background: "var(--accent)", color: "white" }
                  : { background: "var(--surface-2)", color: "var(--text-dim)" }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
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
            <YAxis tick={{ fontSize: 10 }} stroke="var(--text-faint)" allowDecimals={false} />
            <Tooltip formatter={(value: number) => [fmtN(value), "leads"]} labelFormatter={(l) => `Dia ${l}`} />
            <Bar dataKey="total" fill="var(--accent)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function PorFonte({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["crm-funil-fonte-chart", clientId],
    queryFn: () => getCrmFunilPorCampo(clientId, "%Fonte do Lead%"),
  });

  const rows = (data ?? [])
    .filter((r) => r.chave !== "Não informado")
    .slice(0, 8)
    .map((r) => ({ fonte: r.chave, total: r.total }));

  return (
    <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h2 className="mb-3 text-sm font-semibold">Leads por fonte</h2>
      {isLoading ? (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Carregando…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          Nenhum lead com fonte identificada ainda.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34)}>
          <BarChart data={rows} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--text-faint)" allowDecimals={false} />
            <YAxis type="category" dataKey="fonte" tick={{ fontSize: 11 }} stroke="var(--text-faint)" width={110} />
            <Tooltip formatter={(value: number) => [fmtN(value), "leads"]} />
            <Bar dataKey="total" fill="var(--accent)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function CrmPainelPage() {
  const { clientId } = Route.useParams();
  const { data: m, isLoading } = useQuery({
    queryKey: ["crm-metricas-essenciais", clientId],
    queryFn: () => getCrmMetricasEssenciais(clientId),
  });

  if (isLoading) return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;

  if (!m || m.total_leads === 0) {
    return (
      <p className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
        Ainda sem leads sincronizados do Kommo pra esse cliente.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4 text-sm"
        style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
      >
        O que está acontecendo no CRM (Kommo) agora — direto do banco, atualiza sozinho todo dia.
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Leads na base" value={fmtN(m.total_leads)} />
        <StatCard label="Consultas agendadas" value={fmtN(m.consultas_agendadas)} accent="var(--accent)" />
        <StatCard
          label="Em atendimento"
          value={fmtN(m.em_atendimento)}
          sub={m.em_atendimento_valor > 0 ? fmtBRL(m.em_atendimento_valor) : undefined}
          accent="var(--good)"
        />
        <StatCard label="Novos (7 dias)" value={fmtN(m.novos_7d)} />
        <StatCard
          label="Fonte identificada"
          value={`${m.fonte_preenchida_pct ?? 0}%`}
          sub="dos leads têm origem preenchida"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TendenciaDeLeads clientId={clientId} />
        <PorFonte clientId={clientId} />
      </div>
    </div>
  );
}
