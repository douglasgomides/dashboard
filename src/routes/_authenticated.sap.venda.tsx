import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SapFormulario, useRespostasDoc } from "@/components/sap-formulario";
import { useAuth } from "@/hooks/use-auth";
import { FORMULARIOS, progresso, totalSecao } from "@/lib/sap-formularios";

// Sistema de Aquisição · Diagnósticos de venda (01.05): pré-venda, ainda sem clínica no SAP. Um por interessado.
export const Route = createFileRoute("/_authenticated/sap/venda")({
  validateSearch: (s: Record<string, unknown>): { i?: string } => ({ i: typeof s.i === "string" ? s.i : undefined }),
  component: VendaPage,
});

function VendaPage() {
  const { isAdmin } = useAuth();
  const { i } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [novo, setNovo] = useState("");
  const q = useRespostasDoc(null);
  const f = FORMULARIOS["01.05"];
  if (!isAdmin) return <p className="note">Só a equipe da Doctor Creator vê os diagnósticos de venda.</p>;
  if (i) {
    return (
      <div className="space-y-3">
        <button type="button" className="text-sm underline" onClick={() => navigate({ search: {} })}>← Todos os diagnósticos de venda</button>
        <SapFormulario clinicaId={null} formulario={f} ref={i} titulo={`${f.nome} · ${i}`} />
      </div>
    );
  }
  const lista = (q.data ?? []).filter((r) => r.documento === "01.05");
  return (
    <div className="space-y-4">
      <header><p className="sap-eyebrow">Pré-venda</p><h2 className="text-xl font-semibold">Diagnósticos de venda (01.05)</h2>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>{f.serve}</p></header>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const n = novo.trim(); if (n) navigate({ search: { i: n } }); }}>
        <label className="min-w-[240px] flex-1 text-sm">Nome da clínica interessada
          <input value={novo} onChange={(x) => setNovo(x.target.value)} className="mt-1 block min-h-[38px] w-full rounded-md border px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
        </label>
        <button type="submit" className="ws-action ws-action--primary" disabled={!novo.trim()}>Começar diagnóstico</button>
      </form>
      {q.isLoading ? <p className="note">Carregando…</p> : !lista.length ? <p className="note">Nenhum diagnóstico de venda ainda.</p> : (
        <ul className="divide-y rounded-xl border" style={{ borderColor: "var(--border)" }}>
          {lista.map((r) => {
            const pr = progresso(f, r.dados);
            const sc = f.secoes.find((s) => s.total === "scorecard");
            const nota = sc ? totalSecao(sc, r.dados).valor : null;
            return (
              <li key={r.id}>
                <button type="button" className="flex w-full flex-wrap items-center gap-x-3 px-3 py-2.5 text-left" onClick={() => navigate({ search: { i: r.ref } })}>
                  <span className="min-w-0 flex-1 font-medium">{r.ref}</span>
                  <span className="text-xs" style={{ color: "var(--text-dim)" }}>{pr.preenchidos} de {pr.obrigatorios} campos{nota !== null ? ` · nota ${nota}/100` : ""}</span>
                  <span className="text-xs font-semibold" style={{ color: r.concluido_em ? "var(--good)" : "var(--muted)" }}>{r.concluido_em ? "Concluído" : "Rascunho"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
