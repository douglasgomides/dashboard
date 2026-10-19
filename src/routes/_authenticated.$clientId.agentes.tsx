import { createFileRoute } from "@tanstack/react-router";
import { PainelAgentes } from "@/components/agentes-ia";

// Sistema agêntico do Hub: o que cada agente faz para esta clínica, quando roda e o que espera a equipe.
export const Route = createFileRoute("/_authenticated/$clientId/agentes")({
  component: AgentesHub,
  validateSearch: (s: Record<string, unknown>) => ({ agente: typeof s.agente === "string" ? s.agente : undefined }),
});

function AgentesHub() {
  const { clientId } = Route.useParams();
  const { agente } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <PainelAgentes key={clientId} clientId={clientId} produto="hub" selecionado={agente} onSelecionar={(id, irParaEntregas) => void navigate({ hash: irParaEntregas ? "agent-review-workspace" : "", search: (prev: Record<string, unknown>) => ({ ...prev, agente: id }) as never, resetScroll: false })} />;
}
