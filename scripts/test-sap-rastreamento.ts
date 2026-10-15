import assert from "node:assert/strict";
import { TESTES_RASTREIO, dispensavel, recheckCategoria, resumoFila, resumoTestes, type LinhaConversao, type RegistroTeste } from "../src/lib/sap-rastreamento";

assert.equal(TESTES_RASTREIO.length, 16);
assert.deepEqual(TESTES_RASTREIO.map((t) => t.n), Array.from({ length: 16 }, (_, i) => i + 1));

const reg = (item: number, status: RegistroTeste["status"] = "aprovado"): RegistroTeste => ({ item, status, evidencia: "print", feito_em: "2026-10-15" });
const exigidos = TESTES_RASTREIO.filter((t) => t.obrigatorio !== "recomendado").map((t) => t.n);
assert.equal(exigidos.length, 15); // o 6 é só recomendado

// Tudo aprovado, sem categoria registrada: não libera (o item 3 exige o status).
let r = resumoTestes(exigidos.map((n) => reg(n)), null, "Coordenador");
assert.equal(r.liberado, false);
r = resumoTestes(exigidos.map((n) => reg(n)), "basica", null);
assert.equal(r.liberado, false);
assert.equal(r.aguardandoConferencia, true);
r = resumoTestes(exigidos.map((n) => reg(n)), "basica", "Coordenador");
assert.equal(r.liberado, true);

// "Não se aplica" num item obrigatório não vale; num condicional vale.
r = resumoTestes([...exigidos.filter((n) => n !== 8).map((n) => reg(n)), reg(8, "nao_se_aplica")], "basica", "C");
assert.deepEqual(r.faltam, [8]);
r = resumoTestes([...exigidos.filter((n) => n !== 7).map((n) => reg(n)), reg(7, "nao_se_aplica")], "basica", "C");
assert.equal(r.liberado, true);

// Etapas offline (13): dispensável só com restrição intermediária ou total.
const t13 = TESTES_RASTREIO[12];
assert.equal(dispensavel(t13, "sem_restricao"), false);
assert.equal(dispensavel(t13, "total"), true);

// Reprovado aparece e bloqueia.
r = resumoTestes([...exigidos.filter((n) => n !== 11).map((n) => reg(n)), reg(11, "reprovado")], "basica", "C");
assert.deepEqual(r.reprovados, [11]);
assert.equal(r.liberado, false);

// Recheck a cada 15 dias.
assert.deepEqual(recheckCategoria(null, "2026-10-15"), { vencido: true, dias: null });
assert.equal(recheckCategoria("2026-10-01", "2026-10-15").vencido, false);
assert.equal(recheckCategoria("2026-09-29", "2026-10-15").vencido, true);

// Fila.
const l = (p: Partial<LinhaConversao>): LinhaConversao => ({ etapa: "EtapaA", plataforma: "meta", status: "pendente", motivo: null, ocorreu_em: "2026-10-14T12:00:00Z", enviado_em: null, ...p });
const f = resumoFila([
  l({}),
  l({ ocorreu_em: "2026-10-08T12:00:00Z" }),
  l({ status: "enviado", enviado_em: "2026-10-15T01:00:00Z" }),
  l({ status: "sem_dados" }),
  l({ plataforma: "google" }),
], "meta", "2026-10-15T12:00:00Z");
assert.equal(f.porStatus.pendente, 2);
assert.equal(f.metaPertoDeExpirar, 1);
assert.equal(f.semDadosPct, 0.25);
assert.equal(f.ultimoEnvio, "2026-10-15T01:00:00Z");
console.log("ok sap-rastreamento");
