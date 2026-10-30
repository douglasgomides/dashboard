/** Valores sentinela da origem não representam um tema classificado. */
export function normalizarTema(tema: string | null | undefined): string | null {
  const texto = tema?.trim().replace(/\s+/g, " ");
  return !texto || /^(null|undefined|nulo|none|n\/a)$/i.test(texto) ? null : texto;
}

/**
 * Chave única do tema, usada em todas as telas para juntar o mesmo assunto escrito de jeitos diferentes:
 * sem acento, sem diferença de maiúscula e com espaços normalizados. "Autoridade e marca médica" e
 * "Autoridade e marca medica" viram a mesma chave. Tema vazio ou sentinela vira "".
 * A função SQL public.tema_chave (migração 20261031120000) faz a mesma conta no banco.
 */
export function chaveTema(tema: string | null | undefined): string {
  const t = normalizarTema(tema);
  if (!t) return "";
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Nome de exibição de um grupo de variantes do mesmo tema: a grafia mais usada; no empate, a que tem
 * acento (mais bytes em UTF-8) e, depois, a ordem alfabética. A RPC conteudo_comercial usa o mesmo critério.
 */
export function rotuloDoTema(variantes: Iterable<string>): string {
  const n = new Map<string, number>();
  for (const v of variantes) n.set(v, (n.get(v) ?? 0) + 1);
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  return [...n.entries()].sort((a, b) => b[1] - a[1] || bytes(b[0]) - bytes(a[0]) || a[0].localeCompare(b[0], "pt-BR"))[0]?.[0] ?? "";
}

/**
 * Limpa o tema e junta as grafias do mesmo tema numa só (a mais usada no conjunto), para que agrupamentos por
 * `tema` em qualquer tela contem o mesmo assunto uma vez só.
 */
export function normalizarTemas<T extends { tema: string | null }>(posts: T[]): T[] {
  const grafias = new Map<string, string[]>();
  for (const p of posts) {
    const t = normalizarTema(p.tema);
    if (!t) continue;
    const k = chaveTema(t);
    (grafias.get(k) ?? grafias.set(k, []).get(k)!).push(t);
  }
  const rotulo = new Map([...grafias.entries()].map(([k, vs]) => [k, rotuloDoTema(vs)]));
  return posts.map((post) => {
    const t = normalizarTema(post.tema);
    return { ...post, tema: t ? rotulo.get(chaveTema(t)) ?? t : null };
  });
}

/** Mesmo tema (pela chave) ou um contido no outro como expressão inteira: "Menopausa" ⊂ "Mudanças na menopausa". */
export function temaRelacionado(a: string | null | undefined, b: string | null | undefined): boolean {
  const so = (s: string) => s.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const ka = so(chaveTema(a)), kb = so(chaveTema(b));
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const curto = ka.length <= kb.length ? ka : kb, longo = ka.length <= kb.length ? kb : ka;
  if (curto.length < 4) return false;
  return ` ${longo} `.includes(` ${curto} `);
}
