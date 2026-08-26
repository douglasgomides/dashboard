import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getCrmPipelineKanban } from "@/lib/client-data";

export const Route = createFileRoute("/_authenticated/$clientId/crm-estrutura")({
  component: CrmEstruturaPage,
});

type Row = { pipeline_id: string; pipeline_name: string; status_id: string; status_name: string; total: number; valor_total: number };

function fmtBRL(n: number) {
  return "R$ " + Math.round(n).toLocaleString("pt-BR");
}
function fmtN(n: number) {
  return n.toLocaleString("pt-BR");
}

// 142/143 são universais em toda conta Kommo: sempre "venda ganha"/"venda
// perdida", qualquer que seja o pipeline — confirmado direto na API
// (GET /leads/pipelines) nesta sessão, não é suposição por nome de etapa.
const WON_STATUS_ID = "142";
const LOST_STATUS_ID = "143";

function classify(row: Row, maxTotal: number): "won" | "lost" | "biggest" | "mapped" | "empty" {
  if (row.total === 0) return "empty";
  if (row.status_id === WON_STATUS_ID) return "won";
  if (row.status_id === LOST_STATUS_ID) return "lost";
  if (row.total === maxTotal) return "biggest";
  return "mapped";
}

const TAG_LABEL: Record<string, string> = { won: "Ganho", lost: "Perda", biggest: "Maior bolsão", mapped: "Ativa" };
const TAG_COLOR: Record<string, string> = {
  won: "var(--good)",
  lost: "var(--danger)",
  biggest: "var(--warn)",
  mapped: "var(--accent)",
};

