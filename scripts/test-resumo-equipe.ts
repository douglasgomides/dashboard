import assert from "node:assert/strict";
import { coletarPendencias, ehClinicaTeste, montarResumoEquipe, type PendenciasClinica } from "../src/lib/resumo-equipe";

const base = (id: string, nome: string, x: Partial<PendenciasClinica> = {}): PendenciasClinica => ({ client_id: id, nome, recuperacao: 0, anuncios: 0, conteudo: 0, campanhas: 0, brain: 0, aprovacoes: 0, falhas: 0, agendaram: 0, ...x });
const r = montarResumoEquipe([
  base("a", "Dra. A", { recuperacao: 12, conteudo: 6 }),
  base("b", "Dr. <B>", { falhas: 1, anuncios: 1 }),
  base("c", "Dra. C"),
  base("d", "Dra. D", { agendaram: 3 }),
], "https://dash.exemplo", "18/10/2026");
assert.equal(r.total, 20);
assert.equal(r.assunto, "Agentes: 13 prioridades para hoje (18/10/2026)");
assert.ok(r.texto.includes("1 falha de agente, 1 ajuste de anúncio"), "singular");
assert.ok(r.texto.includes("12 pacientes para recuperar, 6 roteiros prontos"));
assert.ok(r.texto.indexOf("Dr. <B>") < r.texto.indexOf("Dra. A"), "falha vem primeiro");
assert.ok(!r.texto.includes("Dra. C"), "clínica sem nada não entra");
assert.ok(r.texto.includes("3 pacientes recuperados"));
assert.ok(r.html.includes("Dr. &lt;B&gt;") && !r.html.includes("<B>"), "HTML escapado");
assert.equal(montarResumoEquipe([base("e", "Dra. E", { conteudo: 2 })], "x", "1/1").assunto, "Agentes: nada urgente, 2 itens para revisar (1/1)");
assert.equal(montarResumoEquipe([base("c", "Dra. C")], "x", "1/1").total, 0);

assert.ok(ehClinicaTeste("CLÍNICA TESTE SAP V2 (teste, dados fictícios)"));
assert.ok(!ehClinicaTeste("Dra. Lana Torres") && !ehClinicaTeste("Dr. Testoni"));

// Coleta: clínica de teste fora; falha só conta se a última rodada do fluxo falhou.
const tabelas: Record<string, unknown[]> = {
  clients: [{ id: "a", name: "Dra. A" }, { id: "t", name: "Clínica Teste" }],
  sugestoes_agentes: [{ client_id: "a", agente: "recuperacao" }, { client_id: "t", agente: "recuperacao" }],
  campanhas_ideias: [], brain_itens: [{ client_id: "a" }], aprovacoes: [],
  agente_execucoes: [
    { client_id: "a", fluxo: "brain_carga", estado: "concluida" }, { client_id: "a", fluxo: "brain_carga", estado: "falhou" },
    { client_id: "a", fluxo: "gestor_anuncios", estado: "falhou" },
  ],
};
const q = (t: string) => { const o: any = { data: t === "sugestoes_agentes" && fim.agendou ? [] : tabelas[t], error: null }; const enc = () => o; for (const m of ["select", "eq", "gte", "order", "limit"]) o[m] = (...a: unknown[]) => { if (m === "eq" && a[0] === "resultado") { o.data = []; } return o; }; return enc(); };
const fim = { agendou: false };
const p = await coletarPendencias({ from: q });
assert.deepEqual(p.map((x) => x.client_id), ["a"]);
assert.equal(p[0].falhas, 1, "só a falha do gestor (o brain rodou bem depois)");
assert.equal(p[0].recuperacao, 1);
assert.equal(p[0].brain, 1);
console.log("ok");
