import { createFileRoute } from "@tanstack/react-router";
import { PlanoSemana } from "@/components/plano-semana";

// Nexo · Plano da semana (Plano de ação): as ações da semana, em ordem de valor, conferidas na semana seguinte.
export const Route = createFileRoute("/_authenticated/$clientId/plano")({
  component: PlanoNexo,
});

function PlanoNexo() {
  const { clientId } = Route.useParams();
  return (
    <div className="grid gap-4">
      <div className="hpagehead"><h2>Plano da semana</h2></div>
      <PlanoSemana clientId={clientId} base={`/${clientId}`} contexto="nexo" />
    </div>
  );
}
