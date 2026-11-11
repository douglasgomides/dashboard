import { createFileRoute, redirect } from "@tanstack/react-router";

// Tirada em 11/11/2026 por decisão do João ("tira isso aí, ninguém usa"): o endereço antigo leva a Resultados da clínica com o mesmo período, sem 404. O plano 03.1.1-05 troca o destino pela Hoje.
export const Route = createFileRoute("/_authenticated/$clientId/proximas-acoes")({
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/$clientId", params: { clientId: params.clientId }, search: search as never });
  },
});
