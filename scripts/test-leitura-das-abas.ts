// A leitura do período nas abas das pastas vira descoberta (quick-ver-tudo-abas, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-leitura-das-abas.ts
import assert from "node:assert/strict";
import { checarDescoberta } from "../src/lib/leitura/cinco-segundos";
import { fatosPorOrigem } from "../src/lib/leitura/fatos-comercial";
import { descobertaDaFalta, leituraDaAba, leituraDaAbaSemDado } from "../src/lib/leitura/leitura-das-abas";
import { ABRIR_VER_TUDO } from "../src/lib/leitura/leitura-em-descobertas";

const hoje = "2026-11-13";
const linhas = [
  { chave: "Instagram", total: 300, ganhos: 30, perdidos: 60 },
  { chave: "Indicação", total: 100, ganhos: 20, perdidos: 10 },
  { chave: "Não informado", total: 20, ganhos: 2, perdidos: 0 },
];
const fatos = fatosPorOrigem({ hoje, linhas });

// Carregando: nada.
assert.deepEqual(leituraDaAba({ fatos: null }), { visiveis: [], resto: [] });

// Sem o que a aba mostra: o fato da origem líder vira descoberta, com o próximo passo como ação.
const semTopo = leituraDaAba({ fatos });
const lider = semTopo.visiveis.find((d) => d.id === "leitura-origem-lider");
assert.ok(lider, "a origem líder vira descoberta quando a aba não a mostra");
assert.match(lider.acao.rotulo, /^Conferir se o status ganho/);
assert.equal(lider.acao.local, ABRIR_VER_TUDO);
assert.equal(lider.origem, "proximo-passo");

// A aba já mostra "Instagram 300 · 30 ganhos": o fato não volta; o passo de conferir vira uma descoberta própria.
const comTopo = leituraDaAba({ fatos, textoDoTopo: ["Instagram 300 10% ganho 30 ganhos 60 perdidos"] });
assert.ok(!comTopo.visiveis.some((d) => d.id === "leitura-origem-lider"), "o que a aba mostra não se repete");
assert.ok(comTopo.visiveis.some((d) => /status ganho/.test(d.frase)), "o próximo passo não some");

// No máximo 3 à vista; todas passam nas guardas.
for (const r of [semTopo, comTopo]) {
  assert.ok(r.visiveis.length <= 3);
  for (const d of [...r.visiveis, ...r.resto]) assert.deepEqual(checarDescoberta(d), [], d.id);
}

// Portão fechado: UMA descoberta "Falta dado", com o passo que resolve (a aba não perde o aviso).
const fechado = leituraDaAba({ fatos: fatosPorOrigem({ hoje, linhas: [] }) });
assert.equal(fechado.visiveis.length, 1);
assert.match(fechado.visiveis[0].frase, /^Falta dado: /);
assert.equal(fechado.visiveis[0].selo, "Falta dado");
assert.ok(fechado.visiveis[0].porque.barras.every((b) => b.faltou && b.exibicao === "Falta dado"), "nada medido: nenhuma barra cheia");
assert.deepEqual(checarDescoberta(fechado.visiveis[0]), []);
assert.match(leituraDaAbaSemDado().visiveis[0].frase, /^Falta dado: não há dado neste período/);

// Motivo longo: a frase corta em 90, sem cortar palavra, e o "Por quê?" guarda o texto inteiro.
const longa = descobertaDaFalta(`${"a".repeat(30)} ${"b".repeat(30)} ${"c".repeat(40)}`, { frase: "Conferir.", verbo: "conferir", quem: "equipe_hub", rotuloQuem: "Equipe" });
assert.ok(longa.frase.length <= 90);
assert.match(longa.porque.titulo, /c{40}/);

console.log("test-leitura-das-abas: ok");
