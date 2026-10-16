import { createFileRoute } from "@tanstack/react-router";
import { QuemEQuem } from "@/components/sap-tarefas";

// Sistema de Aquisição · Quem é quem: uma pessoa do Hub por papel nesta clínica.
export const Route = createFileRoute("/_authenticated/sap/$clientId/papeis")({
  component: Papeis,
});

function Papeis() {
  const { clientId } = Route.useParams();
  return <QuemEQuem clientId={clientId} />;
}
