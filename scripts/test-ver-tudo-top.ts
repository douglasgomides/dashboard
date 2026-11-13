// As respostas dos blocos dos Detalhes de Instagram › Destaques (quick-ver-tudo-abas, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-top.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import { cabecaDaDistancia, cabecaDoRestoDaLista, cabecaDosPadroes, cabecaDosStoriesNoAr } from "../src/lib/leitura/ver-tudo-top";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};
const lugares = (...v: number[]) => v.map((valor) => ({ valor, texto: String(valor) }));

ok(cabecaDaDistancia(lugares(40, 12, 10, 9), "salvamentos"), "O 1º lugar tem 3,3× o 2º em salvamentos: foi fora da curva.");
ok(cabecaDaDistancia(lugares(10, 10, 9, 6), "salvamentos"), "Do 1º ao 4º lugar, salvamentos de 10 a 6: o resultado se repete.");
// O nome da métrica com jargão não entra: a frase sem ele.
ok(cabecaDaDistancia([{ valor: 0.02, texto: "2%" }, { valor: 0.019, texto: "1,9%" }], "taxa de salvamento"), "Do 1º ao 2º lugar, de 2% a 1,9%: o resultado se repete.");
assert.equal(cabecaDaDistancia(lugares(5), "salvamentos").tipo, "falta");

ok(cabecaDosPadroes(["Reels: 60% dos melhores, contra 30% de todos."], null, 15), "Os melhores têm 1 traço em comum que o resto não tem.");
ok(cabecaDosPadroes(["a", "b"], null, 15), "Os melhores têm 2 traços em comum que o resto não tem.");
assert.equal(textoDaCabeca(cabecaDosPadroes([], "Só há 3 item(ns) neste grupo", 15)), "Falta dado: poucas publicações no grupo para comparar");
assert.equal(textoDaCabeca(cabecaDosPadroes([], "Os melhores se parecem com o resto dos posts nos critérios medidos (formato, horário).", 15)), "Falta dado: nada separa os melhores do resto em 15 pontos ou mais");
assert.equal(textoDaCabeca(cabecaDosPadroes([], null, 15)), "Falta dado: nada separa os melhores do resto em 15 pontos ou mais");

ok(cabecaDoRestoDaLista(lugares(10, 10, 10, 9, 8, 6), "salvamentos"), "Do 4º ao 6º lugar, de 9 a 6 salvamentos.");
assert.equal(cabecaDoRestoDaLista(lugares(10, 9, 8), "salvamentos").tipo, "falta");

ok(cabecaDosStoriesNoAr({ ok: true, alcances: [120, 512, null] }), "O story no ar que mais alcança chegou a 512 pessoas.");
ok(cabecaDosStoriesNoAr({ ok: true, alcances: [] }), "0 stories no ar neste momento.");
assert.equal(cabecaDosStoriesNoAr({ ok: false, alcances: [] }).tipo, "falta");
assert.equal(cabecaDosStoriesNoAr(null).tipo, "falta");
// Alcance não devolvido nunca vira zero.
assert.equal(textoDaCabeca(cabecaDosStoriesNoAr({ ok: true, alcances: [null] })), "Falta dado: a Meta não devolveu o alcance dos stories no ar");

console.log("test-ver-tudo-top: ok");
