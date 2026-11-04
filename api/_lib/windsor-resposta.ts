/**
 * Leitura da resposta da API REST da Windsor.ai (connectors.windsor.ai/{conector}), comum aos syncs de anúncios e
 * de Instagram.
 *
 * Doc oficial (https://windsor.ai/api-documentation/, lida em 01/11/2026): a resposta de sucesso é
 * `{ "data": [ ... ] }`; o erro vem como `{ "error": { "code", "message" } }` "with an appropriate HTTP status code",
 * mas a mesma página mostra também a forma curta `{"error":"Not authorized"}` (autenticação pelo cabeçalho). Antes o
 * código fazia `body.data ?? []`: um corpo de erro que chegasse com HTTP 200 virava "lista vazia" e a conta parecia
 * só não ter dado. Agora qualquer `error` no corpo, ou um `data` que não é lista, vira erro com a mensagem da Windsor.
 */

/** Mensagem do campo `error` do corpo (texto ou objeto { code, message }); null quando não há erro. */
export function erroNoCorpoWindsor(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const e = (body as { error?: unknown }).error;
  if (e == null || e === false || e === "") return null;
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const o = e as { code?: unknown; message?: unknown };
    const partes = [o.code, o.message].filter((x) => typeof x === "string" && x.trim()).map(String);
    return partes.length ? partes.join(": ") : JSON.stringify(e).slice(0, 200);
  }
  return String(e);
}

/** Linhas de uma resposta já conferida como HTTP ok. Lança erro quando o corpo diz erro ou muda de formato. */
export function linhasDoCorpoWindsor(body: unknown, status = 200): Record<string, unknown>[] {
  const erro = erroNoCorpoWindsor(body);
  if (erro) throw new Error(`Windsor.ai devolveu erro no corpo (HTTP ${status}): ${erro.slice(0, 200)}`);
  if (!body || typeof body !== "object") throw new Error(`Windsor.ai devolveu resposta fora do formato (HTTP ${status})`);
  const data = (body as { data?: unknown }).data;
  if (data == null) return [];
  if (!Array.isArray(data)) throw new Error(`Windsor.ai devolveu "data" que não é lista (HTTP ${status})`);
  return data as Record<string, unknown>[];
}

/** Lê o JSON de uma resposta ok da Windsor; corpo que não é JSON também vira erro (antes estourava sem contexto). */
export async function linhasWindsor(res: Response): Promise<Record<string, unknown>[]> {
  const texto = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(texto);
  } catch {
    throw new Error(`Windsor.ai devolveu corpo que não é JSON (HTTP ${res.status})`);
  }
  return linhasDoCorpoWindsor(body, res.status);
}

/** Limite de linhas pedido em toda leitura (_max_rows). Resposta com esse número exato de linhas veio cortada. */
export const WINDSOR_MAX_ROWS = 100_000;

/**
 * GET na Windsor com as regras comuns (auditoria de 01/11/2026, P3 da Windsor): 429 (limite de pedidos: 600 por
 * minuto, 10.000 por dia) espera o Retry-After (até 20 s, padrão 5 s) e tenta uma vez de novo; resposta com
 * `_max_rows` linhas é tratada como corte e vira erro, em vez de gravar só parte do período sem avisar.
 */
export async function buscarWindsor(
  url: string,
  opcoes: { maxRows?: number; fetchImpl?: typeof fetch; esperar?: (ms: number) => Promise<void>; timeoutMs?: number } = {},
): Promise<Record<string, unknown>[]> {
  const maxRows = opcoes.maxRows ?? WINDSOR_MAX_ROWS;
  const f = opcoes.fetchImpl ?? fetch;
  const esperar = opcoes.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pedir = () => f(url, { signal: AbortSignal.timeout(opcoes.timeoutMs ?? 30_000), redirect: "error" });
  let res = await pedir();
  if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after"));
    await res.text().catch(() => "");
    await esperar(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 20) * 1000 : 5000);
    res = await pedir();
  }
  if (!res.ok) {
    const texto = (await res.text()).slice(0, 300).replace(/api_key=[^&\s"]+/gi, "api_key=***");
    throw new Error(`Windsor.ai request failed (${res.status}): ${texto}`);
  }
  const linhas = await linhasWindsor(res);
  if (linhas.length >= maxRows) {
    throw new Error(`Windsor.ai devolveu ${linhas.length} linhas, o limite pedido (_max_rows): a resposta pode ter vindo cortada. Pedir uma janela menor.`);
  }
  return linhas;
}

/**
 * Janelas de `dias` dias que NÃO se tocam, da mais nova para a mais antiga. Antes o fim de uma janela era o começo
 * da seguinte: o post do dia da emenda vinha nas duas, e o upsert com a mesma linha duas vezes no mesmo comando era
 * recusado pelo banco, perdendo o lote inteiro (Dra. Samira: 41 de 309 posts depois de um backfill de 365 dias).
 */
export function janelasWindsor(from: string, to: string, dias: number): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const inicio = new Date(`${from}T00:00:00Z`);
  let fim = new Date(`${to}T00:00:00Z`);
  while (fim >= inicio) {
    const ini = new Date(fim);
    ini.setUTCDate(ini.getUTCDate() - (dias - 1));
    const de = ini < inicio ? inicio : ini;
    out.push({ from: de.toISOString().slice(0, 10), to: fim.toISOString().slice(0, 10) });
    fim = new Date(de);
    fim.setUTCDate(fim.getUTCDate() - 1);
  }
  return out;
}

/** Fica com a primeira ocorrência de cada chave (a janela mais nova vem primeiro); linha sem chave passa. */
export function semRepetidos<T>(linhas: T[], chave: (l: T) => string | null): T[] {
  const vistos = new Set<string>();
  const out: T[] = [];
  for (const l of linhas) {
    const k = chave(l);
    if (k == null) { out.push(l); continue; }
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(l);
  }
  return out;
}
