import { createFileRoute, redirect } from "@tanstack/react-router";

// Conversas e auditoria viraram uma aba de Atendimento no WhatsApp. ?conversa=<id> continua abrindo a conversa direto.
export const Route = createFileRoute("/_authenticated/$clientId/conversas")({
  validateSearch: (s: Record<string, unknown>): { conversa?: string } => ({ conversa: typeof s.conversa === "string" ? s.conversa : undefined }),
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/$clientId/atendimento", params: { clientId: params.clientId }, search: { aba: "conversas", conversa: search.conversa } as never });
  },
});
