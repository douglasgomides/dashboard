import assert from "node:assert/strict";
import { demografiaDoMes } from "../api/_lib/meta-audiencia";

// Correções feitas a partir da leitura da doc oficial (01/11/2026). Tudo offline: fetch falso, dados fictícios.
const originalFetch = globalThis.fetch;
const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
const demografia = (pares: [string, number][]) => ({
  data: [{ name: "reached_audience_demographics", total_value: { breakdowns: [{ dimension_keys: ["age"], results: pares.map(([k, v]) => ({ dimension_values: [k], value: v })) }] } }],
});

try {
  // Meta: prev_month pode ser recusado (changelog v20.0). Mês atual ralo + mês anterior recusado = "sem dado", não erro.
  const pedidos: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const u = new URL(String(input));
    assert.equal(u.hostname, "graph.facebook.com");
    const tf = u.searchParams.get("timeframe") ?? "";
    pedidos.push(tf);
    if (tf === "this_month") return resposta(200, demografia([["25-34", 10], ["35-44", 5]]));
    return resposta(400, { error: { message: "(#100) timeframe fictício não suportado", code: 100 } });
  }) as typeof fetch;
  assert.deepEqual(await demografiaDoMes("token-ficticio", "ig-ficticio", "reached_audience_demographics", "age"), { pares: [], mes: "sem dado suficiente" });
  assert.deepEqual(pedidos, ["this_month", "prev_month"]);

  // Mês atual com dado suficiente nem pede o anterior.
  pedidos.length = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    pedidos.push(new URL(String(input)).searchParams.get("timeframe") ?? "");
    return resposta(200, demografia([["25-34", 40], ["35-44", 30]]));
  }) as typeof fetch;
  const cheio = await demografiaDoMes("token-ficticio", "ig-ficticio", "reached_audience_demographics", "age");
  assert.equal(cheio.mes, "mês atual");
  assert.deepEqual(pedidos, ["this_month"]);

  // Os dois recusados: o erro aparece (não vira "sem dado" calado).
  globalThis.fetch = (async () => resposta(400, { error: { message: "(#190) token fictício inválido", code: 190 } })) as typeof fetch;
  await assert.rejects(demografiaDoMes("token-ficticio", "ig-ficticio", "reached_audience_demographics", "age"), /token fictício inválido/);

  console.log("test-docs-apis ok");
} finally {
  globalThis.fetch = originalFetch;
}
