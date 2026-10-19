import assert from "node:assert/strict";
import { lerRespostaTema, montarEntradaTema } from "../src/lib/tema-conversa";

const temas = ["Emagrecimento e canetas", "Menopausa"];

// Entrada mascara dado pessoal e corta mensagens longas.
const entrada = montarEntradaTema(temas, [{ i: 1, mensagens: ["Oi, meu fone é (11) 98765-4321 e email ana@x.com", "x".repeat(500)] }]);
assert.ok(entrada.includes("- Menopausa"));
assert.ok(entrada.includes("[telefone]") && entrada.includes("[e-mail]"));
assert.ok(!entrada.includes("98765"));
assert.ok(!entrada.includes("x".repeat(301)));

// Tema fora da lista vira null; acento e caixa não importam; índice desconhecido e repetido são ignorados.
const r = lerRespostaTema({ itens: [
  { i: 1, tema: "emagrecimento E CANETAS", assunto: "valor da consulta", intencao: "agendar", comercial: true, preco_pedido: true, objecoes: ["preco", "inventada", "preco"] },
  { i: 2, tema: "Tema que não existe", intencao: "qualquer", objecoes: null },
  { i: 1, tema: "Menopausa" },
  { i: 9, tema: "Menopausa" },
] }, temas, [1, 2]);
assert.equal(r.length, 2);
assert.equal(r[0].tema, "Emagrecimento e canetas");
assert.deepEqual(r[0].objecoes, ["preco"]);
assert.equal(r[0].preco_pedido, true);
assert.equal(r[1].tema, null);
assert.equal(r[1].intencao, "outro");
assert.equal(r[1].comercial, true);

// Administrativo sem "comercial" explícito não conta como venda.
assert.equal(lerRespostaTema({ itens: [{ i: 3, intencao: "administrativo" }] }, temas, [3])[0].comercial, false);
// Resposta fora do formato não grava nada.
assert.deepEqual(lerRespostaTema({ foo: 1 }, temas, [1]), []);
assert.deepEqual(lerRespostaTema(null, temas, [1]), []);
console.log("tema-conversa ok");
