import assert from "node:assert/strict";
import { montarResumoEquipe, type PendenciasClinica } from "../src/lib/resumo-equipe";

const base = (id: string, nome: string, x: Partial<PendenciasClinica> = {}): PendenciasClinica => ({ client_id: id, nome, recuperacao: 0, anuncios: 0, conteudo: 0, campanhas: 0, brain: 0, aprovacoes: 0, falhas: 0, agendaram: 0, ...x });
const r = montarResumoEquipe([
  base("a", "Dra. A", { recuperacao: 12, conteudo: 6 }),
  base("b", "Dr. <B>", { falhas: 1 }),
  base("c", "Dra. C"),
  base("d", "Dra. D", { agendaram: 3 }),
], "https://dash.exemplo", "18/10/2026");
assert.equal(r.total, 19);
assert.ok(r.assunto.includes("19 itens"));
assert.ok(r.texto.indexOf("Dr. <B>") < r.texto.indexOf("Dra. A"), "falha vem primeiro");
assert.ok(!r.texto.includes("Dra. C"), "clínica sem nada não entra");
assert.ok(r.texto.includes("3 pacientes recuperados"));
assert.ok(r.html.includes("Dr. &lt;B&gt;") && !r.html.includes("<B>"), "HTML escapado");
assert.ok(r.html.includes("https://dash.exemplo/a/agentes"));
assert.equal(montarResumoEquipe([base("c", "Dra. C")], "x", "1/1").total, 0);
console.log("ok");
