import { createFileRoute } from "@tanstack/react-router";
import { CadastroSap } from "@/components/sap-tracker";
import { ScoreExecucao, ScoreSaude } from "@/components/sap-scores";

// Sistema de Aquisição · Execução e saúde (11.04): o que a clínica cumpriu (a clínica vê) e a saúde da conta (só a equipe).
export const Route = createFileRoute("/_authenticated/$clientId/sap/execucao")({
  component: ExecucaoSap,
});

function ExecucaoSap() {
  const { clientId } = Route.useParams();
  return (
    <div className="space-y-6">
      <CadastroSap clientId={clientId} />
      <ScoreExecucao clientId={clientId} />
      <ScoreSaude clientId={clientId} />
    </div>
  );
}
