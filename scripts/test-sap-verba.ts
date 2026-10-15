import assert from "node:assert/strict";
import { avaliarVerba } from "../src/lib/sap-verba";
import { resumoFidelizacao } from "../src/lib/sap-fidelizacao";

// R$ 3.040 por mês = R$ 100 por dia. Subida em 01/11, ontem 10/11: 10 dias, previsto R$ 1.000.
const g = new Map<string, number>();
for (let d = 1; d <= 10; d++) g.set(`2026-11-${String(d).padStart(2, "0")}`, d <= 7 ? 90 : 100);
let v = avaliarVerba({ verbaMensal: 3040, subida: "2026-11-01", d90: "2027-01-10", ontem: "2026-11-10", gastoPorDia: g });
assert.equal(v.dias, 10);
assert.equal(Math.round(v.previstoAcumulado), 1000);
assert.equal(v.gastoAcumulado, 930);
assert.equal(v.emDia, true);
assert.equal(v.semana.ok, true);
// Gasto pela metade: fora do combinado.
const meia = new Map([...g].map(([d, x]) => [d, x / 2]));
v = avaliarVerba({ verbaMensal: 3040, subida: "2026-11-01", d90: null, ontem: "2026-11-10", gastoPorDia: meia });
assert.equal(v.emDia, false);
assert.equal(v.semana.ok, false);
assert.match(v.texto, /não avaliável/);
// Antes da subida.
assert.equal(avaliarVerba({ verbaMensal: 3000, subida: null, d90: null, ontem: "2026-11-10", gastoPorDia: g }).emDia, null);

// Fidelização: gatilhos só depois do D52 e com 2 semanas lançadas.
const sem = (semana: string, x: Partial<Record<string, number>>) => ({ semana, retornos: 0, recompras: 0, contatados_reativacao: 0, reativados_agendaram: 0, indicacoes: 0, indicacoes_com_codigo: 0, avaliacoes_google: 0, sair: 0, contatados_regua: 0, ...x });
let r = resumoFidelizacao([sem("2026-12-07", {}), sem("2026-12-14", {})], 60);
assert.deepEqual(r.gatilhos.map((x) => x.codigo), ["V16", "V17"]);
assert.equal(resumoFidelizacao([sem("2026-12-07", {}), sem("2026-12-14", {})], 40).gatilhos.length, 0);
r = resumoFidelizacao([sem("2026-12-07", { indicacoes: 4, indicacoes_com_codigo: 1, retornos: 3 }), sem("2026-12-14", { contatados_reativacao: 40, reativados_agendaram: 4, sair: 3 })], 60);
assert.deepEqual(r.gatilhos.map((x) => x.codigo), ["V16"]);
assert.equal(r.reativacao.taxa, 0.1);
assert.equal(r.alertas.length, 1); // 3 de 40 = 7,5% saíram
console.log("ok sap-verba + sap-fidelizacao");
