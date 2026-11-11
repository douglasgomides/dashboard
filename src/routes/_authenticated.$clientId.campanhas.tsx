import { createFileRoute, redirect } from "@tanstack/react-router";

// Tirada em 11/11/2026 por decisão do João ("tira isso aí, ninguém usa"): o endereço antigo leva à Hoje (a tela de entrada, D-06) com o mesmo período, sem 404.
export const Route = createFileRoute("/_authenticated/$clientId/campanhas")({
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/$clientId/hoje", params: { clientId: params.clientId }, search: search as never });
  },
});
