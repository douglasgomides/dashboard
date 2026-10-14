import { createFileRoute } from "@tanstack/react-router";
import { CadastroSap } from "@/components/sap-tracker";
import { PlanoSap } from "@/components/sap-plano";

// Sistema de Aquisição · Metas e garantia: baseline D0, metas D90 (03.07) e garantia condicionada (01.02).
export const Route = createFileRoute("/_authenticated/$clientId/sap/metas")({
  component: MetasSap,
});

function MetasSap() {
  const { clientId } = Route.useParams();
  return (
    <div className="space-y-6">
      <CadastroSap clientId={clientId} />
      <PlanoSap clientId={clientId} />
    </div>
  );
}
