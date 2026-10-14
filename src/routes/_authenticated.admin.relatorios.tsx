import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { listAllClients } from "@/lib/admin-data";
import { formatRangeLabel } from "@/lib/date-range";

export const Route = createFileRoute("/_authenticated/admin/relatorios")({
  component: RelatoriosDaSemana,
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Semana anterior completa, de segunda a domingo, no horário local.
export function semanaAnterior(hoje = new Date()): { de: string; ate: string } {
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7) - 7);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  return { de: iso(seg), ate: iso(dom) };
}

type Estado = { s: "gerando" } | { s: "ok" } | { s: "erro"; msg: string };

// Relatórios da semana: um PDF por cliente (marketing + comercial + auditoria das conversas), com a
// semana anterior já preenchida. É o mesmo relatório completo da tela Relatório, gerado aqui em lote.
function RelatoriosDaSemana() {
  const inicial = semanaAnterior();
  const [de, setDe] = useState(inicial.de);
  const [ate, setAte] = useState(inicial.ate);
  const [estado, setEstado] = useState<Record<string, Estado>>({});
  const { data: clientes, isLoading } = useQuery({ queryKey: ["admin-clients"], queryFn: listAllClients });
  const ativos = (clientes ?? []).filter((c: any) => c.active !== false).sort((a: any, b: any) => a.name.localeCompare(b.name));

  async function baixar(clientId: string) {
    setEstado((e) => ({ ...e, [clientId]: { s: "gerando" } }));
    try {
      const { gerarEBaixarRelatorioCompleto } = await import("@/lib/relatorio-completo");
      await gerarEBaixarRelatorioCompleto({ clientId, start: de, end: ate, periodLabel: formatRangeLabel({ start: de, end: ate }) });
      setEstado((e) => ({ ...e, [clientId]: { s: "ok" } }));
    } catch (err) {
      setEstado((e) => ({ ...e, [clientId]: { s: "erro", msg: err instanceof Error ? err.message : String(err) } }));
    }
  }

  async function baixarTodos() {
    for (const c of ativos) await baixar(c.id); // um por vez: cada um faz leituras ao vivo e abre um download
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Relatórios da semana</h2>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Um PDF por cliente com a marca Doctor Creator: marketing (conteúdo e anúncios), comercial (CRM e WhatsApp) e a auditoria das conversas.
          A semana anterior (segunda a domingo) já vem preenchida.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          De
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="ml-2 rounded-lg border px-2 py-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
        </label>
        <label className="text-sm">
          Até
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="ml-2 rounded-lg border px-2 py-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
        </label>
        <button type="button" onClick={baixarTodos} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--accent-fg, #fff)" }}>
          <Download size={14} aria-hidden /> Baixar todos ({ativos.length})
        </button>
      </div>
      {isLoading && <p className="text-sm">Carregando clientes…</p>}
      <ul className="divide-y rounded-xl border" style={{ borderColor: "var(--border)" }}>
        {ativos.map((c: any) => {
          const e = estado[c.id];
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <div className="min-w-0">
                <div className="font-medium">{c.name}</div>
                {e?.s === "erro" && <div className="text-xs" style={{ color: "var(--crit)" }}><AlertTriangle size={12} className="mr-1 inline" aria-hidden />{e.msg}</div>}
              </div>
              <button
                type="button"
                onClick={() => baixar(c.id)}
                disabled={e?.s === "gerando"}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-sm disabled:opacity-60"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                {e?.s === "gerando" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : e?.s === "ok" ? <CheckCircle2 size={14} style={{ color: "var(--good)" }} aria-hidden /> : <Download size={14} aria-hidden />}
                {e?.s === "gerando" ? "Gerando…" : e?.s === "ok" ? "Baixado" : "Baixar PDF"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
