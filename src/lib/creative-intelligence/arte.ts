/**
 * Arte dos slides de uma adaptação (rascunho para revisão): monta o pedido à geração de imagem a partir do briefing
 * de imagem, do layout e do texto na tela de cada slide. Funções puras; a chamada e a gravação ficam em
 * api/_lib/creative-arte.ts. Nada é publicado: a arte nasce como rascunho e exige revisão médica/CFM.
 */

export interface UnidadeArte {
  position: number;
  copy: string;
  image_brief: string;
  layout_brief: string;
  on_screen_text: string;
  narrative_role: string;
}

/** Custo estimado por imagem 1024x1536 (US$, tabela pública), para o teto diário e o registro em ia_execucoes. */
export const CUSTO_ARTE: Record<"low" | "medium" | "high", number> = { low: 0.016, medium: 0.063, high: 0.25 };
export const TETO_DIARIO_ARTE_USD = 10;

/** Limite conservador: um token de entrada nunca exige menos de um byte.
 * Inclui margem para arredondamento da tabela por imagem. Modelo GPT Image 1. */
export function reservaArte(prompt: string, qualidade: "low" | "medium" | "high"): number {
  return Math.ceil((CUSTO_ARTE[qualidade] + new TextEncoder().encode(prompt).length * 0.000005 + 0.005) * 1_000_000) / 1_000_000;
}

export function custoArte(usage: unknown, reserva: number): number {
  if (!usage || typeof usage !== "object") return reserva;
  const u = usage as { input_tokens?: unknown; output_tokens?: unknown };
  if (![u.input_tokens, u.output_tokens].every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0)) return reserva;
  return Math.ceil(((u.input_tokens as number) * 0.000005 + (u.output_tokens as number) * 0.00004) * 1_000_000) / 1_000_000;
}

const REGRAS = [
  "Imagem vertical de 1024 por 1536 pixels, visual limpo e profissional da área da saúde. Mantenha texto e elementos principais na área central para permitir ajuste posterior ao formato de publicação.",
  "Escreva na imagem EXATAMENTE o texto indicado, em português do Brasil, com ortografia correta e boa legibilidade.",
  "Não mostre antes e depois, corpo de paciente identificável, sangue, procedimento invasivo, nome de remédio, preço ou promessa de resultado.",
  "Não invente logotipos, selos, números ou estudos.",
];

export function promptArte(u: UnidadeArte, contexto: { tema: string; total: number; estilo?: string | null }): string {
  const texto = (u.on_screen_text || u.copy || "").trim().slice(0, 600);
  return [
    `Slide ${u.position} de ${contexto.total} de um carrossel sobre: ${contexto.tema.slice(0, 200)}.`,
    u.narrative_role ? `Função do slide: ${u.narrative_role.slice(0, 200)}.` : "",
    u.image_brief ? `Imagem: ${u.image_brief.slice(0, 900)}` : "",
    u.layout_brief ? `Layout: ${u.layout_brief.slice(0, 600)}` : "",
    texto ? `Texto na arte: "${texto}"` : "Sem texto na arte.",
    contexto.estilo ? `Identidade visual: ${contexto.estilo.slice(0, 400)}` : "",
    ...REGRAS,
  ].filter(Boolean).join("\n");
}

/** Slides pedidos válidos (existem na adaptação), sem repetição, no máximo 12 por pedido. */
export function slidesPedidos(unidades: { position: number }[], pedidos?: unknown): number[] {
  const existentes = new Set(unidades.map((u) => u.position));
  const lista = Array.isArray(pedidos) && pedidos.length ? pedidos.map(Number) : [...existentes];
  return [...new Set(lista.filter((n) => Number.isInteger(n) && existentes.has(n)))].sort((a, b) => a - b).slice(0, 12);
}
