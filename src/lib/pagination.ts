/**
 * Read all rows for an aggregate instead of assuming PostgREST honors a large
 * limit. Callers must order by a unique key (or a complete composite key).
 */
export async function fetchAllRows<T>(readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await readPage(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    if (!data?.length) return rows;
    rows.push(...data);
    // A server can cap responses below pageSize. Only an empty page proves
    // completion; advance by the actual count to avoid skipping capped rows.
  }
}
