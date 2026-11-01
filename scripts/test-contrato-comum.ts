// Testa a régua dos testes de contrato (scripts/contrato/comum.ts): comparação de formato e trava de dado real.
import assert from "node:assert/strict";
import { aoVivo, campos, compararFormato, dadoSensivel, tipoDe } from "./contrato/comum";

assert.equal(tipoDe(null), "null");
assert.equal(tipoDe([]), "array");
assert.equal(tipoDe({}), "object");
assert.equal(tipoDe("1"), "string");

const c = campos(["data: array", "data[].id: string", "data[].valor?: number|null", "data[].tags[]: string", "data[].pai.nome?: string"]);
assert.deepEqual(c[2], { caminho: "data[].valor", tipos: ["number", "null"], opcional: true });

// Igual: nada a dizer.
assert.deepEqual(compararFormato({ data: [{ id: "a", valor: 1, tags: ["x"], pai: { nome: "p" } }] }, c), []);
// Campo obrigatório sumiu, tipo mudou e lista virou objeto: cada um aparece, sem os valores.
const difs = compararFormato({ data: [{ valor: "1", tags: {}, pai: null }, { id: 2, tags: [] }] }, c);
assert.deepEqual(difs.map((d) => [d.problema, d.caminho]), [
  ["ausente", "data[].id"],
  ["tipo", "data[].id"],
  ["tipo", "data[].valor"],
  ["nao_e_lista", "data[].tags[]"],
]);
assert.ok(difs.every((d) => !d.detalhe.includes("\"1\"")), "a saída não repete valores");
// Lista vazia: não dá para conferir (ao vivo vira aviso; offline, falha).
assert.equal(compararFormato({ data: [] }, campos(["data[].id: string"]))[0].problema, "sem_amostra");
// Resposta que deixou de ser lista na raiz.
assert.equal(compararFormato({ erro: "x" }, campos(["[].id: string"]))[0].problema, "nao_e_lista");
// Objeto ausente no meio: o filho obrigatório conta como ausente.
assert.equal(compararFormato({ data: [{ total_value: null }] }, campos(["data[].total_value.value: number"]))[0].problema, "ausente");

// Trava de dado real nas amostras.
assert.deepEqual(dadoSensivel({ email: "a@exemplo.com", tel: "5511900000000", token: "EXEMPLO" }), []);
assert.equal(dadoSensivel({ email: "pessoa@gmail.com" }).length, 1);
assert.equal(dadoSensivel({ tel: "+55 63 98123-4567" }).length, 1);
assert.equal(dadoSensivel({ access_token: "qualquer-coisa" }).length, 1);
assert.equal(dadoSensivel({ texto: `chave ${"sk-"}${"a".repeat(20)}` }).length, 1);
console.log("contrato comum ok");

// Modo ao vivo com fetch falso (só memória): diz o que mudou sem repetir token, URL com query nem valores.
{
  const SEGREDO = "tok-falso-123";
  const VALOR = "Paciente Secreto";
  const metodos: string[] = [];
  const antes = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    metodos.push(String(init?.method ?? "GET"));
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/quebrada")) return new Response(`erro com ${SEGREDO}`, { status: 401 });
    return new Response(JSON.stringify({ data: [{ id: 1, nome: VALOR }] }), { status: 200 });
  }) as typeof fetch;
  const linhas: string[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => { linhas.push(a.join(" ")); };
  try {
    const r = await aoVivo({
      api: "teste",
      normalizadores: () => {},
      endpoints: [
        { nome: "ok", hosts: /^api\.exemplo\.com$/, campos: campos(["data[].id: string", "data[].nome: string"]), aoVivo: () => ({ url: `https://api.exemplo.com/x?token=${SEGREDO}` }) },
        { nome: "quebrada", hosts: /^api\.exemplo\.com$/, campos: campos(["id: string"]), aoVivo: () => ({ url: "https://api.exemplo.com/quebrada", headers: { Authorization: `Bearer ${SEGREDO}` } }) },
        { nome: "host", hosts: /^api\.exemplo\.com$/, campos: campos(["id: string"]), aoVivo: () => ({ url: "https://outro.exemplo.com/" }) },
        { nome: "sem_hosts", campos: campos(["id: string"]), aoVivo: () => ({ url: "https://api.exemplo.com/" }) },
        { nome: "pulado", hosts: /^api\.exemplo\.com$/, campos: campos(["id: string"]), aoVivo: () => null },
      ],
    });
    assert.deepEqual(r, { conferidos: 1, diferencas: 1, erros: 3, pulados: 1 });
  } finally {
    console.log = log;
    globalThis.fetch = antes;
  }
  const saida = linhas.join("\n");
  assert.ok(saida.includes("tipo: data[].id"), "acusa o tipo que mudou");
  assert.ok(saida.includes("HTTP 401"));
  assert.ok(!saida.includes(SEGREDO) && !saida.includes(VALOR) && !saida.includes("?token"), "nada de token, valor ou query na saída");
  assert.deepEqual(metodos, ["GET", "GET"], "só GET, e só para os hosts aceitos");
}
console.log("contrato ao vivo (simulado) ok");
