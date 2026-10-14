import { createFileRoute } from "@tanstack/react-router";
import { MarcosDoCrm } from "@/components/sap-tracker";

// Sistema de Aquisição · Etapas do CRM (equipe): o que cada etapa significa no funil do SAP.
export const Route = createFileRoute("/_authenticated/$clientId/sap/etapas")({
  component: EtapasSap,
});

function EtapasSap() {
  const { clientId } = Route.useParams();
  return <MarcosDoCrm clientId={clientId} abertoInicial />;
}
