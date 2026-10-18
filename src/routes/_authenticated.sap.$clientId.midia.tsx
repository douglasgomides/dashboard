import { createFileRoute } from "@tanstack/react-router";
import { RegrasMidiaSap } from "@/components/sap-midia";
import { VerbaSap } from "@/components/sap-verba-fidelizacao";
import { EstrategiasIA } from "@/components/estrategias-ia";
import { useClientRole } from "@/hooks/use-client-role";

// Sistema de Aquisição · Mídia: regras do SAP sobre as campanhas (verba por consulta, fadiga, pausa, escala) e as
// estratégias do agente Estrategista de Campanhas (as mesmas da aba Campanhas do Hub).
export const Route = createFileRoute("/_authenticated/sap/$clientId/midia")({
  component: MidiaSap,
});

function MidiaSap() {
  const { clientId } = Route.useParams();
  const { podeEditar } = useClientRole(clientId);
  return (
    <div className="space-y-4">
      <VerbaSap clientId={clientId} />
      <RegrasMidiaSap clientId={clientId} />
      <EstrategiasIA clientId={clientId} podeEditar={podeEditar} />
    </div>
  );
}
