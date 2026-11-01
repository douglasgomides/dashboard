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
