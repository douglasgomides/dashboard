import assert from "node:assert/strict";
import { cardsFechadosNaOrigem, CONFIRMA_AUSENCIA_MS, contaComoAbertoNoPainel, decidirFechamento } from "../api/_lib/flwchat-sync";

// Aberto no Nexo que não veio na lista completa do painel foi fechado no FlwChat.
assert.deepEqual(cardsFechadosNaOrigem(["a", "b", "c"], new Set(["a", "c", "novo"])), ["b"]);
// Tudo na lista: nada fechado.
assert.deepEqual(cardsFechadosNaOrigem(["a"], new Set(["a"])), []);
// Lista com menos da metade dos abertos (resposta ruim da API): não fecha nada.
const abertos = Array.from({ length: 40 }, (_, i) => `c${i}`);
assert.equal(cardsFechadosNaOrigem(abertos, new Set(abertos.slice(0, 10))), null);
// Painel pequeno esvaziado de verdade (menos de 20 abertos): fecha.
assert.deepEqual(cardsFechadosNaOrigem(["x", "y"], new Set()), ["x", "y"]);

// Trava de metade com confirmação (Dra. Marcella: painel com mais da metade fechada de uma vez nunca fechava nada).
const T0 = Date.parse("2026-11-01T10:00:00.000Z");
const listados = new Set(abertos.slice(0, 10));
const r1 = decidirFechamento(abertos, listados, undefined, T0);
assert.deepEqual(r1.fechar, [], "1ª listagem com a trava: só anota");
assert.equal(r1.aguardando, 30);
assert.equal(r1.pendentes.c39, new Date(T0).toISOString());
// Logo depois (antes do intervalo): continua esperando, com a data da 1ª ausência.
const r2 = decidirFechamento(abertos, listados, r1.pendentes, T0 + 10 * 60_000);
assert.deepEqual([r2.fechar.length, r2.pendentes.c39], [0, new Date(T0).toISOString()]);
// Confirmado numa listagem completa depois do intervalo: fecha; o card que voltou à lista não fecha.
const voltou = new Set([...listados, "c39"]);
const r3 = decidirFechamento(abertos, voltou, r1.pendentes, T0 + CONFIRMA_AUSENCIA_MS);
assert.equal(r3.fechar.length, 29);
assert.equal(r3.fechar.includes("c39"), false);
assert.deepEqual(r3.pendentes, {});
// Card que faltou pela primeira vez na rodada da confirmação espera a sua própria confirmação.
const r4 = decidirFechamento([...abertos, "novo-ausente"], listados, r1.pendentes, T0 + CONFIRMA_AUSENCIA_MS);
assert.deepEqual([r4.fechar.length, Object.keys(r4.pendentes)], [30, ["novo-ausente"]]);
// Lista vazia nunca confirma.
assert.deepEqual(decidirFechamento(abertos, new Set(), r1.pendentes, T0 + 10 * CONFIRMA_AUSENCIA_MS), { fechar: [], pendentes: {}, aguardando: 0 });
// Sem a trava, fecha direto e limpa os pendentes.
assert.deepEqual(decidirFechamento(["a", "b"], new Set(["a"]), { b: new Date(T0).toISOString() }, T0), { fechar: ["b"], pendentes: {}, aguardando: 0 });

// Card substituído (cards_por_item) entra na conta: se sumir da lista, fecha (Dr. Sergio: 10 ficavam abertos para sempre).
assert.equal(contaComoAbertoNoPainel({ removido_na_origem: null, substituido_por: null }), true);
assert.equal(contaComoAbertoNoPainel({ removido_na_origem: "2026-10-27T21:58:26Z", substituido_por: "123" }), true);
assert.equal(contaComoAbertoNoPainel({ removido_na_origem: "2026-10-27T21:58:26Z", substituido_por: null }), false, "apagado na origem por outro motivo fica como está");
console.log("test-flwchat-fechados: ok");
