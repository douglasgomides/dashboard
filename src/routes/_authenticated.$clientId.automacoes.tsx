import { createFileRoute } from "@tanstack/react-router";
import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export const Route = createFileRoute("/_authenticated/$clientId/automacoes")({
  component: () => (
    <PhasePlaceholder
      phase="Fase 3 — Motor de regras"
      title="Automações"
      description={
        'Construtor de regras SE [métrica/etapa do funil C0–C3] ENTÃO [pausar campanha / realocar orçamento / alertar via WhatsApp]. ' +
        "Toda ação automática fica registrada em log com o motivo — nunca uma caixa-preta. As ações reais de pausa/orçamento já existem na integração com Meta Ads; esta tela vira o construtor de condições por cima delas."
      }
    />
  ),
});
