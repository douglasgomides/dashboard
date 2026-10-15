import { createFileRoute } from "@tanstack/react-router";
import { ModoSessaoSap } from "@/components/sap-sessao";

// Sistema de Aquisição · Modo sessão: cada reunião do programa numa tela (antes, durante e depois).
export const Route = createFileRoute("/_authenticated/sap/$clientId/sessao")({
  validateSearch: (s: Record<string, unknown>): { s?: string } => (typeof s.s === "string" ? { s: s.s } : {}),
  component: SessaoPage,
});

function SessaoPage() {
  const { clientId } = Route.useParams();
  const { s } = Route.useSearch();
  return <ModoSessaoSap clientId={clientId} sessaoId={s} />;
}
