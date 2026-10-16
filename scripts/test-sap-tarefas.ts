import assert from "node:assert/strict";
import { CRONOGRAMA, diaUtilAnterior, ehDiaUtil } from "../src/lib/sap-cronograma";
import {
  CODIGO, MANUAL, ORDEM, alertasFundador, contarTarefas, daSemana, deteccoes, ehDoPapel, montarTarefas, papelDoDono, papeisSemPessoa, porUrgencia, rotuloPrazo,
  type EntradaTarefas,
} from "../src/lib/sap-tarefas";

// Papéis: Condutor no lugar do Fundador nas sessões; Fundador só escala.
assert.equal(papelDoDono("Condutor"), "condutor");
assert.equal(papelDoDono("Analista de Onboarding"), "onboarding");
assert.equal(papelDoDono("Editor e Copy"), "editor");
assert.deepEqual(CRONOGRAMA.filter((i) => i.dono === "Condutor").map((i) => i.n), [3, 9, 11, 26, 30, 33]);
assert.ok(!CRONOGRAMA.some((i) => i.dono === "Fundador"));

// Todo item tem manual (por quê, como, onde).
for (const it of CRONOGRAMA) assert.ok(MANUAL[it.n]?.porque && MANUAL[it.n].como.length && MANUAL[it.n].onde.rotulo, `manual ${it.n}`);

// Numeração por fase em ordem cronológica; o item 25 (D45) não fica no meio da Atração.
assert.equal(ORDEM.length, 35);
assert.equal(CODIGO.get(1), "1.1");
const atracao = ORDEM.filter((o) => o.fase === "Atração").map((o) => o.n);
assert.ok(!atracao.includes(25));
assert.deepEqual(atracao, [13, 15, 14, 16]); // alvos D17, D21, D22, D26
assert.ok(ORDEM.filter((o) => o.fase === "Contínuo").every((o) => CODIGO.get(o.n)!.startsWith("C")));

// Dia útil: sábado/domingo/feriado → dia útil anterior.
assert.equal(diaUtilAnterior("2026-10-17"), "2026-10-16"); // sábado → sexta
assert.equal(diaUtilAnterior("2026-10-18"), "2026-10-16"); // domingo → sexta
assert.equal(ehDiaUtil("2026-10-12"), false); // feriado (12/10)
assert.equal(diaUtilAnterior("2026-10-12"), "2026-10-09");
assert.equal(ehDiaUtil("2026-02-17"), false); // Carnaval 2026

const entrada = (extra: Partial<EntradaTarefas> = {}, cli: Partial<EntradaTarefas["clinica"]> = {}): EntradaTarefas => ({
  hoje: "2026-10-16",
  clinica: {
    id: "c1", clientId: "x", nome: "Clínica", d0: "2026-10-15", pausas: [], ticket: 4500, drivePasta: null, decisor: null, coordenador: null,
    aceiteMetasEm: null, aceiteMetasPor: null, consultaPaga: true, categoriaMeta: null, categoriaVerificadaEm: null, conferidoPor: null, conferidoEm: null,
    garantiaStatus: null, ...cli,
  },
  fontes: { crm: true, whatsapp: true, anuncios: false, marcos: ["agendado", "pensando", "qualificado"] },
  plano: [
    { kpi: "resposta", baseline: 48.4, origem: "medido", meta: 24 },
    { kpi: "comparecimento", baseline: null, origem: null, meta: null },
    { kpi: "conversao", baseline: null, origem: null, meta: null },
  ],
  status: [], rotinas: [], acessos: [{ item: "A1", status: "pendente", confirmado_em: null, confirmado_por: null, observacao: null, revogado_em: null }],
  testes: [], acoes: [], saude: null, auditorias: [], fidelizacao: [], execucao: [], papeis: {}, nomes: new Map(), ...extra,
});

// Cenário da Paola no D1: D0 detectado (feito automaticamente); baseline NÃO conta como feita (comparecimento e conversão
// sem ponto de partida); estrutura incompleta (sem anúncios, sem etapa compareceu/faltou).
const t = montarTarefas(entrada());
assert.equal(t.length, 35);
const it = (n: number) => t.find((x) => x.n === n)!;
assert.equal(it(1).status, "auto");
assert.equal(it(1).feitoEm, "2026-10-15");
assert.equal(it(8).status, "a_fazer");
assert.equal(it(2).status, "a_fazer");
assert.ok(it(2).subtarefas.find((s) => s.id === "etapas")!.detalhe!.includes("compareceu ou faltou"));
// Acessos viram subtarefas do item 5 (30 itens), não tarefas soltas.
assert.equal(it(5).subtarefas.length, 29);
const c = contarTarefas(t);
assert.equal(c.total, 31);
assert.equal(c.feitos, 1);
assert.equal(c.auto, 1);
// Esta semana = só itens do cronograma, cada um uma vez (sem "Acessos críticos" repetido).
const semana = daSemana(t);
assert.equal(new Set(semana.map((x) => x.n)).size, semana.length);
assert.equal(semana.filter((x) => /Acessos/.test(x.nome)).length, 1);
assert.equal(c.atrasadas + c.hoje + c.semana, semana.length);

