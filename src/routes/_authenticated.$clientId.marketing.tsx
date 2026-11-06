import { createFileRoute, redirect } from "@tanstack/react-router";

// A "Visão geral de Marketing" repetia o menu lateral. Endereços antigos (favoritos, links) seguem para a primeira tela útil.
export const Route = createFileRoute("/_authenticated/$clientId/marketing")({
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/$clientId/conteudo", params: { clientId: params.clientId }, search: search as never });
  },
});
