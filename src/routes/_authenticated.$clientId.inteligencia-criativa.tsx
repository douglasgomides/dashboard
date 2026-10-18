import { createFileRoute } from "@tanstack/react-router";
import { CreativeWorkspace } from "@/features/creative-intelligence/workspace";
export const Route = createFileRoute(
  "/_authenticated/$clientId/inteligencia-criativa",
)({ component: Page });
function Page() {
  const { clientId } = Route.useParams();
  return <CreativeWorkspace key={clientId} clientId={clientId} />;
}
