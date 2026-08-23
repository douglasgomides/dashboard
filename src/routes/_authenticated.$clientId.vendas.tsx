import { createFileRoute } from "@tanstack/react-router";
import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export const Route = createFileRoute("/_authenticated/$clientId/vendas")({
  component: () => (
    <PhasePlaceholder
      phase="Fase 2 — Atribuição real"
      title="O que virou venda"
      description="Aparece aqui quando o cliente conectar um checkout (Hubla, Hotmart, Eduzz ou Kiwify) e o UTM gerado automaticamente pelo sistema fechar o funil post → lead → venda. Nenhuma nomenclatura manual — o sistema gera e rastreia sozinho."
    />
  ),
});
