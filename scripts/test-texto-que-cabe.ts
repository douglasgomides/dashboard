import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chaveTema } from "../src/lib/classificacao-post";
import { dataDiaMes, numeroCurto, numeroOuSemDado, ROTULO_DOS_TEMAS, temaParaExibir } from "../src/lib/texto-que-cabe";

// Texto que cabe (quick 261112-jmh): número curto, "Sem dado", data dd/mm e tema com acento, tudo regra pura, sem IA.

// numeroCurto
assert.equal(numeroCurto(null), "—");
assert.equal(numeroCurto(undefined), "—");
assert.equal(numeroCurto(0), "0");
assert.equal(numeroCurto(999), "999");
assert.equal(numeroCurto(1000), "1,0 mil");
assert.equal(numeroCurto(3214), "3,2 mil");
assert.equal(numeroCurto(52913), "52,9 mil");
assert.equal(numeroCurto(99960), "100 mil");
assert.equal(numeroCurto(529400), "529 mil");
assert.equal(numeroCurto(999600), "1,0 mi");
assert.equal(numeroCurto(1034000), "1,0 mi");
assert.equal(numeroCurto(12500000), "12,5 mi");

// numeroOuSemDado: sem dado nunca vira 0
assert.equal(numeroOuSemDado(null), "Sem dado");
assert.equal(numeroOuSemDado(undefined), "Sem dado");
assert.equal(numeroOuSemDado(0), "0");
assert.equal(numeroOuSemDado(52913), "52.913");

// dataDiaMes
assert.equal(dataDiaMes("2026-10-15T13:00:00Z"), "15/10");
assert.equal(dataDiaMes("2026-10-16T01:30:00Z"), "15/10");
assert.equal(dataDiaMes(null), "Sem data");
assert.equal(dataDiaMes("isso não é data"), "Sem data");

// temaParaExibir
assert.equal(temaParaExibir("Consultorio e relacao com paciente"), "Consultório e relação com paciente");
assert.equal(temaParaExibir("Prompts e IA para conteudo"), "Prompts e IA para conteúdo");
assert.equal(temaParaExibir(" consultorio  e relacao com paciente "), "Consultório e relação com paciente");
assert.equal(temaParaExibir("Consultório e relação com paciente"), "Consultório e relação com paciente");
assert.equal(temaParaExibir("Menopausa"), "Menopausa");
assert.equal(temaParaExibir(null), null);
assert.equal(temaParaExibir(""), null);
assert.equal(temaParaExibir("null"), null);

// Para todo tema do classificador, a lista só põe acento: a chave não muda.
const fonte = await readFile(new URL("../api/_lib/tema-classifier.ts", import.meta.url), "utf8");
const temas = [...new Set([...fonte.matchAll(/^\s*tema:\s*"([^"]+)"/gm)].map((m) => m[1]))];
assert.ok(temas.length >= 25, `esperava ler os temas do classificador, li ${temas.length}`);
for (const t of temas) {
  assert.equal(chaveTema(temaParaExibir(t)), chaveTema(t), `a chave do tema "${t}" mudou`);
}
// E todo rótulo do mapa é o tema do classificador com acento.
for (const [chave, rotulo] of Object.entries(ROTULO_DOS_TEMAS)) {
  assert.equal(chaveTema(rotulo), chave, `o rótulo "${rotulo}" não bate com a chave "${chave}"`);
  assert.ok(temas.some((t) => chaveTema(t) === chave), `a chave "${chave}" não existe no classificador`);
}
// Os temas do classificador que perderam acento têm rótulo.
for (const t of temas) {
  if (/[áàâãéêíóôõúç]/i.test(t)) continue;
  const saida = temaParaExibir(t) ?? "";
  if (saida === t) assert.ok(!(chaveTema(t) in ROTULO_DOS_TEMAS), `tema "${t}" sem rótulo`);
}

console.log("test-texto-que-cabe: ok");