// Feito manual e "não se aplica" contam; desfazer volta a fazer.
const t2 = montarTarefas(entrada({ status: [
  { marco: 3, concluido_em: "2026-10-16", evidencia: "https://ata", observacao: null, estado: "manual", atualizado_por: "u1", atualizado_em: null, detectado_em: null, desfeito_em: null, desfeito_motivo: null },
  { marco: 6, concluido_em: "2026-10-16", evidencia: null, observacao: "sem comunidade", estado: "nao_se_aplica", atualizado_por: "u1", atualizado_em: null, detectado_em: null, desfeito_em: null, desfeito_motivo: null },
  { marco: 4, concluido_em: null, evidencia: null, observacao: null, estado: null, atualizado_por: "u1", atualizado_em: null, detectado_em: null, desfeito_em: "2026-10-16T10:00:00Z", desfeito_motivo: "link errado" },
], nomes: new Map([["u1", "Ana"]]) }));
const c2 = contarTarefas(t2);
assert.equal(t2.find((x) => x.n === 3)!.status, "manual");
assert.equal(t2.find((x) => x.n === 3)!.feitoPor, "Ana");
assert.equal(c2.total, 30);
assert.equal(c2.feitos, 2);
assert.equal(t2.find((x) => x.n === 4)!.status, "a_fazer");
assert.equal(t2.find((x) => x.n === 4)!.desfeito!.motivo, "link errado");

// Estrutura completa + todos os pontos de partida → itens 2 e 8 feitos automaticamente.
const t3 = montarTarefas(entrada({
  fontes: { crm: true, whatsapp: true, anuncios: true, marcos: ["agendado", "compareceu"] },
  plano: [
    { kpi: "resposta", baseline: 48, origem: "medido", meta: 24 },
    { kpi: "comparecimento", baseline: 0.6, origem: "estimado", meta: 0.75 },
    { kpi: "conversao", baseline: 0.3, origem: "medido", meta: 0.4 },
  ],
}, { drivePasta: "https://drive", decisor: "Dra.", coordenador: "Ana" }));
assert.equal(t3.find((x) => x.n === 2)!.status, "auto");
assert.equal(t3.find((x) => x.n === 8)!.status, "auto");
const d = deteccoes(t3, entrada());
assert.ok(d.detectados.includes(2) && d.detectados.includes(8));

// Papel: o item é do Gestor de Tráfego; acessos D1/D3 (Analista) também aparecem para o Analista.
assert.ok(ehDoPapel(it(5), "trafego"));
assert.ok(ehDoPapel(it(5), "onboarding"));
assert.equal(papeisSemPessoa({ trafego: { userId: "u", nome: "Lia" } }).length, 8);

// Ordenação por urgência e rótulo.
const ord = [...t].sort(porUrgencia);
assert.ok(["atrasada", "hoje"].includes(ord[0].situacao) || ord[0].situacao === "semana");
assert.equal(rotuloPrazo("2026-10-18", "2026-10-16"), "vence em 2 dias");
assert.equal(rotuloPrazo("2026-10-15", "2026-10-16"), "atrasada há 1 dia");

// Rotina: Score de Saúde (C?) é feito automaticamente na semana em que foi lançado.
const t4 = montarTarefas(entrada({ hoje: "2026-10-30", saude: [{ semana: 3, tarefas_no_prazo: 1, sessoes_marcadas: 1, sessoes_com_decisor: 1, call_grupo: "Sim", decisor_respondeu: "Sim", tempo_resposta_h: 1, kpis_verde: 1, kpis_vermelho: 0, sentimento: "Verde", o_que_aconteceu: null }], execucao: null }));
assert.equal(t4.find((x) => x.n === 31)!.status, "auto");

// Fundador: alerta (não tarefa) com 2 semanas vermelhas.
const vermelha = { tarefas_no_prazo: 0, sessoes_marcadas: 0, sessoes_com_decisor: 0, call_grupo: "Não" as const, decisor_respondeu: "Não" as const, tempo_resposta_h: 48, kpis_verde: 0, kpis_vermelho: 3, sentimento: "Vermelho" as const, o_que_aconteceu: null };
assert.equal(alertasFundador(entrada({ saude: [{ semana: 1, ...vermelha }, { semana: 2, ...vermelha }] })).length, 1);
assert.ok(!t.some((x) => x.papel === "fundador"));

// Rotinas fora da janela (D1: Score de Saúde começa no D7, rotina de tráfego no D29) não aparecem como hoje/atrasadas.
const d1 = montarTarefas(entrada({ saude: [], acoes: [] }));
assert.equal(d1.find((x) => x.n === 31)!.situacao, "depois");
assert.equal(d1.find((x) => x.n === 29)!.situacao, "depois");

console.log("ok sap-tarefas");
