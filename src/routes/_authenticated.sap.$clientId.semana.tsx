import { createFileRoute } from "@tanstack/react-router";
import { EstaSemanaSap } from "@/components/sap-semana";

// Sistema de Aquisição · Esta semana: o que vence nos próximos 7 dias, por papel.
export const Route = createFileRoute("/_authenticated/sap/$clientId/semana")({
  component: SemanaPage,
});

function SemanaPage() {
  const { clientId } = Route.useParams();
  return <EstaSemanaSap clientId={clientId} />;
}
