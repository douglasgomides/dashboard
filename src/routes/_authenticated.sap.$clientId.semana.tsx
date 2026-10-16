import { createFileRoute } from "@tanstack/react-router";
import { EstaSemanaSap } from "@/components/sap-semana";
import { LeadsAtencao } from "@/components/sap-ia-atendimento";
import { useAuth } from "@/hooks/use-auth";

// Sistema de Aquisição · Esta semana: o que vence nos próximos 7 dias, por papel.
export const Route = createFileRoute("/_authenticated/sap/$clientId/semana")({
  component: SemanaPage,
});

function SemanaPage() {
  const { clientId } = Route.useParams();
  const { isAdmin } = useAuth();
  return (
    <div className="space-y-4">
      <EstaSemanaSap clientId={clientId} />
      {isAdmin && <LeadsAtencao clientId={clientId} />}
    </div>
  );
}
