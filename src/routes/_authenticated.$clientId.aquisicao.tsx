import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço antigo do Sistema de Aquisição: agora é a área /sap (Programa, Metas e garantia, Leitura da semana).
export const Route = createFileRoute("/_authenticated/$clientId/aquisicao")({
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/$clientId/sap", params: { clientId: params.clientId }, search: search as never });
  },
});
