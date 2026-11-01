/**
 * Lê uma consulta inteira em páginas de 1.000 linhas. A API do banco devolve no máximo 1.000 linhas por pedido, mesmo
 * com `.limit(50_000)`, sem avisar (auditoria de 01/11/2026: negócios apagados na Clint além das primeiras 1.000 linhas
 * nunca eram marcados). A consulta precisa de ordem fixa (por exemplo, `.order("id")`) para as páginas não se cruzarem.
 */
export const PAGINA_BANCO = 1000;

export async function lerTodasAsLinhas<T>(
  lerPagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maximo = 200_000,
): Promise<T[]> {
  const linhas: T[] = [];
  while (linhas.length < maximo) {
    const { data, error } = await lerPagina(linhas.length, linhas.length + PAGINA_BANCO - 1);
    if (error) throw new Error(error.message);
    const pagina = data ?? [];
    linhas.push(...pagina);
    if (pagina.length < PAGINA_BANCO) return linhas;
  }
  throw new Error(`leitura passou de ${maximo} linhas; conferir antes de seguir`);
}
