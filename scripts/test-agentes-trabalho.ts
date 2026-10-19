import assert from "node:assert/strict";
import { agenteSelecionado, rodadaEmCurso, situacaoRodada, TRABALHOS_AGENTE, type RodadaAgente } from "../src/lib/agentes-trabalho";
import { AGENTES } from "../src/lib/agentes-catalogo";

for (const a of AGENTES) {
  const t = TRABALHOS_AGENTE[a.id];
  for (const s of [t.problema, t.ajuda, t.entrega, t.pessoa, t.medir, t.limite, t.acao]) assert.ok(s.length > 15);
}
assert.equal(agenteSelecionado("brain", "hub", false), "conteudo");
assert.equal(agenteSelecionado("brain", "hub", true), "brain");
assert.equal(agenteSelecionado("recuperacao", "sap", true), "conteudo");
assert.equal(agenteSelecionado("brain", "sap", true), "conteudo");
assert.equal(agenteSelecionado("constructor", "hub", true), "conteudo");
assert.equal(agenteSelecionado(undefined, "hub", true), "conteudo");
const rodada = (estado: RodadaAgente["estado"], resultado: RodadaAgente["resultado"] = null): RodadaAgente => ({ id: "qa", estado, criado_em: "2026-10-19T10:00:00Z", atualizado_em: "2026-10-19T10:01:00Z", resultado });
assert.match(situacaoRodada(rodada("concluida", { pecas: 0, motivo: "Pouco dado ainda." }), true).titulo, /sem novas entregas/);
assert.equal(situacaoRodada(rodada("concluida", { pecas: 0, motivo: "Pouco dado ainda." }), true).detalhe, "Pouco dado ainda.");
assert.match(situacaoRodada(rodada("concluida", { pecas: 3 }), true).detalhe, /3 entregas registradas/);
assert.equal(situacaoRodada(rodada("falhou"), true).tom, "atencao");
assert.doesNotMatch(situacaoRodada(null, false).titulo, /sem execução/i);
assert.doesNotMatch(situacaoRodada(rodada("falhou"), false).detalhe, /falhou/i);
for (const e of ["pendente", "rodando", "aguardando", "aguardando_aprovacao", "pausada"] as const) assert.equal(rodadaEmCurso(rodada(e)), true);
for (const e of ["concluida", "falhou", "cancelada"] as const) assert.equal(rodadaEmCurso(rodada(e)), false);
assert.equal(rodadaEmCurso(null), false);
assert.equal(typeof situacaoRodada(rodada("concluida", { motivo: {} as string, pecas: Infinity }), true).detalhe, "string");
console.log("Agent work descriptions, role/product boundaries and truthful execution states verified.");
