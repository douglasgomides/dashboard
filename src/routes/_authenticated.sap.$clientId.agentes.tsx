import { createFileRoute } from "@tanstack/react-router";
import { PainelAgentes, RoteirosProntos } from "@/components/agentes-ia";
import { SapAcessosOperacao } from "@/components/sap-acessos-operacao";
import { useClientRole } from "@/hooks/use-client-role";

// A operação de implantação pertence ao SAP. Recuperação de pacientes fica no Nexo.
export const Route = createFileRoute("/_authenticated/sap/$clientId/agentes")({
  component: AgentesSap,
});

function AgentesSap() {
  const { clientId } = Route.useParams();
  const { podeEditar } = useClientRole(clientId);
  return (
    <div className="space-y-4">
      <SapAcessosOperacao clientId={clientId} />
      <PainelAgentes clientId={clientId} produto="sap" />
      <RoteirosProntos clientId={clientId} podeEditar={podeEditar} />
    </div>
  );
}
