// Conta de anúncios que nenhuma via lê (post impulsionado pelo app do Instagram), mas que a equipe lança na planilha
// de distribuição: vira aviso da equipe ("manual"), não erro de leitura. Planilha velha não cobre.
import assert from "node:assert/strict";
import { avaliarConta, resumirCliente } from "../api/_lib/anuncios-status";

const agora = new Date("2026-11-13T21:00:00Z");
const windsorVazia = [{ via: "windsor" as const, em: "2026-11-13T20:00:00Z", rows: 0, erro: null, precisaReconferir: 0, motivo: null, motivoDono: null }];

const semPlanilha = avaliarConta({ adAccountId: "act_1111", leituras: windsorVazia, ultimoDado: null, teveGasto: false }, agora);
assert.equal(semPlanilha.estado, "nao_lida");

const coberta = avaliarConta({ adAccountId: "act_1111", leituras: windsorVazia, ultimoDado: null, teveGasto: false, planilhaAte: "2026-11-13" }, agora);
assert.equal(coberta.estado, "ok");
assert.equal(coberta.erro, null);
assert.equal(coberta.avisoDono, "manual");
assert.match(coberta.aviso ?? "", /planilha da equipe \(última análise em 13\/11\)/);

const velha = avaliarConta({ adAccountId: "act_1111", leituras: windsorVazia, ultimoDado: null, teveGasto: false, planilhaAte: "2026-10-09" }, agora);
assert.equal(velha.estado, "nao_lida");

const semLeitura = avaliarConta({ adAccountId: "act_1111", leituras: [], ultimoDado: null, teveGasto: false, planilhaAte: "2026-11-10" }, agora);
assert.equal(semLeitura.estado, "ok");

// Erro de verdade (token com erro na Graph) não é escondido pela planilha.
const erroGraph = avaliarConta({ adAccountId: "act_1111", leituras: [{ ...windsorVazia[0], via: "graph", erro: "token expirado" }], ultimoDado: null, teveGasto: false, planilhaAte: "2026-11-13" }, agora);
assert.equal(erroGraph.estado, "erro");

const resumo = resumirCliente([coberta]);
assert.equal(resumo.ok, true);
assert.equal(resumo.motivoDono, "manual");
console.log("ok: conta coberta pela planilha");
