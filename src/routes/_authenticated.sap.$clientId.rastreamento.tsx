import { createFileRoute } from "@tanstack/react-router";
import { RastreamentoSap } from "@/components/sap-rastreamento";

// Sistema de Aquisição · Plano de Rastreamento e Mensuração (05.03): checklist antes de subir anúncio e devolução offline.
export const Route = createFileRoute("/_authenticated/sap/$clientId/rastreamento")({
  component: RastreamentoPage,
});

function RastreamentoPage() {
  const { clientId } = Route.useParams();
  return <RastreamentoSap clientId={clientId} />;
}
