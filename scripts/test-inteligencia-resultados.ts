import assert from "node:assert/strict";
import { diasDoMes, leituraDoPeriodo, ritmoDaMeta } from "../src/lib/inteligencia-resultados";

// Metas
assert.equal(ritmoDaMeta(20, 9, 3, 30).status, "cedo", "antes de 5 dias não projeta");
assert.equal(ritmoDaMeta(20, 9, 3, 30).projecao, null);
const risco = ritmoDaMeta(20, 13, 18, 30); // 13/18*30 = 21,7 -> alcança
assert.equal(risco.status, "no_prazo");
assert.equal(risco.projecao, 22);
assert.equal(ritmoDaMeta(20, 9, 18, 30).status, "fora_do_prazo"); // 15 = 75%
const emRisco = ritmoDaMeta(20, 7, 18, 30); // 7/18*30 = 11.7 -> 12 (60%) fora
assert.equal(emRisco.status, "fora_do_prazo");
const limite = ritmoDaMeta(20, 10, 18, 30); // 16.7 -> 17 (85%) em risco
assert.equal(limite.status, "em_risco");
assert.equal(limite.faltam, 10);
assert.equal(limite.diasRestantes, 12);
assert.equal(limite.porDia, 0.9); // 10/12 = 0.83 -> arredonda para cima, 1 casa
assert.equal(ritmoDaMeta(20, 25, 10, 30).status, "batida");
assert.equal(ritmoDaMeta(20, 25, 10, 30).pct, 100);
assert.equal(ritmoDaMeta(20, 5, 30, 30).porDia, null, "mês acabou");

// Leitura
assert.deepEqual(leituraDoPeriodo({ mandaram_mensagem: 205 }, null), []);
assert.deepEqual(leituraDoPeriodo({ agendaram: 3 }, { agendaram: 2 }), [], "base pequena não vira frase");
const l = leituraDoPeriodo({ mandaram_mensagem: 205, agendaram: 9, fecharam: 0 }, { mandaram_mensagem: 183, agendaram: 11, fecharam: 2 });
assert.ok(l.some((x) => x.texto.includes("Mais pessoas chamaram a clínica 12%")), "contatos +12%");
assert.ok(l.some((x) => x.texto.includes("Os agendamentos caíram 18%")), "agendamentos -18%");
assert.ok(l.some((x) => x.texto.includes("ponto fraco está na conversa")), "diagnóstico mais gente, menos agenda");
assert.ok(l.some((x) => x.texto.includes("4,4 agendaram (antes, 6)")), "taxa por 100");
assert.ok(l.length <= 4);
const nulo = leituraDoPeriodo({ mandaram_mensagem: 100, agendaram: null }, { mandaram_mensagem: 50, agendaram: 20 });
assert.ok(nulo.every((x) => !x.texto.includes("agend")), "não fala do que não foi medido");

// Dias do mês
assert.deepEqual(diasDoMes("2026-11-06"), { passados: 6, total: 30, inicio: "2026-11-01" });
assert.equal(diasDoMes("2028-02-10").total, 29);
console.log("inteligencia de resultados: ok");
