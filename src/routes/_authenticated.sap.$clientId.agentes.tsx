import { createFileRoute } from "@tanstack/react-router";
import { PainelAgentes } from "@/components/agentes-ia";
import { SapAcessosOperacao } from "@/components/sap-acessos-operacao";

// A operação de implantação pertence ao SAP. Recuperação de pacientes fica no Nexo.
export const Route = createFileRoute("/_authenticated/sap/$clientId/agentes")({
  component: AgentesSap,
  validateSearch: (s: Record<string, unknown>) => ({ agente: typeof s.agente === "string" ? s.agente : undefined }),
});

function AgentesSap() {
  const { clientId } = Route.useParams();
  const { agente } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div className="space-y-4">
      <SapAcessosOperacao clientId={clientId} />
      <PainelAgentes key={clientId} clientId={clientId} produto="sap" selecionado={agente} onSelecionar={(id, irParaEntregas) => void navigate({ hash: irParaEntregas ? "agent-review-workspace" : "", search: (prev: Record<string, unknown>) => ({ ...prev, agente: id }) as never, resetScroll: false })} />
    </div>
  );
}
