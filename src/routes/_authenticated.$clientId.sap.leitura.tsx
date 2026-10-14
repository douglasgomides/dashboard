import { createFileRoute, redirect } from "@tanstack/react-router";

// O Sistema de Aquisição saiu do menu do Hub e virou uma área própria (/sap). Endereço antigo redireciona.
export const Route = createFileRoute("/_authenticated/$clientId/sap/leitura")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/sap/$clientId/leitura" as never, params: { clientId: params.clientId } as never });
  },
});
