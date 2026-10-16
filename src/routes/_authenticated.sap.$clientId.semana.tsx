import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota antiga: "Esta semana" virou um filtro de Minhas tarefas (atrasadas, hoje e próximos 7 dias).
export const Route = createFileRoute("/_authenticated/sap/$clientId/semana")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/sap/$clientId", params: { clientId: params.clientId } });
  },
});
