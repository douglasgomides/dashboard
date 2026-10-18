import { createFileRoute } from "@tanstack/react-router";
import { PainelAgentes } from "@/components/agentes-ia";

// Sistema agêntico do Hub: o que cada agente faz para esta clínica, quando roda e o que espera a equipe.
export const Route = createFileRoute("/_authenticated/$clientId/agentes")({
  component: () => <PainelAgentes clientId={Route.useParams().clientId} produto="hub" />,
});
