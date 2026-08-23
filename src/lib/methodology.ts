// Vocabulário fixo da metodologia Doctor Creator — usado nos rótulos do
// painel em vez de termos genéricos de "topo/meio/fundo de funil". É isso que
// diferencia o painel de qualquer dashboard de mercado — não trocar por
// sinônimo genérico.
import type { ContentFormat, FunnelStage, MethodologyStage } from "@/integrations/supabase/types";

export const FUNNEL_STAGES: { value: FunnelStage; label: string; description: string }[] = [
  { value: "C0", label: "C0 — Não sabe que precisa", description: "Paciente ainda não reconhece o problema." },
  { value: "C1", label: "C1 — Reconhece o problema", description: "Sabe que tem a dor, ainda não busca solução." },
  { value: "C2", label: "C2 — Avalia soluções", description: "Compara alternativas e profissionais." },
  { value: "C3", label: "C3 — Decisão de compra", description: "Pronto para agendar/comprar." },
];

export const METHODOLOGY_STAGES: { value: MethodologyStage; label: string }[] = [
  { value: "diferencial", label: "Diferencial" },
  { value: "narrativa", label: "Narrativa" },
  { value: "percepcao", label: "Percepção" },
  { value: "confianca", label: "Confiança" },
  { value: "venda", label: "Venda" },
  { value: "multiplicacao", label: "Multiplicação" },
];

export const CONTENT_FORMATS: { value: ContentFormat; label: string }[] = [
  { value: "reels", label: "Reels" },
  { value: "carrossel", label: "Carrossel" },
  { value: "estatico", label: "Estático" },
  { value: "stories", label: "Stories" },
];

export function funnelLabel(stage: FunnelStage | null | undefined): string {
  return FUNNEL_STAGES.find((s) => s.value === stage)?.label ?? "Não classificado";
}

export function methodologyLabel(stage: MethodologyStage | null | undefined): string {
  return METHODOLOGY_STAGES.find((s) => s.value === stage)?.label ?? "Não classificado";
}

export function formatLabel(format: ContentFormat | null | undefined): string {
  return CONTENT_FORMATS.find((f) => f.value === format)?.label ?? "—";
}
