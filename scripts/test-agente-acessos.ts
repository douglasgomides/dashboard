import assert from "node:assert/strict";
import { evidenciaCriticos, mensagemPadrao, mensagemValida, situacaoCriticos } from "../src/lib/agente-acessos";
import { ITENS_ACESSO, type RegistroAcesso } from "../src/lib/sap-acessos";

const criticos = ITENS_ACESSO.filter((i) => i.prazo === "C");
const reg = (item: string, status: RegistroAcesso["status"], extra: Partial<RegistroAcesso> = {}): RegistroAcesso => ({ item, status, confirmado_em: "2026-10-16", confirmado_por: "Ana", observacao: null, revogado_em: null, ...extra });

// Nada registrado: todos os críticos pendentes.
let s = situacaoCriticos([]);
assert.equal(s.pendentes.length, criticos.length);
assert.equal(s.resolvidos.length, 0);

// Confirmado e "não se aplica" resolvem; revogado volta a pendente; item não crítico não conta.
s = situacaoCriticos([reg("A1", "confirmado"), reg("A5", "nao_se_aplica"), reg("A2", "confirmado", { revogado_em: "2026-10-17" })]);
assert.ok(s.resolvidos.some((r) => r.id === "A1") && s.resolvidos.some((r) => r.id === "A5" && r.status === "nao_se_aplica"));
assert.ok(s.pendentes.some((p) => p.id === "A2"));
assert.equal(s.pendentes.length + s.resolvidos.length, criticos.length);

// Todos resolvidos: evidência cita a contagem e quem confirmou.
s = situacaoCriticos(criticos.map((c) => reg(c.id, "confirmado")));
assert.equal(s.pendentes.length, 0);
const ev = evidenciaCriticos(s.resolvidos);
assert.ok(ev.includes(`${criticos.length} acessos críticos`) && ev.includes("por Ana"));

// Mensagem padrão lista só o que falta; validação recusa mensagem que esquece item ou traz telefone.
const pend = situacaoCriticos([]).pendentes.slice(0, 3);
const m = mensagemPadrao("Clínica X", pend);
assert.ok(pend.every((p) => m.includes(p.nome)));
assert.ok(mensagemValida(m, pend));
assert.equal(mensagemValida("Olá, faltam acessos. Obrigado pela ajuda de sempre!", pend), false);
assert.equal(mensagemValida(m + "\nLigue (84) 99999-1234", pend), false);
assert.equal(mensagemValida(42, pend), false);

console.log("ok agente-acessos");
