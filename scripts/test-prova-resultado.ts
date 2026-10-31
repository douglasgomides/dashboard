import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bloco, compararPeriodos, direcao, duracaoCurta, semanaInconsistente, taxaContida, type SemanaProva } from "../src/lib/prova-resultado";

const s = (semana: string, comerciais: number, agendou: number, resp: number | null, respondidas: number, em5: number, inv: number): SemanaProva =>
  ({ semana, conversas: comerciais + 5, comerciais, agendou, resposta_mediana_s: resp, respondidas, resp_5min: em5, investimento: inv });
const linhas = [
  s("2026-08-24", 20, 4, 3600, 20, 4, 500), s("2026-08-31", 20, 4, 3600, 20, 4, 500), s("2026-09-07", 20, 4, 3600, 20, 4, 500), s("2026-09-14", 20, 4, 3600, 20, 4, 500),
  s("2026-09-21", 20, 8, 600, 20, 12, 500), s("2026-09-28", 20, 8, 600, 20, 12, 500), s("2026-10-05", 20, 8, 600, 20, 12, 500), s("2026-10-12", 20, 8, 600, 20, 12, 500),
  s("2026-10-19", 3, 3, 60, 3, 3, 100), // semana corrente: fora
];
const { atual, anterior } = compararPeriodos(linhas, "2026-10-21T12:00:00Z");
assert.equal(atual.semanas, 4);
assert.equal(atual.agendou, 32);
assert.equal(atual.taxa, 0.4);
assert.equal(anterior.taxa, 0.2);
assert.equal(atual.resposta_s, 600);
assert.equal(atual.em5, 0.6);
assert.equal(atual.custo_agendamento, 2000 / 32);
assert.equal(anterior.custo_agendamento, 2000 / 16);
assert.equal(direcao(atual.taxa, anterior.taxa), "melhor");
assert.equal(direcao(atual.resposta_s, anterior.resposta_s, true), "melhor");
assert.equal(direcao(atual.custo_agendamento, anterior.custo_agendamento, true), "melhor");
assert.equal(direcao(105, 100), "igual");
assert.equal(direcao(null, 1), "sem_dado");
assert.equal(bloco([s("2026-10-12", 5, 2, null, 0, 0, 0)]).taxa, null, "amostra pequena não vira taxa");
assert.equal(bloco([s("2026-10-12", 30, 2, null, 0, 0, 300)]).custo_agendamento, null, "menos de 3 agendamentos: sem custo");
assert.equal(duracaoCurta(5400), "1,5 h");

// Taxa contida: numerador nunca maior que o denominador. Acima de 1 é erro de dado, nunca vira taxa.
assert.deepEqual(taxaContida(5, 10), { taxa: 0.5, erro_dado: false });
assert.deepEqual(taxaContida(10, 10), { taxa: 1, erro_dado: false });
assert.deepEqual(taxaContida(11, 10), { taxa: null, erro_dado: true });
assert.deepEqual(taxaContida(3, 5), { taxa: null, erro_dado: false }, "amostra pequena sem erro");

// Dr. Sergio, 05/10 a 26/10, números reais da função antiga (agendou sem filtro de comercial): 294 de 252 = 117%.
const sergioAntes = [s("2026-10-05", 66, 81, null, 0, 0, 0), s("2026-10-12", 66, 82, null, 0, 0, 0), s("2026-10-19", 71, 90, null, 0, 0, 0), s("2026-10-26", 49, 41, null, 0, 0, 0)];
const bAntes = bloco(sergioAntes);
assert.equal(bAntes.agendou, 294);
assert.equal(bAntes.comerciais, 252);
assert.equal(bAntes.taxa, null, "117% não é exibido");
assert.equal(bAntes.erro_dado, true);
assert.equal(semanaInconsistente(sergioAntes[2]), true);
assert.equal(semanaInconsistente(sergioAntes[3]), false);
// Uma semana inconsistente contamina o bloco mesmo que a soma feche (Juliana 12/10: 27 de 16).
const juliMisto = bloco([s("2026-10-05", 14, 3, null, 0, 0, 100), s("2026-10-12", 16, 27, null, 0, 0, 100), s("2026-10-19", 29, 14, null, 0, 0, 100), s("2026-10-26", 25, 8, null, 0, 0, 100)]);
assert.ok(juliMisto.agendou <= juliMisto.comerciais);
assert.equal(juliMisto.taxa, null);
assert.equal(juliMisto.erro_dado, true);
assert.equal(juliMisto.custo_agendamento, null, "erro de dado também esconde o custo");
// Depois (agendou e comercial): 27 + 19 + 35 + 20 = 101 de 252 = 40%.
const bDepois = bloco([s("2026-10-05", 66, 27, null, 0, 0, 0), s("2026-10-12", 66, 19, null, 0, 0, 0), s("2026-10-19", 71, 35, null, 0, 0, 0), s("2026-10-26", 49, 20, null, 0, 0, 0)]);
assert.equal(bDepois.erro_dado, false);
assert.equal(Math.round((bDepois.taxa ?? 0) * 100), 40);
assert.ok((bDepois.taxa ?? 2) <= 1);

// Propriedade: para qualquer semana com agendou <= comerciais, a taxa do bloco fica entre 0 e 1.
for (let i = 0; i < 500; i++) {
  const xs = Array.from({ length: 1 + (i % 6) }, (_, k) => { const c = (i * 7 + k * 13) % 80; return s(`2026-09-${String(1 + k).padStart(2, "0")}`, c, (i * 3 + k) % (c + 1), null, 0, 0, 0); });
  const b = bloco(xs);
  assert.equal(b.erro_dado, false);
  if (b.taxa != null) assert.ok(b.taxa >= 0 && b.taxa <= 1);
}

// Migração: o numerador da função passa a exigir comercial, e só essa linha muda.
const mig = readFileSync(new URL("../supabase/migrations/20261101100000_prova_resultado_agendou_comercial.sql", import.meta.url), "utf8");
assert.match(mig, /count\(\*\) filter \(where l\.agendou and l\.comercial\) as agendou/);
assert.match(mig, /Reversão:/);
assert.match(mig, /pg_get_functiondef\('public\.prova_resultado\(uuid,integer\)'/);
assert.doesNotMatch(mig, /\bgrant\b|\brevoke\b|security invoker/i);
assert.doesNotMatch(mig, /\u2014/, "sem travessão");

// Aviso na tela e nota de versão.
const tela = readFileSync(new URL("../src/components/prova-resultado.tsx", import.meta.url), "utf8");
assert.match(tela, /Mudou em \{MUDOU_AGENDOU_EM\}/);
assert.match(tela, /Erro de dado/);
const notas = readFileSync(new URL("../docs/notas-de-versao.md", import.meta.url), "utf8");
assert.match(notas, /31\/10\/2026\. Prova de resultado/);
console.log("prova-resultado: ok");
