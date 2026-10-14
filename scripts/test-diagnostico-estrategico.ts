// npx tsx scripts/test-diagnostico-estrategico.ts
import assert from "node:assert/strict";
import { grauDeCautela, montarDiagnostico, variacoes } from "../src/lib/diagnostico-estrategico";

const dia = (d: string, reach: number, inter: number, novos: number, saves: number) => ({ date: d, reach, total_interactions: inter, new_followers: novos, saves });
const atual = Array.from({ length: 10 }, (_, i) => dia(`2026-10-${String(i + 1).padStart(2, "0")}`, 2000, 100, 5, 20));
const ant = Array.from({ length: 10 }, (_, i) => dia(`2026-09-${String(i + 1).padStart(2, "0")}`, 1000, 150, 5, 20));

// Variação: alcance dobrou, interações caíram; mesmos dias = não limitada.
const v = variacoes(atual, ant);
assert.equal(v.limitada, false);
assert.equal(v.lista.find((x) => x.nome === "Alcance")!.var, 1);
assert.ok(Math.abs(v.lista.find((x) => x.nome === "Interações")!.var + 1 / 3) < 1e-9);
// Novos seguidores com base pequena (50 < 20? não: 50 >= 20 entra); sem anterior: limitada.
assert.equal(variacoes(atual, undefined).limitada, true);
// Dias diferentes: compara média por dia e avisa.
const curto = variacoes(atual.slice(0, 5), ant);
assert.equal(curto.limitada, true);
assert.match(curto.motivo!, /5 x 10/);
assert.equal(curto.lista.find((x) => x.nome === "Alcance")!.var, 1);

const ins = (id: string, tom: string, titulo: string, extra: any = {}) => ({ id, tom, titulo, area: "conteudo", diagnostico: "", evidencia: "ev " + titulo, confianca: "media", impacto: "medio", responsavel: "social_media", ...extra });
const resultado: any = {
  insights: [ins("dado-crm", "ruim", "CRM sujo"), ins("a", "atencao", "Frequência caindo"), ins("b", "bom", "Carrossel salva 2x mais", { acao: { texto: "Fazer mais carrossel", rota: "/ideias" } }), ins("c", "ruim", "Campanha cara")],
  proximaAcao: ins("c", "ruim", "Campanha cara", { acao: { texto: "Pausar a campanha Teste 8" } }),
  limitacoes: [{ id: "l", area: "comercial", texto: "CRM sem etapa de agendamento", resolve: "comercial", comoResolver: "Criar a etapa" }],
};
const posts = [
  { caption: "Menopausa e sono. Veja", reach: 1000, saved: 80, format: "reels" },
  ...Array.from({ length: 9 }, () => ({ caption: "x", reach: 1000, saved: 10, format: "carrossel" })),
];
const ads: any = { campanhas: [
  { campanha: "Teste 8", vereditoOficial: "Cortar", gasto: 752, comparacao: "custa 2x a típica", motivo: "", confianca: "media" },
  { campanha: "Teste 4", vereditoOficial: "Atrai mas não converte", gasto: 300, comparacao: "", motivo: "clica e não conversa", confianca: "media" },
  { campanha: "Boa", vereditoOficial: "Escalar", gasto: 900, comparacao: "", motivo: "", confianca: "alta" },
] };

const d = montarDiagnostico({ resultado, diario: atual, diarioAnterior: ant, ads, posts });
const por = Object.fromEntries(d.map((x) => [x.id, x]));
assert.equal(d.length, 8);
assert.match(por.melhorou.resposta!, /Alcance subiu \+100%/);
assert.match(por.piorou.resposta!, /Interações caiu -33%/);
assert.equal(por.oportunidade.resposta, "Carrossel salva 2x mais");
assert.equal(por.oportunidade.rota, "/ideias");
assert.equal(por.risco.resposta, "Campanha cara"); // "dado-" fica fora; ruim antes de atenção
assert.equal(por.proxima.resposta, "Pausar a campanha Teste 8");
assert.match(por.pauta.resposta!, /Menopausa e sono” em carrossel/);
assert.match(por.campanha.resposta!, /^Teste 8: cortar/);
assert.match(por.campanha.evidencia!, /R\$\s752/);
assert.equal(por.faltante.resposta, "CRM sem etapa de agendamento");

// Pauta planejada tem prioridade; problema de dado alto vira o dado faltante.
const d2 = montarDiagnostico({ resultado, diario: atual, diarioAnterior: ant, ads, posts, pautaPlanejada: { titulo: "Quanto custa", formato: "Carrossel", dia: "2026-10-15" }, problemasAltos: [{ titulo: "78% dos leads parados", correcao: "Mover para perdido" }] });
const p2 = Object.fromEntries(d2.map((x) => [x.id, x]));
assert.equal(p2.pauta.resposta, "Quanto custa (Carrossel, 15/10)");
assert.equal(p2.faltante.resposta, "78% dos leads parados");

// Sem dado nenhum: nada inventado, tudo marcado.
const vazio = montarDiagnostico({ resultado: null, diario: [] });
const pv = Object.fromEntries(vazio.map((x) => [x.id, x]));
assert.equal(pv.melhorou.resposta, null);
assert.equal(pv.oportunidade.resposta, null);
assert.equal(pv.proxima.resposta, null);
assert.equal(pv.pauta.resposta, null);
assert.equal(pv.campanha.resposta, null);
assert.ok(vazio.filter((x) => !x.resposta).every((x) => x.limitada && x.motivoLimite));
assert.equal(grauDeCautela(vazio).semBase, 6);
console.log("test-diagnostico-estrategico: ok");
