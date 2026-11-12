// A regra da nota do dia (Phase 03.1.1.1, plano 02, D-03): cada sinal compara a clínica com ela mesma no período anterior, 50 = igual,
// cada 2% melhor soma 1 ponto e cada 2% pior tira 1 (0 a 100), e a nota é a média dos sinais com dado confiável. Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-nota-do-dia.ts
import assert from "node:assert/strict";
import { FAIXAS_DA_NOTA, REGRA_DA_NOTA, VERSAO_REGRA_DA_NOTA, notaDoDia, palavraDaNota, pontosDoFator, type EntradaDoFator } from "../src/lib/leitura/nota-do-dia";

assert.equal(VERSAO_REGRA_DA_NOTA, 1);

// ---------------------------------------------------------------- pontos por sinal (clamp 0 a 100)
assert.equal(pontosDoFator(0), 50);
assert.equal(pontosDoFator(20), 60);
assert.equal(pontosDoFator(-20), 40);
assert.equal(pontosDoFator(300), 100);
assert.equal(pontosDoFator(-300), 0);
assert.equal(pontosDoFator(2), 51);
assert.equal(pontosDoFator(-2), 49);

// ---------------------------------------------------------------- palavra por faixa
assert.equal(palavraDaNota(0), "Ruim");
assert.equal(palavraDaNota(49), "Ruim");
assert.equal(palavraDaNota(50), "Atenção");
assert.equal(palavraDaNota(69), "Atenção");
assert.equal(palavraDaNota(70), "Bom");
assert.equal(palavraDaNota(84), "Bom");
assert.equal(palavraDaNota(85), "Ótimo");
assert.equal(palavraDaNota(100), "Ótimo");
assert.deepEqual([...FAIXAS_DA_NOTA], ["0–49 Ruim", "50–69 Atenção", "70–84 Bom", "85–100 Ótimo"]);

// ---------------------------------------------------------------- a nota é a média dos sinais com dado
const entrada = (id: string, atual: number | null, anterior: number | null, extra: Partial<EntradaDoFator> = {}): EntradaDoFator => ({ id, rotulo: id, atual, anterior, ...extra });
const tres = notaDoDia([
  entrada("conversas", 162, 100), // +62% -> 81
  entrada("fecharam", 5, 10), // -50% -> 25
  entrada("custo", 9, 10, { menorEhMelhor: true }), // 10% mais barato -> 55
]);
assert.equal(tres.nota, 54, "round(mean(81, 25, 55)) = 54");
assert.equal(tres.palavra, "Atenção");
assert.deepEqual(tres.fatores.map((f) => f.pontos), [81, 25, 55]);
assert.deepEqual(tres.fatores.map((f) => f.dPct), [62, -50, 10]);
assert.equal(tres.faltaDado.length, 0);
assert.equal(tres.versao, VERSAO_REGRA_DA_NOTA);
// A linha de cada sinal: "atual contra anterior · ▲/▼ N%", até 90 caracteres.
assert.equal(tres.fatores[0].linha, "162 contra 100 · ▲ 62%");
assert.equal(tres.fatores[1].linha, "5 contra 10 · ▼ 50%");
assert.equal(tres.fatores[2].linha, "9 contra 10 · ▼ 10%", "o sinal mostra a direção do número; o custo caiu");
for (const f of tres.fatores) assert.ok(f.linha.length <= 90);

// menorEhMelhor: 9 contra 10 vale 10% melhor, +5 pontos.
const barato = notaDoDia([entrada("custo", 9, 10, { menorEhMelhor: true })]);
assert.equal(barato.nota, 55);
assert.equal(barato.fatores[0].pontos, 55);
const caro = notaDoDia([entrada("custo", 11, 10, { menorEhMelhor: true })]);
assert.equal(caro.nota, 45);
assert.equal(caro.palavra, "Ruim");

// formatar entra na linha
const comFormato = notaDoDia([entrada("custo", 33.33, 40, { menorEhMelhor: true, formatar: (n) => `R$ ${n.toFixed(2).replace(".", ",")}` })]);
assert.equal(comFormato.fatores[0].linha, "R$ 33,33 contra R$ 40,00 · ▼ 17%");

// ---------------------------------------------------------------- sinal sem dado confiável nunca vira 0: vai para Falta dado
const sem = notaDoDia([
  entrada("a", 120, 100),
  entrada("sem-anterior", 10, null),
  entrada("anterior-zero", 10, 0),
  entrada("anterior-negativo", 10, -3),
  entrada("sem-atual", null, 10),
  entrada("base-pequena", 3, 4, { baseMinima: 5 }),
  entrada("com-motivo", 7, null, { motivoSemDado: "O período anterior de pessoas não é medido" }),
]);
assert.equal(sem.nota, 60, "só o sinal com dado entra na média");
assert.equal(sem.fatores.length, 1);
assert.equal(sem.faltaDado.length, 6);
const motivo = (id: string) => sem.faltaDado.find((f) => f.id === id)?.motivo;
assert.equal(motivo("base-pequena"), "base pequena: 4 de 5");
assert.equal(motivo("com-motivo"), "O período anterior de pessoas não é medido");
assert.match(motivo("sem-anterior") ?? "", /.+/);
assert.match(motivo("anterior-zero") ?? "", /zero|zerado/i);
assert.match(motivo("sem-atual") ?? "", /.+/);
// baseDoAnterior manda na base quando vem; sem ela vale o próprio anterior.
const baseDoutro = notaDoDia([entrada("x", 50, 40, { baseMinima: 30, baseDoAnterior: 12 })]);
assert.equal(baseDoutro.nota, null);
assert.equal(baseDoutro.faltaDado[0].motivo, "base pequena: 12 de 30");
const baseOk = notaDoDia([entrada("x", 50, 40, { baseMinima: 30 })]);
assert.equal(baseOk.nota, 63, "+25% -> 62,5 arredonda para 63");

// Todos sem dado: nota null, palavra null (a tela diz Falta dado, nunca 0).
const nenhum = notaDoDia([entrada("a", null, null), entrada("b", 4, 0)]);
assert.equal(nenhum.nota, null);
assert.equal(nenhum.palavra, null);
assert.equal(nenhum.fatores.length, 0);
assert.equal(nenhum.faltaDado.length, 2);
assert.equal(notaDoDia([]).nota, null);

// ---------------------------------------------------------------- limites da nota
assert.equal(notaDoDia([entrada("a", 1000, 100)]).nota, 100);
assert.equal(notaDoDia([entrada("a", 0, 100)]).nota, 0, "caiu a zero contra um período medido: é zero de verdade, não falta de dado");
assert.equal(palavraDaNota(notaDoDia([entrada("a", 1000, 100), entrada("b", 1000, 100)]).nota!), "Ótimo");

// ---------------------------------------------------------------- a regra escrita
assert.equal(REGRA_DA_NOTA.length, 3);
const regra = REGRA_DA_NOTA.join(" ");
assert.match(regra, /Regra do Nexo/);
assert.match(regra, /não garante resultado/);
assert.match(regra, /50/);
for (const s of REGRA_DA_NOTA) assert.ok(s.length <= 120, `frase da regra curta: ${s}`);

console.log("test-nota-do-dia: ok");
