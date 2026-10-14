import { createFileRoute } from "@tanstack/react-router";
import { PlanoSap } from "@/components/sap-plano";

// Sistema de Aquisição · Metas e garantia: baseline D0, metas D90 (03.07) e garantia condicionada (01.02).
export const Route = createFileRoute("/_authenticated/sap/$clientId/metas")({
  component: MetasSap,
});

function MetasSap() {
  const { clientId } = Route.useParams();
  return <PlanoSap clientId={clientId} />;
}
