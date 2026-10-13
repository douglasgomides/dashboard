// npx tsx scripts/test-guia-crm.ts — nomes reais de etapas dos CRMs dos clientes (13/10/2026).
import assert from "node:assert/strict";
import { papelDaEtapa, montarGuiaCrm } from "../src/lib/guia-crm";

const casos: [string, string][] = [
  ["Etapa de leads de entrada", "entrada"], ["Incoming leads", "entrada"], ["1.Contato Inicial", "entrada"], ["Novo Lead", "entrada"],
  ["Em Qualificação", "atendimento"], ["Negociação", "atendimento"], ["Orçamento enviado", "atendimento"], ["Orçado", "atendimento"],
  ["Consulta Agendada", "agendada"], ["4.Agendamento/préconsulta", "agendada"], ["CONFIRMADO", "agendada"], ["Procedimento agendado", "agendada"],
  ["Consulta Realizada", "realizada"], ["Reunião realizada", "realizada"],
  ["Venda ganha", "ganho"], ["Fechado - ganho", "ganho"], ["Closed - won", "ganho"], ["Venda realizada", "ganho"],
  ["Venda perdida", "perdido"], ["Fechado - perdido", "perdido"], ["Closed - lost", "perdido"], ["Desqualificado", "perdido"], ["5.Contato Não Elegível", "perdido"],
  ["No-show", "reativacao"], ["Follow UP D30", "reativacao"], ["Reativação", "reativacao"], ["Resgate de Consulta", "reativacao"],
  ["Pos-procedimento", "pos"], ["Fidelização", "pos"],
  ["GESTÃO INTERNA", "desconhecida"], ["Conexão", "desconhecida"],
];
for (const [nome, papel] of casos) assert.equal(papelDaEtapa(nome), papel, nome);

const g = montarGuiaCrm(
  [
    { pipeline_name: "Comercial", status_name: "Incoming leads", total: 900 },
    { pipeline_name: "Comercial", status_name: "Negociação", total: 300 },
    { pipeline_name: "Comercial", status_name: "GESTÃO INTERNA", total: 50 },
    { pipeline_name: "Comercial", status_name: "Venda ganha", total: 10 },
    { pipeline_name: "Comercial", status_name: "Venda perdida", total: 200 },
  ],
  { provider: "kommo", leads: 1000, comOrigem: 300, perdidos: 200, perdidosComMotivo: 40, comValorNoGanho: 2, ganhos: 10, semDono: 100, abertos: 1250, paradosMais90: 800 },
);
assert.deepEqual(g.faltam, ["agendada", "realizada"]);
assert.equal(g.desconhecidas[0].status_name, "GESTÃO INTERNA");
const p = Object.fromEntries(g.passos.map((x) => [x.id, x]));
assert.equal(p.etapas.feito, false);
assert.ok(p.origem.porque.includes("30%"));
assert.ok(p.motivo.porque.includes("20%"));
assert.ok(p.limpeza.porque.includes("64%"));
assert.ok(g.textoCliente.includes("Configurar funil"));
console.log("guia-crm: ok");
