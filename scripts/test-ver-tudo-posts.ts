// As respostas dos blocos dos Detalhes de Instagram › Posts (quick-ver-tudo-abas, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-posts.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import {
  cabecaDaCombinacaoMaisSalva,
  cabecaDaParteDeQuemViu,
  cabecaDaRetencao,
  cabecaDoExplorador,
  cabecaDoRanking,
  cabecaDoRepetirOuRevisar,
  cabecaDosGanchos,
  cabecaDosProximosAngulos,
  cabecaDoTemaNoFormato,
} from "../src/lib/leitura/ver-tudo-posts";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};

ok(cabecaDoRanking([5, 0, 3, 0, null]), "2 dos 4 posts do período não tiveram nenhum salvamento.");
ok(cabecaDoRanking([5, 1]), "Todos os 2 posts do período tiveram salvamento.");
// Salvamento não medido nunca vira zero.
assert.equal(cabecaDoRanking([null, null]).tipo, "falta");

ok(cabecaDoExplorador([1200, 1960, null]), "O post de maior alcance do período chegou a 1.960 pessoas.");
assert.equal(cabecaDoExplorador([null, 0]).tipo, "falta");

ok(cabecaDosProximosAngulos({ angulos: [{ tema: "Menopausa", medianSaved: 12, baseline: 5.5 }], temasComAmostra: 3, minimoDePosts: 3 }), 'O post típico de "Menopausa" salvou 12, contra 5,5 da conta.');
assert.equal(textoDaCabeca(cabecaDosProximosAngulos({ angulos: [], temasComAmostra: 0, minimoDePosts: 3 })), "Falta dado: nenhum tema tem 3 posts ou mais no período");
assert.equal(textoDaCabeca(cabecaDosProximosAngulos({ angulos: [], temasComAmostra: 2, minimoDePosts: 3 })), "Falta dado: nenhum tema salvou mais que o post típico da conta");

ok(cabecaDoRepetirOuRevisar({ temSuficiente: true, repetir: 2, revisar: 1, temasComAmostra: 3, minimoDePosts: 5, minimoDeTemas: 3 }), "2 temas para repetir e 1 para revisar.");
assert.equal(textoDaCabeca(cabecaDoRepetirOuRevisar({ temSuficiente: false, repetir: 0, revisar: 0, temasComAmostra: 1, minimoDePosts: 5, minimoDeTemas: 3 })), "Falta dado: só 1 de 3 temas com posts suficientes para comparar");

ok(cabecaDaParteDeQuemViu([0.012, 0.042], "salvou", "sem dado"), "No melhor post, 4,2% de quem viu salvou.");
ok(cabecaDaParteDeQuemViu([0.005], "compartilhou", "sem dado"), "No melhor post, 0,5% de quem viu compartilhou.");
assert.equal(cabecaDaParteDeQuemViu([], "salvou", "sem dado").tipo, "falta");

ok(cabecaDaCombinacaoMaisSalva([{ nome: "Menopausa · Reels", salvosPorPost: 8.5 }, { nome: "Pele · Carrossel", salvosPorPost: 4 }], 5), "Menopausa · Reels é a combinação mais salva: 8,5 por post.");
assert.equal(textoDaCabeca(cabecaDaCombinacaoMaisSalva([], 5)), "Falta dado: nenhuma combinação tem 5 posts ou mais no período");

ok(cabecaDosGanchos([120, 340, null]), "O post de melhor abertura teve 340 interações.");
assert.equal(cabecaDosGanchos([null]).tipo, "falta");

ok(cabecaDoTemaNoFormato([{ tema: "Pele", formato: "Reels", taxa: 6.24, posts: 5 }, { tema: "Sono", formato: "Carrossel", taxa: 9, posts: 2 }], 5), '"Pele" em Reels: 6,2% de quem viu interagiu, o maior.');
assert.equal(cabecaDoTemaNoFormato([{ tema: "Sono", formato: "Carrossel", taxa: 9, posts: 2 }], 5).tipo, "falta", "amostra pequena não ganha");

ok(cabecaDaRetencao({ reels: 8, comDado: 6, segura: 62.5 }), "O Reel típico segura 62,5% de quem começa a ver nos 3 primeiros segundos.");
assert.equal(textoDaCabeca(cabecaDaRetencao({ reels: 8, comDado: 0, segura: null })), "Falta dado: a Meta não entrega o tempo assistido dos Reels desta conta");
assert.equal(cabecaDaRetencao({ reels: 0, comDado: 0, segura: null }).tipo, "falta");

// Sem jargão na frase.
for (const c of [cabecaDaRetencao({ reels: 8, comDado: 6, segura: 62.5 }), cabecaDaParteDeQuemViu([0.04], "salvou", "x"), cabecaDosProximosAngulos({ angulos: [{ tema: "A", medianSaved: 3, baseline: 1 }], temasComAmostra: 1, minimoDePosts: 3 })]) {
  assert.doesNotMatch(textoDaCabeca(c), /mediana|hook|taxa de salvamento|engajamento/i);
}

console.log("test-ver-tudo-posts: ok");
