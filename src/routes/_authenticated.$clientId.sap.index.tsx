import { createFileRoute, redirect } from "@tanstack/react-router";

// O Sistema de Aquisição saiu do menu do Hub e virou uma área própria (/sap). Endereço antigo redireciona.
export const Route = createFileRoute("/_authenticated/$clientId/sap/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/sap/$clientId/painel" as never, params: { clientId: params.clientId } as never });
  },
});
