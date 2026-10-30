import assert from "node:assert/strict";
import { estadoConferido, ordenar, parcial, resultadoConversas, semanaDe, taxaAprendida, valorEmJogo } from "../src/lib/plano-semana";

// Semana começa na segunda (Brasília): domingo 23h em SP ainda é a semana anterior.
assert.equal(semanaDe(new Date("2026-10-20T15:00:00Z")), "2026-10-19");
assert.equal(semanaDe(new Date("2026-10-19T02:00:00Z")), "2026-10-12"); // domingo 23h SP
assert.equal(semanaDe(new Date("2026-10-19T03:30:00Z")), "2026-10-19"); // segunda 00h30 SP

// Valor em jogo com e sem ticket.
const v = valorEmJogo(10, 0.3, 1000);
assert.equal(v.valor, 3000);
assert.ok(v.calculo.includes("padrão"));
assert.ok(valorEmJogo(10, 0.15, 1000, true).calculo.includes("histórico desta clínica")); // mesma taxa da padrão, mas aprendida
assert.equal(valorEmJogo(10, 0.3, null).valor, null);
assert.ok(valorEmJogo(10, 0.3, null).calculo.includes("Cadastre o ticket"));

// Ordem: valor primeiro, depois quantidade; no máximo 5.
const o = ordenar([{ valor_brl: null, n: 9 }, { valor_brl: 500, n: 1 }, { valor_brl: 2000, n: 2 }, { valor_brl: null, n: 3 }, { valor_brl: 10, n: 1 }, { valor_brl: 1, n: 1 }]);
assert.deepEqual(o.map((x) => x.valor_brl ?? `n${x.n}`), [2000, 500, 10, 1, "n9"]);

// Resultado: feita só com 80% da lista atendida; abaixo disso é parcial.
const r = resultadoConversas(20, 16, 3, 1500);
assert.equal(r.resultado_brl, 4500);
assert.equal(r.feita, true);
assert.equal(resultadoConversas(20, 15, 3, 1500).feita, false);
assert.equal(resultadoConversas(7, 1, 0, null).feita, false); // 1 de 7 não é feita (caso da Dra. Marcella)
assert.equal(resultadoConversas(1, 1, 0, null).feita, true);
assert.equal(resultadoConversas(5, 0, 0, null).feita, false);
assert.ok(resultadoConversas(3, 3, 0, null, "preco").resultado_texto.includes("receberam o valor"));
assert.deepEqual(parcial({ n: 7, respondidas: 1 }), { respondidas: 1, n: 7 });
assert.equal(parcial({ n: 7, respondidas: 6 }), null);
assert.equal(parcial({ n: 7, respondidas: 0 }), null);

// Aprendizado: só pacientes atendidos, ações com 14+ dias, 2+ semanas, 20+ atendidos.
const agora = Date.parse("2026-10-30T12:00:00Z");
const h = (semana: string, n: number, respondidas: number, agendaram: number, estado = "nao_feita") => ({ semana, criado_em: `${semana}T10:00:00Z`, estado, medicao: { n, respondidas, agendaram } });
// Lista nunca executada (0 de 40 atendidos) não vira 0%: fica a padrão.
assert.deepEqual(taxaAprendida([h("2026-10-12", 40, 0, 0), h("2026-10-05", 40, 0, 0)], 0.15, agora), { taxa: 0.15, aprendida: false });
// Ação recente (menos de 14 dias) não entra.
assert.deepEqual(taxaAprendida([h("2026-10-19", 20, 20, 0), h("2026-10-05", 5, 5, 0)], 0.15, agora), { taxa: 0.15, aprendida: false });
// Uma semana só não basta.
assert.equal(taxaAprendida([h("2026-10-12", 30, 25, 5)], 0.15, agora).aprendida, false);
// Base = atendidos (não a lista), misturada à padrão com peso 20: (6 + 0,15×20) ÷ (30 + 20) = 0,18.
assert.deepEqual(taxaAprendida([h("2026-10-12", 40, 15, 3), h("2026-10-05", 40, 15, 3)], 0.15, agora), { taxa: 0.18, aprendida: true });
// Começo ruim não zera: 0 agendaram em 20 atendidos dá 7,5%, não 0%.
assert.equal(taxaAprendida([h("2026-10-12", 20, 10, 0), h("2026-10-05", 20, 10, 0)], 0.15, agora).taxa, 0.075);
// Descartada não ensina.
assert.equal(taxaAprendida([h("2026-10-12", 20, 10, 0, "descartada"), h("2026-10-05", 20, 10, 0)], 0.15, agora).aprendida, false);

// Conferência: evidência tira "Não foi feita" (fechada pela virada da semana), mas respeita a decisão da equipe.
assert.deepEqual(estadoConferido("nao_feita", true, false, true), { verificado: true, estado: "feita" });
assert.deepEqual(estadoConferido("proposta", true, false, false), { verificado: true, estado: "feita" });
assert.deepEqual(estadoConferido("nao_feita", true, true, true), { verificado: true });
// "Feita · conferido" antigo com 1 de 7 volta para o estado certo; feita à mão continua feita.
assert.deepEqual(estadoConferido("feita", false, false, true), { verificado: false, estado: "nao_feita" });
assert.deepEqual(estadoConferido("feita", false, false, false), { verificado: false, estado: "proposta" });
assert.deepEqual(estadoConferido("feita", false, true, true), { verificado: false });
console.log("plano-semana ok");

// O validador da API não pode descartar os campos do plano e o final do link personalizado.
import("../api/_lib/request-validation").then(({ manualRequestSchema }) => {
  const cid = "11111111-1111-4111-8111-111111111111";
  const link = manualRequestSchema.parse({ client_id: cid, alvo: "link_rastreado", acao: "renomear", id: cid, slug: "drajulia" });
  assert.equal((link as { slug?: string }).slug, "drajulia");
  const item = manualRequestSchema.parse({ client_id: cid, alvo: "plano_item", id: cid, estado: "feita", nota: "ok" });
  assert.equal((item as { estado?: string }).estado, "feita");
  assert.equal(manualRequestSchema.safeParse({ client_id: cid, alvo: "plano_item", id: cid }).success, false);
  assert.equal(manualRequestSchema.safeParse({ client_id: cid, alvo: "plano_semana" }).success, true);
  console.log("validação do plano ok");
});
