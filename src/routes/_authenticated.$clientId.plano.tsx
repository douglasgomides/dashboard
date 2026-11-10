import { createFileRoute } from "@tanstack/react-router";
import { PlanoSemana } from "@/components/plano-semana";
import { PlanoCabecalho } from "@/components/nx/plano-pecas";

// Nexo · Plano da semana (Plano de ação): as ações da semana, em ordem de valor, conferidas na semana seguinte.
export const Route = createFileRoute("/_authenticated/$clientId/plano")({
  component: PlanoNexo,
});

function PlanoNexo() {
  const { clientId } = Route.useParams();
  return (
    <div className="nexo-plano">
      <PlanoCabecalho titulo="Plano de ação da semana" pergunta="De 3 a 5 ações em ordem de valor, conferidas nos dados na semana seguinte." />
      <PlanoSemana clientId={clientId} base={`/${clientId}`} contexto="nexo" />
    </div>
  );
}
