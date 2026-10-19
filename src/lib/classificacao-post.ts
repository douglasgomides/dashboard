/** Valores sentinela da origem não representam um tema classificado. */
export function normalizarTema(tema: string | null | undefined): string | null {
  const texto = tema?.trim();
  return !texto || /^(null|undefined|nulo|none|n\/a)$/i.test(texto) ? null : texto;
}
export function normalizarTemas<T extends { tema: string | null }>(posts: T[]): T[] {
  return posts.map((post) => ({ ...post, tema: normalizarTema(post.tema) }));
}
