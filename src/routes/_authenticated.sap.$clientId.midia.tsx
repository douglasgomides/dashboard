import { createFileRoute } from "@tanstack/react-router";
import { RegrasMidiaSap } from "@/components/sap-midia";
import { VerbaSap } from "@/components/sap-verba-fidelizacao";

// Sistema de Aquisição · Mídia: regras do SAP sobre as campanhas (verba por consulta, fadiga, pausa, escala).
export const Route = createFileRoute("/_authenticated/sap/$clientId/midia")({
  component: MidiaSap,
});

function MidiaSap() {
  const { clientId } = Route.useParams();
  return (
    <div className="space-y-4">
      <VerbaSap clientId={clientId} />
      <RegrasMidiaSap clientId={clientId} />
    </div>
  );
}
