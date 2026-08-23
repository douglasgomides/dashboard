import { createFileRoute } from "@tanstack/react-router";
import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export const Route = createFileRoute("/_authenticated/$clientId/consultas")({
  component: () => (
    <PhasePlaceholder
      phase="Fase 2 — Atribuição real"
      title="O que virou paciente"
      description="Aparece aqui quando o cliente conectar o CRM da clínica (Feegow ou Ninsaúde, somente leitura) e o funil post → lead → consulta agendada estiver fechado. Só é exibido se o cliente tiver essa fonte conectada."
    />
  ),
});
