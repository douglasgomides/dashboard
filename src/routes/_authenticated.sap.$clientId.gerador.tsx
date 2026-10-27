import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GeradorSap } from "@/components/sap-gerador";
import { getClinicaSap } from "@/lib/sap-data";

// Sistema de Aquisição · Gerador: roda os prompts do programa (anúncios e criativos, diagnóstico, conversa, venda,
// fidelização e call) com os anexos colados pela equipe. Só admin; a saída é rascunho para revisão.
export const Route = createFileRoute("/_authenticated/sap/$clientId/gerador")({
  component: GeradorPage,
});

function GeradorPage() {
  const { clientId } = Route.useParams();
  const { data: clinica } = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  return <GeradorSap clientId={clientId} clinicaId={(clinica as { id?: string } | null | undefined)?.id ?? null} clinica={(clinica as { nome?: string } | null | undefined)?.nome ?? ""} />;
}
