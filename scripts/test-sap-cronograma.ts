import assert from "node:assert/strict";
import { CRONOGRAMA, cronogramaComDatas, dataDoDia, dataUtilSugerida, diaDoPrograma, resumoPausas, type Pausa } from "../src/lib/sap-cronograma";

assert.equal(CRONOGRAMA.length, 35);
assert.deepEqual(CRONOGRAMA.map((i) => i.n), Array.from({ length: 35 }, (_, i) => i + 1));
// Igual à planilha 00.02 (D0 12/10/2026 → D60 11/12, D90 10/01/2027).
const d0 = "2026-10-12";
assert.equal(dataDoDia(d0, [], 60, "2026-10-13"), "2026-12-11");
assert.equal(dataDoDia(d0, [], 90, "2026-10-13"), "2027-01-10");
assert.equal(diaDoPrograma(d0, [], "2026-10-13"), 1);

// Pausa de 10 dias que começou no D20 (01/11): empurra o que vem depois do D20, não antes.
const pausa: Pausa[] = [{ tipo: "atraso_cliente", inicio: "2026-11-01", fim: "2026-11-11" }];
assert.equal(dataDoDia(d0, pausa, 14, "2026-12-01"), "2026-10-26"); // antes: igual
assert.equal(dataDoDia(d0, pausa, 90, "2026-12-01"), "2027-01-20"); // D90 + 10
assert.equal(diaDoPrograma(d0, pausa, "2026-12-01"), 50 - 10);
// Pausa aberta conta até hoje.
const aberta: Pausa[] = [{ tipo: "pedido_clinica", inicio: "2026-11-01", fim: null }];
assert.equal(diaDoPrograma(d0, aberta, "2026-11-05"), 20);

// Data útil: sábado vai para segunda; fim de janela no sábado volta para sexta.
assert.equal(dataUtilSugerida("2026-10-17"), "2026-10-16");
assert.equal(dataUtilSugerida("2026-10-17"), "2026-10-16");

// Status: kickoff (D1–D3) feito; acessos (até D7) atrasado no D9; Sessão 1 (D8–D10) agora.
const c = cronogramaComDatas(d0, [], "2026-10-21", new Map([[3, { concluidoEm: "2026-10-14", evidencia: "ata" }]]));
assert.equal(c.find((i) => i.n === 3)!.status, "feito");
assert.equal(c.find((i) => i.n === 5)!.status, "atrasado");
assert.equal(c.find((i) => i.n === 9)!.status, "agora");
assert.equal(c.find((i) => i.n === 31)!.status, "agora"); // recorrente nunca "atrasado"

// Regras de pausa.
let r = resumoPausas(d0, [], [{ data: "2026-10-18", dias_uteis: 4, categoria: "acessos" }], "2026-10-21");
assert.equal(r.pausaDevida, 0);
r = resumoPausas(d0, [], [{ data: "2026-10-18", dias_uteis: 4, categoria: "acessos" }, { data: "2026-10-25", dias_uteis: 3, categoria: "aprovacao" }], "2026-10-30");
assert.equal(r.pausaDevida, 2);
assert.match(r.avisos[0], /7 dias úteis/);
r = resumoPausas(d0, [{ tipo: "pedido_clinica", inicio: "2026-11-01", fim: "2026-11-20" }], [], "2026-12-01");
assert.ok(r.avisos.some((a) => /15 dias/.test(a)));
assert.equal(r.janelaGarantia.de, dataDoDia(d0, [{ tipo: "pedido_clinica", inicio: "2026-11-01", fim: "2026-11-20" }], 62, "2026-12-01"));
console.log("ok sap-cronograma");
