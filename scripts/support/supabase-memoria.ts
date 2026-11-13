// Banco falso em memória para os testes dos syncs: só o que o código de status e de anúncios usa
// (select/eq/in/gt/gte/lte/not is/is/order/limit/range/maybeSingle/upsert/update). Sem rede, dados fictícios.
type Linha = Record<string, any>;

export interface Escrita { tabela: string; tipo: "upsert" | "update"; linha: Linha }

export function bancoEmMemoria(inicial: Record<string, Linha[]> = {}) {
  const tabelas = new Map<string, Linha[]>(Object.entries(inicial).map(([t, ls]) => [t, ls.map((l) => ({ ...l }))]));
  const escritas: Escrita[] = [];
  const linhas = (t: string): Linha[] => {
    let l = tabelas.get(t);
    if (!l) tabelas.set(t, (l = []));
    return l;
  };

  function consulta(tabela: string) {
    const filtros: ((l: Linha) => boolean)[] = [];
    const ordem: { col: string; asc: boolean }[] = [];
    let limite: number | null = null;
    let faixa: [number, number] | null = null;
    let modo: "select" | "update" | "upsert" = "select";
    let corpo: Linha | Linha[] | null = null;
    let conflito: string[] = [];

    const executar = (): { data: any; error: null } => {
      if (modo === "upsert") {
        for (const nova of Array.isArray(corpo) ? corpo : [corpo!]) {
          const chave = (l: Linha) => conflito.map((c) => String(l[c])).join("|");
          const existente = conflito.length ? linhas(tabela).find((l) => chave(l) === chave(nova)) : undefined;
          if (existente) Object.assign(existente, nova);
          else linhas(tabela).push({ ...nova });
          escritas.push({ tabela, tipo: "upsert", linha: { ...nova } });
        }
        return { data: null, error: null };
      }
      if (modo === "update") {
        for (const l of linhas(tabela).filter((x) => filtros.every((f) => f(x)))) {
          Object.assign(l, corpo);
          escritas.push({ tabela, tipo: "update", linha: { ...(corpo as Linha) } });
        }
        return { data: null, error: null };
      }
      let r = linhas(tabela).filter((x) => filtros.every((f) => f(x)));
      for (const o of [...ordem].reverse()) {
        r = [...r].sort((a, b) => (a[o.col] === b[o.col] ? 0 : (a[o.col] > b[o.col] ? 1 : -1) * (o.asc ? 1 : -1)));
      }
      if (faixa) r = r.slice(faixa[0], faixa[1] + 1);
      if (limite != null) r = r.slice(0, limite);
      return { data: r.map((x) => ({ ...x })), error: null };
    };

    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q),
      in: (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), q),
      gt: (c: string, v: any) => (filtros.push((l) => l[c] != null && l[c] > v), q),
      gte: (c: string, v: any) => (filtros.push((l) => l[c] != null && l[c] >= v), q),
      lte: (c: string, v: any) => (filtros.push((l) => l[c] != null && l[c] <= v), q),
      not: (c: string, _op: string, _v: unknown) => (filtros.push((l) => l[c] != null), q), // só "is null"
      is: (c: string, _v: unknown) => (filtros.push((l) => l[c] == null), q),
      order: (c: string, o?: { ascending?: boolean }) => (ordem.push({ col: c, asc: o?.ascending !== false }), q),
      limit: (n: number) => ((limite = n), q),
      range: (a: number, b: number) => ((faixa = [a, b]), q),
      upsert: (c: Linha | Linha[], o?: { onConflict?: string }) => ((modo = "upsert"), (corpo = c), (conflito = (o?.onConflict ?? "").split(",").filter(Boolean)), q),
      update: (c: Linha) => ((modo = "update"), (corpo = c), q),
      maybeSingle: async () => {
        const r = executar();
        return { data: (r.data as Linha[])[0] ?? null, error: null };
      },
      then: (ok: (v: any) => unknown, err?: (e: unknown) => unknown) => Promise.resolve().then(executar).then(ok, err),
    };
    return q;
  }

  const sb = { from: (t: string) => consulta(t), rpc: async () => ({ data: null, error: null }) };
  return {
    sb: sb as any,
    tabela: (t: string) => linhas(t),
    escritas,
    achar: (t: string, filtro: Linha) => linhas(t).find((l) => Object.entries(filtro).every(([k, v]) => l[k] === v)),
  };
}
