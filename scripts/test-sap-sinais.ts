import assert from "node:assert/strict";
import { indicadoresAtendimento, lerSinais } from "../src/lib/sap-sinais";

assert.equal(lerSinais(null), null);
const s = lerSinais({
  tem_sinal_confirmado: true, tem_sinal_remarcou: true, confirmados: 30, remarcados: 6, perdidos_com_motivo: 20,
  motivos: [{ categoria: "Preço", total: 6, sugeridos: 6 }, { categoria: "Medo ou insegurança", total: 3, sugeridos: 0 }, { categoria: "Tempo para decidir", total: 6, sugeridos: 0 }, { categoria: "Outro", total: 5, sugeridos: 5 }],
  lista: [],
})!;
let i = indicadoresAtendimento(s, 40, null);
assert.equal(i.confirmacao.valor, 0.75);
assert.equal(i.confirmacao.fonte, "crm");
assert.equal(i.remarcacao, 0.15);
assert.equal(i.totalMotivos, 20);
const cod = i.gatilhos.map((g) => g.codigo);
assert.deepEqual(cod, ["V8", "V9", "V12"]); // 45% objeção; tempo 30% não passa
// Sem etapa de confirmação no CRM: usa a auditoria.
i = indicadoresAtendimento({ ...s, tem_sinal_confirmado: false }, 40, { semana: "2026-10-12", conversas: 10, nota_media: 10.5, confirmacao_vespera: 0.9, f1_24h: 0.7, pensando_cadencia: 0.8, observacao: null });
assert.equal(i.confirmacao.fonte, "auditoria");
assert.ok(!i.gatilhos.some((g) => g.codigo === "V8"));
assert.ok(i.gatilhos.some((g) => g.codigo === "V14"));
assert.ok(i.gatilhos.some((g) => g.codigo === "V13" && /cadência/.test(g.motivo)));
// Poucos motivos e poucos agendados: não dispara V12 nem V9.
i = indicadoresAtendimento({ ...s, remarcados: 3, motivos: [{ categoria: "Preço", total: 5, sugeridos: 0 }] }, 8, null);
assert.ok(!i.gatilhos.some((g) => g.codigo === "V12" || g.codigo === "V9"));
console.log("ok sap-sinais");
{
  const { preencherComIA } = await import("../src/lib/sap-sinais");
  const p = preencherComIA({ amostra: 10, nota_media_0a10: 7.5, falhas: [{ falha: "demora", n: 4 }, { falha: "sem_follow_up", n: 3 }], abertas: 4, abertas_sem_follow_up: 1 });
  assert.equal(p.nota, 9);
  assert.equal(p.f1, 75);
  assert.ok(p.obs.startsWith("IA: demora para responder (4)"));
  assert.equal(preencherComIA({ amostra: 0, nota_media_0a10: null, falhas: [], abertas: 0, abertas_sem_follow_up: 0 }).f1, null);
  console.log("ok sap-sinais ia");
}
