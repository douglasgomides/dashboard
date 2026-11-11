import { createFileRoute, redirect } from "@tanstack/react-router";

// Tirada em 11/11/2026 por decisão do João ("tira isso aí, ninguém usa"): o endereço antigo leva à Hoje (a tela de entrada, D-06) com o mesmo período, sem 404.
// O validateSearch fica porque peças congeladas do SAP fazem Link tipado para esta rota com search { agente }.
export const Route = createFileRoute("/_authenticated/$clientId/agentes")({
  validateSearch: (s: Record<string, unknown>) => ({ agente: typeof s.agente === "string" ? s.agente : undefined }),
  beforeLoad: ({ params, search }) => {
    const { agente: _agente, ...periodo } = search;
    throw redirect({ to: "/$clientId/hoje", params: { clientId: params.clientId }, search: periodo as never });
  },
});
