export interface ThemeConcept { concept: string; terms: string[] }
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).map(w => w.length > 4 ? w.replace(/s$/, "") : w).join(" ");

/** Título e legenda não contam: os conceitos precisam aparecer no texto que vai aos slides. */
export function missingThemeConcepts(units: { copy: string }[], concepts: ThemeConcept[]) {
  const body = ` ${normalize(units.map(u => u.copy).join(" "))} `;
  return concepts.filter(c => !c.terms.some(term => {
    const token = normalize(term);
    return !!token && body.includes(` ${token} `);
  })).map(c => c.concept);
}
