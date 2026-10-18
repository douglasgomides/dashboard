import { createFileRoute } from "@tanstack/react-router";
import { CreativeWorkspace } from "@/features/creative-intelligence/workspace";
import { creativeEntrySchema } from "@/lib/creative-intelligence/editorial";
export const Route = createFileRoute(
  "/_authenticated/$clientId/inteligencia-criativa",
)({ component: Page, validateSearch: (search) => creativeEntrySchema.parse(search) });
function Page() {
  const { clientId } = Route.useParams();
  const entry = Route.useSearch();
  return <CreativeWorkspace key={`${clientId}:${entry.aba}:${entry.conta}:${entry.adaptacao}`} clientId={clientId} entry={entry} />;
}
