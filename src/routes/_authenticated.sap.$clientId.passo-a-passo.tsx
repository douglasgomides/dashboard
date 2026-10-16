import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota antiga: o Passo a passo virou o manual dentro de cada tarefa. Redireciona para Minhas tarefas.
export const Route = createFileRoute("/_authenticated/sap/$clientId/passo-a-passo")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/sap/$clientId", params: { clientId: params.clientId } });
  },
});
