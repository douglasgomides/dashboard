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

/** Only decorative shapes are generated; the server typesets the full copy separately. */
export function promptArte(u: UnidadeArte, contexto: { tema: string; total: number; estilo?: string | null }): string {
  return [
    `Slide ${u.position} de ${contexto.total}: fundo abstrato decorativo para uma faixa horizontal de um carrossel editorial.`,
    "Imagem vertical de 1024 por 1536 pixels. Formas geométricas grandes, curvas e camadas de papel, poucas formas, composição sofisticada e simples.",
    "Paleta consistente: azul-petróleo #102d40, azul-claro #86dbef e papel marfim #f6f4ef. Iluminação suave e acabamento fosco.",
    "Apenas formas abstratas. Não inclua texto, letras, números, símbolos escritos, ícones de aplicativos, logotipos, pessoas, rostos, retratos, fotos ou partes do corpo.",
    "Não mostre antes e depois, procedimentos, sangue, remédios, preços, selos ou estudos. O texto será aplicado depois com fonte real; não desenhe palavras.",
  ].join("\n");
}

/** Slides pedidos válidos (existem na adaptação), sem repetição, no máximo 12 por pedido. */
export function slidesPedidos(unidades: { position: number }[], pedidos?: unknown): number[] {
  const existentes = new Set(unidades.map((u) => u.position));
  const lista = Array.isArray(pedidos) && pedidos.length ? pedidos.map(Number) : [...existentes];
  return [...new Set(lista.filter((n) => Number.isInteger(n) && existentes.has(n)))].sort((a, b) => a - b).slice(0, 12);
}
