import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço antigo do Sistema de Aquisição: agora é a área própria /sap/<cliente>.
export const Route = createFileRoute("/_authenticated/$clientId/aquisicao")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/sap/$clientId" as never, params: { clientId: params.clientId } as never });
  },
});
