import { createFileRoute } from "@tanstack/react-router";
import { BancoAnuncios } from "@/components/sap-anuncios";

// Sistema de Aquisição · Banco de anúncios: modelos C1/C2/C3 que já funcionam e as peças da clínica.
export const Route = createFileRoute("/_authenticated/sap/$clientId/anuncios")({
  component: Anuncios,
});

function Anuncios() {
  const { clientId } = Route.useParams();
  return <BancoAnuncios clientId={clientId} />;
}
