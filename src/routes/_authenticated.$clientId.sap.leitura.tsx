import { createFileRoute } from "@tanstack/react-router";
import { LeituraDaSemana } from "@/components/sap-leitura";

// Sistema de Aquisição · Leitura da semana (08.05): vazamento principal, ação de cada lado e mensagem pronta.
export const Route = createFileRoute("/_authenticated/$clientId/sap/leitura")({
  component: LeituraSap,
});

function LeituraSap() {
  const { clientId } = Route.useParams();
  return <LeituraDaSemana clientId={clientId} />;
}
