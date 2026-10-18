import { createFileRoute } from "@tanstack/react-router";
import { OperacaoRecuperacao } from "@/components/operacao-recuperacao";
import { useClientRole } from "@/hooks/use-client-role";
import { PainelAgentes } from "@/components/agentes-ia";

// Sistema agêntico do Hub: o que cada agente faz para esta clínica, quando roda e o que espera a equipe.
export const Route = createFileRoute("/_authenticated/$clientId/agentes")({
  component: AgentesHub,
});

function AgentesHub() {
  const { clientId } = Route.useParams();
  const { podeEditar } = useClientRole(clientId);
  return <div className="space-y-5"><OperacaoRecuperacao key={clientId} clientId={clientId} podeEditar={podeEditar} /><PainelAgentes clientId={clientId} produto="hub" /></div>;
}
