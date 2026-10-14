import assert from "node:assert/strict";
import { acaoDaSituacao, calcularExecucao, ITENS_EXECUCAO, notaDaSemana, resumoSaude, semaforoKpis, type ItemRegistro, type SemanaSaude } from "../src/lib/sap-scores";

assert.equal(ITENS_EXECUCAO.length, 20);
assert.equal(ITENS_EXECUCAO.reduce((s, i) => s + i.peso, 0), 38);

// Exemplo da 11.04 (Clínica Aurora, fixada no D91): 3 parciais e 2 não cumpridos → 33 de 38 = 86,8%.
const st: Record<number, ItemRegistro["status"]> = { 2: "Parcial", 7: "Parcial", 8: "Parcial", 12: "Não cumprido", 16: "Não cumprido" };
const regs: ItemRegistro[] = ITENS_EXECUCAO.map((i) => ({ item: i.n, status: st[i.n] ?? "Cumprido", data_cumpriu: null, evidencia: st[i.n] === "Não cumprido" ? null : "link", observacao: null }));
const e = calcularExecucao(regs, 91);
assert.ok(Math.abs(e.d90! - 33 / 38) < 1e-9);
assert.match(e.habilita, /^Sim/);
assert.equal(e.semEvidencia, 0);
// Sem evidência, Cumprido vale Não cumprido (regra 3).
const semEv = calcularExecucao(regs.map((r) => (r.item === 20 ? { ...r, evidencia: "" } : r)), 91);
assert.ok(Math.abs(semEv.d90! - 30 / 38) < 1e-9);
assert.equal(semEv.semEvidencia, 1);
assert.match(semEv.habilita, /^Não/);
// Não se aplica sai da conta.
const nsa = calcularExecucao(regs.map((r) => (r.item === 8 ? { ...r, status: "Não se aplica" } : r)), 91);
assert.ok(Math.abs(nsa.d90! - 32 / 36) < 1e-9);
// No D20, % atual só com itens vencidos; D90 conta pendente como zero.
const cedo = calcularExecucao(regs.filter((r) => r.item <= 5), 20);
assert.ok(Math.abs(cedo.atual! - 7 / 9) < 1e-9); // item 6 (prazo D18) já venceu sem status: conta zero
assert.equal(cedo.vencidosSemStatus, 1);
assert.ok(cedo.d90! < 0.25);
assert.match(cedo.habilita, /^Prévia: abaixo de 80%/);

// Score de Saúde (linhas do exemplo).
const base: SemanaSaude = { semana: 1, tarefas_no_prazo: 1, sessoes_marcadas: 1, sessoes_com_decisor: 1, call_grupo: "Sem call", decisor_respondeu: "Sim", tempo_resposta_h: 4, kpis_verde: null, kpis_vermelho: null, sentimento: "Verde", o_que_aconteceu: null };
assert.equal(notaDaSemana(base).nota, 10);
assert.equal(notaDaSemana(base).cor, "Verde");
const s8: SemanaSaude = { ...base, semana: 8, tarefas_no_prazo: 0.6, call_grupo: "Não", decisor_respondeu: "Parcial", tempo_resposta_h: 26, kpis_verde: 2, kpis_vermelho: 0, sentimento: "Amarelo" };
const n8 = notaDaSemana(s8);
assert.ok(Math.abs(n8.nota! - 6.9417) < 0.01, String(n8.nota));
assert.equal(n8.cor, "Amarelo");
// Bloqueios
assert.equal(notaDaSemana({ ...base, sentimento: "Vermelho" }).cor, "Vermelho (sentimento)");
const bloq = notaDaSemana({ ...base, semana: 10, kpis_verde: 1, kpis_vermelho: 2, tarefas_no_prazo: 1, tempo_resposta_h: 1 });
// kpis = (10 + 0)/3 = 3,33 → nota = (2+1,5+1,5+1+1,33)/1 = 7,33 → amarelo comum
assert.equal(bloq.cor, "Amarelo");

const r = resumoSaude([base, { ...base, semana: 2, sentimento: "Vermelho" }, { ...base, semana: 3, sentimento: "Vermelho" }]);
assert.equal(r.vermelhasSeguidas, 2);
assert.equal(acaoDaSituacao(r)?.situacao, "Vermelho (sentimento)");
assert.equal(acaoDaSituacao(resumoSaude([base]))?.situacao, "Verde");

assert.deepEqual(semaforoKpis([
  { valor: 4, baseline: 130, meta: 10, menorMelhor: true },
  { valor: 0.84, baseline: 0.69, meta: 0.8, menorMelhor: false },
  { valor: 0.25, baseline: 0.31, meta: 0.38, menorMelhor: false },
]), { verde: 2, vermelho: 1 });
console.log("test-sap-scores: ok");
