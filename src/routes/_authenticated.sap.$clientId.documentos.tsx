import { createFileRoute, Link } from "@tanstack/react-router";
import { PlanoAcaoSap, RelatorioD90Sap } from "@/components/sap-documentos";

// Sistema de Aquisição · Plano de Ação e Metas (03.07) e Relatório de Encerramento D90 (08.07), gerados dos dados.
export const Route = createFileRoute("/_authenticated/sap/$clientId/documentos")({
  validateSearch: (s: Record<string, unknown>): { doc?: "plano" | "d90" } => ({ doc: s.doc === "d90" ? "d90" : s.doc === "plano" ? "plano" : undefined }),
  component: DocumentosPage,
});

function DocumentosPage() {
  const { clientId } = Route.useParams();
  const { doc = "plano" } = Route.useSearch();
  const aba = (d: "plano" | "d90", rot: string) => (
    <Link to="/sap/$clientId/documentos" params={{ clientId }} search={{ doc: d }} aria-current={doc === d ? "page" : undefined}
      className="inline-flex min-h-[38px] items-center rounded-lg border px-3 text-sm font-medium"
      style={{ borderColor: doc === d ? "var(--accent)" : "var(--border)", color: doc === d ? "var(--accent)" : "var(--text)" }}>
      {rot}
    </Link>
  );
  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        {aba("plano", "Plano de Ação e Metas (03.07)")}
        {aba("d90", "Relatório de Encerramento D90 (08.07)")}
      </div>
      {doc === "d90" ? <RelatorioD90Sap clientId={clientId} /> : <PlanoAcaoSap clientId={clientId} />}
    </div>
  );
}
