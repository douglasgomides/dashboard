import { createFileRoute } from "@tanstack/react-router";
import { CronogramaSap } from "@/components/sap-cronograma";

// Sistema de Aquisição · Cronograma Mestre D0 a D90 (00.02), pausas de prazo e situação do contrato (01.02).
export const Route = createFileRoute("/_authenticated/sap/$clientId/cronograma")({
  component: CronogramaPage,
});

function CronogramaPage() {
  const { clientId } = Route.useParams();
  return <CronogramaSap clientId={clientId} />;
}
