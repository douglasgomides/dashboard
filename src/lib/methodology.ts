// Vocabulário fixo da metodologia Doctor Creator — usado nos rótulos do
// painel em vez de termos genéricos de "topo/meio/fundo de funil". É isso que
// diferencia o painel de qualquer dashboard de mercado — não trocar por
// sinônimo genérico.
import type { ContentFormat, FunnelStage, MethodologyStage } from "@/integrations/supabase/types";

// C0 a C3 = OBJETIVO do conteúdo e tipo de público do impulsionamento (metodologia Doctor Creator).
// NÃO é o estágio de consciência do paciente.
export const FUNNEL_STAGES: { value: FunnelStage; label: string; description: string }[] = [
  { value: "C0", label: "C0 — Alcance", description: "Alcance e visualização: conteúdo feito para ser visto por muita gente." },
  { value: "C1", label: "C1 — Educar e atrair seguidores", description: "Seguidores, salvamentos e posts úteis e educativos. Patrocina para interesses amplos." },
  { value: "C2", label: "C2 — Solução e captação", description: "Solução aplicada ao problema da pessoa, bate na dor, captação de leads. Patrocina para interesses específicos, geolocalizado." },
  { value: "C3", label: "C3 — Prova e remarketing", description: "Depoimentos e cases. Remarketing." },
];

export const METHODOLOGY_STAGES: { value: MethodologyStage; label: string }[] = [
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
