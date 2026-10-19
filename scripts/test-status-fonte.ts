import assert from "node:assert/strict";
import { statusDaFonte, fonteLigada, piorStatus } from "../src/lib/status-fonte";

const hoje = "2026-10-14";
const s = (e: Parameters<typeof statusDaFonte>[0]) => statusDaFonte(e, hoje);

// Faixas de cor por dias sem dado.
assert.equal(s({ cadastro: true, data_ate: "2026-10-14" }).cor, "verde");
assert.equal(s({ cadastro: true, data_ate: "2026-10-13" }).cor, "verde");
assert.equal(s({ cadastro: true, data_ate: "2026-10-12" }).cor, "amarelo");
assert.equal(s({ cadastro: true, data_ate: "2026-10-11" }).cor, "amarelo");
assert.equal(s({ cadastro: true, data_ate: "2026-10-10" }).cor, "vermelho");

// Casos de 14/10 relatados: Juliana Carrion CRM até 05/09 (manual + erro), Marcelly anúncios até 09/10
// (planilha manual, sem cadastro), Juliana Paola CRM até 09/10.
const carrion = s({ cadastro: true, data_ate: "2026-09-05", last_error: "sem subdomínio", motivo: "Sem acesso ao CRM", motivo_dono: "manual" });
assert.equal(carrion.cor, "vermelho");
assert.equal(carrion.dias, 39);
assert.equal(carrion.motivo, "Sem acesso ao CRM");
const marcelly = s({ cadastro: false, data_ate: "2026-10-09", motivo_dono: "manual" });
assert.equal(marcelly.ligado, true, "fonte com dado é ligada");
assert.equal(marcelly.cor, "vermelho");
assert.equal(s({ cadastro: true, data_ate: "2026-10-09" }).cor, "vermelho");

// Erro com dado em dia também é vermelho.
assert.equal(s({ cadastro: true, data_ate: "2026-10-14", last_error: "timeout" }).cor, "vermelho");
// Ligado sem nenhum dado: vermelho, não cinza.
assert.equal(s({ cadastro: true, data_ate: null }).cor, "vermelho");
// Não ligado: cinza; "não usa" quando marcado como intencional.
assert.equal(s({ cadastro: false, data_ate: null }).rotulo, "Não ligado");
assert.equal(s({ cadastro: false, data_ate: null, naoUsa: true }).rotulo, "Não usa");
assert.equal(fonteLigada({ cadastro: false, data_ate: "2026-01-01" }), true);
// Toda data tem cor (nunca uma data sem status).
for (let d = 0; d < 60; d++) {
  const dia = new Date(Date.parse(hoje) - d * 86400000).toISOString().slice(0, 10);
  const r = s({ cadastro: false, data_ate: dia });
  assert.ok(r.data && r.cor !== "cinza", `data ${dia} sem cor`);
}
assert.equal(piorStatus([s({ cadastro: true, data_ate: hoje }), carrion])?.cor, "vermelho");
// CRM e WhatsApp contam dias úteis: quinta 15/10 sem lead e hoje segunda 19/10 são 2 dias úteis (amarelo), não 4 (vermelho).
const quintaSemLead = { cadastro: true, data_ate: "2026-10-15" };
assert.equal(statusDaFonte({ ...quintaSemLead, fonte: "crm" }, "2026-10-19").cor, "amarelo");
assert.equal(statusDaFonte({ ...quintaSemLead, fonte: "crm" }, "2026-10-19").dias, 2);
assert.equal(statusDaFonte({ ...quintaSemLead, fonte: "instagram" }, "2026-10-19").cor, "vermelho", "Instagram segue em dias corridos");
// Passou de 3 dias úteis: continua vermelho no CRM (ex.: Juliana Carrion, parada desde 05/09).
assert.equal(statusDaFonte({ cadastro: true, data_ate: "2026-10-09", fonte: "crm" }, "2026-10-19").cor, "vermelho");
// Erro continua vermelho mesmo em dia útil.
assert.equal(statusDaFonte({ ...quintaSemLead, fonte: "crm", last_error: "falhou" }, "2026-10-16").cor, "vermelho");
console.log("status-fonte: ok");
