import { createFileRoute } from "@tanstack/react-router";
import { PassoAPassoSap } from "@/components/sap-implantacao";

// Sistema de Aquisição · Passo a passo da implantação: o roteiro para qualquer pessoa da equipe implantar.
export const Route = createFileRoute("/_authenticated/sap/$clientId/passo-a-passo")({
  component: PassoAPasso,
});

function PassoAPasso() {
  const { clientId } = Route.useParams();
  return <PassoAPassoSap clientId={clientId} />;
}
