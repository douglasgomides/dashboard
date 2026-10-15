import assert from "node:assert/strict";
import { cronogramaComDatas, somar } from "../src/lib/sap-cronograma";
import { contarPorSituacao, papelDoDono, rotuloPrazo, segundaDe, tarefasDaSemana, type EntradaSemana } from "../src/lib/sap-semana";

assert.equal(papelDoDono("Gestor de Tráfego"), "trafego");
assert.equal(papelDoDono("CS e Relacionamento"), "cs");
assert.equal(papelDoDono("Clínica"), "clinica");
assert.equal(papelDoDono("Fundador"), "coordenacao");
assert.equal(segundaDe("2026-10-15"), "2026-10-12"); // quinta → segunda
assert.equal(segundaDe("2026-10-18"), "2026-10-12"); // domingo → segunda anterior

const base = (hoje: string, d0: string, extra: Partial<EntradaSemana> = {}): EntradaSemana => {
  const dia = Math.round((Date.parse(hoje) - Date.parse(d0)) / 86_400_000);
  return {
    hoje, d0, pausas: [], dia, cronograma: cronogramaComDatas(d0, [], hoje), acessos: [], rastreamento: null, acoes: [],
    saudeLancada: true, auditoriaLancada: true, fidelizacaoLancada: true, execucaoVencidosSemStatus: 0, ...extra,
  };
};

// D2: kickoff (D1–D3) e formulário estão na janela; acessos críticos (até D7) aparecem agrupados; nada do D40.
let t = tarefasDaSemana(base("2026-10-03", "2026-10-01"));
assert.ok(t.some((x) => x.id === "crono-3"));
assert.ok(!t.some((x) => x.id === "crono-24"));
assert.ok(t.some((x) => x.id === "acessos-trafego"));
assert.ok(t.every((x) => x.prazo <= somar("2026-10-03", 7)));

// D12 sem nada concluído: o kickoff (fim D3) aparece atrasado e vem antes.
t = tarefasDaSemana(base("2026-10-13", "2026-10-01"));
assert.equal(t[0].situacao, "atrasado");
assert.ok(t.find((x) => x.id === "crono-3")?.situacao === "atrasado");

// Rastreamento: a partir do D16 sem liberação, tarefa do tráfego com prazo no D27.
t = tarefasDaSemana(base("2026-10-21", "2026-10-01", { rastreamento: { obrigatorios: { aprovados: 3, total: 15 }, reprovados: [], faltam: [1, 2], liberado: false, aguardandoConferencia: false, recheckVencido: false } }));
const r = t.find((x) => x.id === "rastreio-testes");
assert.ok(r && r.papeis.includes("trafego") && r.prazo === "2026-10-28");
t = tarefasDaSemana(base("2026-10-21", "2026-10-01", { rastreamento: { obrigatorios: { aprovados: 15, total: 15 }, reprovados: [], faltam: [], liberado: false, aguardandoConferencia: true, recheckVencido: false } }));
assert.ok(t.some((x) => x.id === "rastreio-conferir"));

// Rotina semanal: auditoria só do D29 em diante; saúde a partir do D7; prazo na sexta.
t = tarefasDaSemana(base("2026-10-13", "2026-10-01", { saudeLancada: false, auditoriaLancada: false }));
assert.ok(t.some((x) => x.id === "rotina-saude" && x.prazo === "2026-10-16"));
assert.ok(!t.some((x) => x.id === "rotina-auditoria"));
t = tarefasDaSemana(base("2026-11-03", "2026-10-01", { auditoriaLancada: false, saudeLancada: null }));
assert.ok(t.some((x) => x.id === "rotina-auditoria" && x.papeis[0] === "cs"));
assert.ok(!t.some((x) => x.id === "rotina-saude")); // sem acesso ao dado, não gera tarefa

// Ações: aberta da clínica com prazo; aberta antiga sem prazo vira atrasada; feita some.
t = tarefasDaSemana(base("2026-11-03", "2026-10-01", { acoes: [
  { id: "a", texto: "Responder leads em 5 min", lado: "clinica", responsavel: "Recepção", prazo: "2026-11-05", semana: "2026-11-02", status: "aberta" },
  { id: "b", texto: "Trocar criativo", lado: "dc", responsavel: "Gestor de Tráfego", prazo: null, semana: "2026-10-19", status: "aberta" },
  { id: "c", texto: "Feita", lado: "dc", responsavel: null, prazo: "2026-11-04", semana: "2026-11-02", status: "feita" },
] }));
assert.ok(t.find((x) => x.id === "acao-a")?.papeis[0] === "clinica");
assert.equal(t.find((x) => x.id === "acao-b")?.situacao, "atrasado");
assert.ok(!t.some((x) => x.id === "acao-c"));

const c = contarPorSituacao(t);
assert.equal(c.atrasado + c.hoje + c.semana, t.length);
assert.equal(rotuloPrazo("2026-11-01", "2026-11-03"), "atrasado há 2 dias");
assert.equal(rotuloPrazo("2026-11-03", "2026-11-03"), "vence hoje");
assert.equal(rotuloPrazo("2026-11-04", "2026-11-03"), "vence em 1 dia");
console.log("ok sap-semana");
