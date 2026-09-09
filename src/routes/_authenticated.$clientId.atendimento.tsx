import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import {
  getWtsResumo,
  getWtsPorDepartamento,
  getWtsPorAgente,
  getWtsVolumeDiario,
} from "@/lib/client-data";
import { SyncButton } from "@/components/sync-button";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { fmtNum } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/$clientId/atendimento")({
  component: AtendimentoPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function nOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

// Tempo de espera vai de segundos a horas na mesma tabela. Segundo cru é
// ilegível e minuto arredondado esconde a diferença entre 40s e 4min.
function dur(seg: number | null | undefined): string {
  if (seg === null || seg === undefined || !Number.isFinite(seg)) return "—";
  const s = Math.max(0, Math.trunc(seg));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
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

function AtendimentoPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });

  const { data: resumo, isLoading: loadingResumo } = useQuery({
    queryKey: ["wts-resumo", clientId, start, end],
    queryFn: () => getWtsResumo(clientId, start, end),
  });
  const { data: porDepartamento, isLoading: loadingDep } = useQuery({
    queryKey: ["wts-departamento", clientId, start, end],
    queryFn: () => getWtsPorDepartamento(clientId, start, end),
  });
  const { data: porAgente, isLoading: loadingAgente } = useQuery({
    queryKey: ["wts-agente", clientId, start, end],
    queryFn: () => getWtsPorAgente(clientId, start, end),
  });
  const { data: volumeDiario, isLoading: loadingDia } = useQuery({
    queryKey: ["wts-dia", clientId, start, end],
    queryFn: () => getWtsVolumeDiario(clientId, start, end),
  });

  const isLoading = loadingResumo || loadingDep || loadingAgente || loadingDia;
  const atendimentos = n(resumo?.atendimentos);

  if (isLoading) {
    return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  }

  if (!resumo || atendimentos === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <SyncButton clientId={clientId} alvo="atendimento" />
        </div>
        <p style={{ color: "var(--text-dim)" }}>
          Nenhum atendimento no período ({periodLabel}). Se a conta da WTS acabou de ser ligada, use o botão acima.
        </p>
      </div>
    );
  }

  const semRoteamento = n(resumo?.sem_roteamento);
  const fatiaSemRoteamento = atendimentos > 0 ? (semRoteamento / atendimentos) * 100 : 0;
  const coberturaEspera = n(resumo?.espera_cobertura);
  const coberturaAtendimento = n(resumo?.atendimento_cobertura);

  const serie = (volumeDiario ?? []).map((r) => ({
    dia: String(r.dia).slice(5),
    atendimentos: n(r.atendimentos),
    espera: nOrNull(r.espera_mediana_seg) === null ? null : Math.round(n(r.espera_mediana_seg) / 60),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Atendimento no WhatsApp · {periodLabel}
        </p>
        <SyncButton clientId={clientId} alvo="atendimento" />
      </div>

      {/* O dado da WTS é de uma clínica só, com as duas médicas dentro. Dizer
          isso na tela evita que alguém leia estes números como sendo de uma. */}
      <div
        className="rounded-xl border p-4 text-sm"
        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-dim)" }}
      >
        Estes números são <strong style={{ color: "var(--text)" }}>da clínica inteira</strong>, não de uma médica.
        A conta do WhatsApp é compartilhada: mesma recepção, mesma equipe. Não há no dado uma forma confiável de
        separar os atendimentos por médica — departamento, tag do contato, número e agente foram testados e
        nenhum separa.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Atendimentos" value={fmtNum(atendimentos)} hint={`${fmtNum(n(resumo?.contatos_distintos))} pessoas diferentes`} />
        <KpiCard
          label="Espera até a 1ª resposta"
          value={dur(nOrNull(resumo?.espera_mediana_seg))}
          hint={`mediana de ${fmtNum(coberturaEspera)} atendimentos com o dado`}
        />
        <KpiCard
          label="Duração do atendimento"
          value={dur(nOrNull(resumo?.atendimento_mediano_seg))}
          hint={`mediana de ${fmtNum(coberturaAtendimento)} atendimentos com o dado`}
        />
        <KpiCard
          label="Em andamento agora"
          value={fmtNum(n(resumo?.em_andamento))}
          hint={`${fmtNum(n(resumo?.concluidos))} concluídos no período`}
        />
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold">Sem roteamento</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="text-2xl font-semibold" style={{ color: fatiaSemRoteamento > 40 ? "var(--warn)" : "var(--text)" }}>
            {fatiaSemRoteamento.toFixed(0)}%
          </span>
          <span className="text-sm" style={{ color: "var(--text-dim)" }}>
            {fmtNum(semRoteamento)} de {fmtNum(atendimentos)} atendimentos caíram em “Geral”
          </span>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>
          Conversa que não foi para nenhuma equipe. É o número que precisa cair — e enquanto ele for alto, nenhum
          recorte por médica ou por especialidade vai ser confiável.
        </p>
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-3 text-sm font-semibold">Volume por dia e espera até a 1ª resposta</div>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "var(--text-dim)" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--text-dim)" }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--text-dim)" }} unit="min" />
              <Tooltip
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
                formatter={(v, name) =>
                  name === "espera"
                    ? [v === null || v === undefined ? "—" : `${Number(v)} min`, "Espera (mediana)"]
                    : [fmtNum(Number(v)), "Atendimentos"]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="atendimentos" name="Atendimentos" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="espera" name="espera" stroke="var(--warn)" dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-3 text-sm font-semibold">Por equipe</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--text-faint)" }}>
                <th className="py-2 text-left font-medium">Equipe</th>
                <th className="py-2 text-right font-medium">Atendimentos</th>
                <th className="py-2 text-right font-medium">Fatia</th>
                <th className="py-2 text-right font-medium">Espera</th>
                <th className="py-2 text-right font-medium">Duração</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
              {(porDepartamento ?? []).map((r) => (
                <tr key={r.departamento} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2">{r.departamento}</td>
                  <td className="py-2 text-right">{fmtNum(n(r.atendimentos))}</td>
                  <td className="py-2 text-right">{nOrNull(r.fatia) === null ? "—" : `${n(r.fatia).toFixed(1)}%`}</td>
                  <td className="py-2 text-right">{dur(nOrNull(r.espera_mediana_seg))}</td>
                  <td className="py-2 text-right">{dur(nOrNull(r.atendimento_mediano_seg))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="mb-3 text-sm font-semibold">Por atendente</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--text-faint)" }}>
                <th className="py-2 text-left font-medium">Atendente</th>
                <th className="py-2 text-right font-medium">Atendimentos</th>
                <th className="py-2 text-right font-medium">Concluídos</th>
                <th className="py-2 text-right font-medium">Espera</th>
                <th className="py-2 text-right font-medium">Duração</th>
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
              {(porAgente ?? []).map((r) => (
                <tr key={r.agente} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2">{r.agente}</td>
                  <td className="py-2 text-right">{fmtNum(n(r.atendimentos))}</td>
                  <td className="py-2 text-right">{fmtNum(n(r.concluidos))}</td>
                  <td className="py-2 text-right">{dur(nOrNull(r.espera_mediana_seg))}</td>
                  <td className="py-2 text-right">{dur(nOrNull(r.atendimento_mediano_seg))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