function KanbanBoard({ pipelineId, pipelineName, rows }: { pipelineId: string; pipelineName: string; rows: Row[] }) {
  const total = rows.reduce((a, r) => a + r.total, 0);
  const valor = rows.reduce((a, r) => a + r.valor_total, 0);
  const maxTotal = Math.max(...rows.map((r) => r.total), 0);

  return (
    <div className="rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b p-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">{pipelineName}</h3>
          <span className="font-mono text-xs" style={{ color: "var(--text-faint)" }}>
            #{pipelineId}
          </span>
        </div>
        <div className="flex gap-3 text-xs" style={{ color: "var(--text-dim)" }}>
          <span>
            <b style={{ color: "var(--text)" }}>{fmtN(total)}</b> leads
          </span>
          <span>
            <b style={{ color: "var(--text)" }}>{fmtBRL(valor)}</b>
          </span>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto p-4">
        {rows.map((r) => {
          const state = classify(r, maxTotal);
          const isEmpty = state === "empty";
          return (
            <div
              key={r.status_id}
              className="w-44 flex-none rounded-lg border"
              style={{
                borderColor: isEmpty ? "var(--border)" : TAG_COLOR[state],
                background: isEmpty ? "var(--bg)" : "var(--surface-2)",
                opacity: isEmpty ? 0.6 : 1,
              }}
            >
              <div className="h-[3px] w-full rounded-t-lg" style={{ background: isEmpty ? "var(--border)" : TAG_COLOR[state] }} />
              <div className="flex flex-col gap-1.5 p-3">
                <div className="min-h-[2.5em] text-xs font-semibold" style={{ color: isEmpty ? "var(--text-faint)" : "var(--text)" }}>
                  {r.status_name}
                </div>
                <div className="font-mono text-lg font-medium" style={{ color: isEmpty ? "var(--text-faint)" : "var(--text)" }}>
                  {fmtN(r.total)}
                </div>
                {r.valor_total > 0 && (
                  <div className="font-mono text-[11px]" style={{ color: "var(--text-dim)" }}>
                    {fmtBRL(r.valor_total)}
                  </div>
                )}
                {!isEmpty && (
                  <span
                    className="mt-auto w-fit rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide"
                    style={{ background: "var(--surface)", color: TAG_COLOR[state] }}
                  >
                    {TAG_LABEL[state]}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CrmEstruturaPage() {
  const { clientId } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["crm-pipeline-kanban", clientId],
    queryFn: () => getCrmPipelineKanban(clientId),
  });

  const rows = (data ?? []) as Row[];

  const byPipeline = useMemo(() => {
    const map = new Map<string, { name: string; rows: Row[] }>();
    for (const r of rows) {
      if (!map.has(r.pipeline_id)) map.set(r.pipeline_id, { name: r.pipeline_name, rows: [] });
      map.get(r.pipeline_id)!.rows.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const totalA = a[1].rows.reduce((s, r) => s + r.total, 0);
      const totalB = b[1].rows.reduce((s, r) => s + r.total, 0);
      return totalB - totalA;
    });
  }, [rows]);

  const totalLeads = rows.reduce((a, r) => a + r.total, 0);
  const totalStages = rows.length;
  const emptyStages = rows.filter((r) => r.total === 0).length;
  const won = rows.filter((r) => r.status_id === WON_STATUS_ID).reduce((a, r) => a + r.total, 0);
  const lost = rows.filter((r) => r.status_id === LOST_STATUS_ID).reduce((a, r) => a + r.total, 0);
  const biggest = rows.reduce((max, r) => (r.total > (max?.total ?? -1) ? r : max), null as Row | null);

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4 text-sm"
        style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
      >
        Raio-x de como o CRM (Kommo) está organizado agora — todos os pipelines e etapas reais, com a posição de
        cada lead sincronizado. Não é auditoria de atendimento (não medimos resposta nem conteúdo de conversa), é um
        retrato da estrutura. Atualiza sozinho com o sync diário.
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-dim)" }}>Carregando…</p>
      ) : totalLeads === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
          Ainda sem leads sincronizados do Kommo pra esse cliente.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3 lg:grid-cols-5" style={{ borderColor: "var(--border)", background: "var(--border)" }}>
            {[
              { n: fmtN(totalLeads), l: "Leads na base" },
              { n: String(byPipeline.length), l: "Pipelines ativos" },
              { n: String(totalStages), l: "Etapas configuradas" },
              { n: String(won), l: 'Marcados "venda ganha"' },
              { n: `${emptyStages}/${totalStages}`, l: "Etapas nunca usadas" },
            ].map((s) => (
              <div key={s.l} className="p-4" style={{ background: "var(--surface)" }}>
                <div className="font-mono text-2xl font-medium">{s.n}</div>
                <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            {byPipeline.map(([pid, pl]) => (
              <KanbanBoard key={pid} pipelineId={pid} pipelineName={pl.name} rows={pl.rows} />
            ))}
          </div>

          <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <h2 className="mb-3 text-sm font-semibold">O que a estrutura revela</h2>
            <ul className="space-y-3 text-sm">
              {biggest && biggest.total > 0 && (
                <li className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                  <b>{Math.round((biggest.total / totalLeads) * 100)}% da base</b> ({fmtN(biggest.total)} leads) está
                  parada em <b>"{biggest.status_name}"</b> ({biggest.pipeline_name}) — é o maior bolsão isolado de
                  toda a conta.
                </li>
              )}
              <li className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                O status formal <b>"Venda Ganha"</b> foi usado em só <b>{won}</b> {won === 1 ? "lead" : "leads"} de{" "}
                {fmtN(totalLeads)} ({won > 0 ? ((won / totalLeads) * 100).toFixed(2) : "0"}%), contra{" "}
                <b>{fmtN(lost)}</b> marcados como perdidos. Se a conversão real é maior que isso, a equipe
                provavelmente sinaliza "virou paciente" de outro jeito (movendo o lead de pipeline, por exemplo) —
                vale confirmar com quem opera o CRM.
              </li>
              <li className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <b>
                  {emptyStages} das {totalStages} etapas
                </b>{" "}
                configuradas em {byPipeline.length} pipelines nunca receberam um lead sequer neste retrato. Pode ser
                desenho intencional ou etapa remanescente de uma reorganização anterior.
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
