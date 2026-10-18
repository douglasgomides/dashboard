import { createFileRoute } from "@tanstack/react-router";
import { PainelAgentes, RecuperarHoje, RoteirosProntos } from "@/components/agentes-ia";
import { useClientRole } from "@/hooks/use-client-role";

// Sistema agêntico no SAP: os mesmos agentes do Hub. Recuperação e Roteirista entregam aqui mesmo; Anúncios e
// Campanhas entregam na tela Mídia.
export const Route = createFileRoute("/_authenticated/sap/$clientId/agentes")({
  component: AgentesSap,
});

function AgentesSap() {
  const { clientId } = Route.useParams();
  const { podeEditar } = useClientRole(clientId);
  return (
    <div className="space-y-4">
      <PainelAgentes clientId={clientId} produto="sap" />
      <RecuperarHoje clientId={clientId} podeEditar={podeEditar} />
      <RoteirosProntos clientId={clientId} podeEditar={podeEditar} />
    </div>
  );
}
