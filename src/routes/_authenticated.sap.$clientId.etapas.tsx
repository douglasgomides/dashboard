import { createFileRoute } from "@tanstack/react-router";
import { MarcosDoCrm } from "@/components/sap-tracker";
import { SinaisEMotivos } from "@/components/sap-atendimento";

// Sistema de Aquisição · Etapas no funil (equipe): o que cada etapa do CRM significa no funil do SAP.
export const Route = createFileRoute("/_authenticated/sap/$clientId/etapas")({
  component: EtapasSap,
});

function EtapasSap() {
  const { clientId } = Route.useParams();
  return (
    <div className="space-y-4">
      <MarcosDoCrm clientId={clientId} abertoInicial />
      <SinaisEMotivos clientId={clientId} />
    </div>
  );
}
