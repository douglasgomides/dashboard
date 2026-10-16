import { createFileRoute } from "@tanstack/react-router";
import { MinhasTarefasClinica } from "@/components/sap-tarefas";
import { LeadsAtencao } from "@/components/sap-ia-atendimento";
import { useAuth } from "@/hooks/use-auth";

// Sistema de Aquisição · Minhas tarefas: primeira tela da clínica. Só itens do cronograma (fonte única), do papel de
// quem está logado, agrupados por urgência. A equipe também vê os leads que precisam de atenção.
export const Route = createFileRoute("/_authenticated/sap/$clientId/")({
  component: MinhasTarefas,
});

function MinhasTarefas() {
  const { clientId } = Route.useParams();
  const { isAdmin } = useAuth();
  return (
    <div className="space-y-6">
      <MinhasTarefasClinica clientId={clientId} />
      {isAdmin && <LeadsAtencao clientId={clientId} />}
    </div>
  );
}
