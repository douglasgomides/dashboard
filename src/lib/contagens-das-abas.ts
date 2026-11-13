// Guarda em memória da contagem de cada aba das telas juntadas (Phase 3.1.1, D-07). Módulo puro: sem React e sem rede.
//
// A contagem nunca é buscada. Quem publica é a própria aba, com o que ela já carregou para a clínica e o período abertos
// (usePublicarContagem em abas-em-pasta.tsx); a pasta só lê daqui. Aba contável que ninguém publicou ainda (não aberta neste
// período, ou sem fonte ligada) fica sem entrada e a pasta desenha "—": zero medido é diferente de não medido.

type Contagens = ReadonlyMap<string, number | null>;

const VAZIO: Contagens = new Map();
// Mapas imutáveis por chave: cada mudança troca o mapa por um novo, para o snapshot do useSyncExternalStore ser estável
// entre mudanças e novo depois delas.
let guarda = new Map<string, Contagens>();
const ouvintes = new Set<() => void>();

/** Chave do período aberto: a mesma para os mesmos 3 valores, diferente quando muda qualquer um. */
export function chaveDoPeriodo(clientId: string, de: string, ate: string): string {
  return `${clientId}|${de}|${ate}`;
}

/**
 * A aba declara o número que já tem. number e null são guardados (null: a aba abriu e não tem número); undefined não grava
 * nada (a aba ainda está carregando e não pode virar "—"). Só avisa os assinantes quando o valor muda.
 */
export function publicarContagem(chave: string, rota: string, valor: number | null | undefined): void {
  if (valor === undefined) return;
  const atual = guarda.get(chave) ?? VAZIO;
  if (atual.has(rota) && atual.get(rota) === valor) return;
  const proximo = new Map(atual);
  proximo.set(rota, valor);
  guarda.set(chave, proximo);
  for (const fn of [...ouvintes]) fn();
}

/** Contagens publicadas para o período (routeId da tela da aba -> número ou null). Mapa estável até a próxima mudança. */
export function contagensDe(chave: string): Contagens {
  return guarda.get(chave) ?? VAZIO;
}

/** Chama fn a cada publicação que muda um valor. O retorno desassina. */
export function assinarContagens(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

/** Zera tudo (só para teste). */
export function limparContagens(): void {
  guarda = new Map();
  for (const fn of [...ouvintes]) fn();
}
