import { createFileRoute } from "@tanstack/react-router";
import { PlanoSemana } from "@/components/plano-semana";

// SAP · Plano da semana: o mesmo plano do Nexo, dentro do programa (o histórico segue com a clínica no Nexo depois do D90).
export const Route = createFileRoute("/_authenticated/sap/$clientId/plano")({
  component: PlanoSap,
});

function PlanoSap() {
  const { clientId } = Route.useParams();
  return (
    <div className="grid gap-4">
      <div className="hpagehead"><h2>Plano da semana</h2></div>
      <PlanoSemana clientId={clientId} base={`/${clientId}`} contexto="sap" />
    </div>
  );
}
