import { createFileRoute } from "@tanstack/react-router";
import { CreativeWorkspace } from "@/features/creative-intelligence/workspace";
import { useAuth } from "@/hooks/use-auth";
export const Route = createFileRoute(
  "/_authenticated/$clientId/inteligencia-criativa",
)({ component: Page });
// Liberação controlada: só a equipe Doctor Creator usa enquanto o módulo é validado em produção.
function Page() {
  const { clientId } = Route.useParams();
  const { isAdmin } = useAuth();
  if (!isAdmin) return <p className="text-sm" style={{ color: "var(--text-dim)" }}>Inteligência Criativa em liberação para a equipe Doctor Creator.</p>;
  return <CreativeWorkspace key={clientId} clientId={clientId} />;
}
