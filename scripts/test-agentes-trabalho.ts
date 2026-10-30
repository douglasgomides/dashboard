import assert from "node:assert/strict";
import { agenteSelecionado, rodadaEmCurso, saudeRotina, situacaoRodada, TRABALHOS_AGENTE, type RodadaAgente } from "../src/lib/agentes-trabalho";
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
// Rotina parada ou com falha não aparece como "prevista" para ninguém.
const agora = Date.parse("2026-10-30T12:00:00Z");
const diario = AGENTES.find((x) => x.id === "anuncios")!, recup = AGENTES.find((x) => x.id === "recuperacao")!;
const saude = (ok: string | null, estado = "concluida", ultima = ok) => ({ fluxo: "f", ultima_ok_em: ok, ultima_em: ultima, ultimo_estado: estado });
assert.equal(saudeRotina(diario, saude("2026-10-30T06:00:00Z"), 0, agora).estado, "em_dia");
const atrasada = saudeRotina(diario, saude("2026-10-20T06:00:00Z"), 0, agora);
assert.equal(atrasada.estado, "atrasada");
assert.match(atrasada.texto, /há 10 dias/);
assert.equal(saudeRotina(diario, saude("2026-10-29T06:00:00Z", "falhou", "2026-10-30T06:00:00Z"), 0, agora).estado, "falha");
assert.equal(saudeRotina(recup, saude("2026-10-21T06:00:00Z"), 30, agora).estado, "fila_cheia");
assert.equal(saudeRotina(diario, null, 0, agora).estado, "sem_execucao");
assert.equal(saudeRotina(diario, saude(null, "falhou", "2026-10-25T06:00:00Z"), 0, agora).estado, "falha");
for (const r of [atrasada, saudeRotina(diario, null, 0, agora)]) { assert.equal(r.atencao, true); assert.doesNotMatch(r.texto, /—/); }
console.log("Agent work descriptions, role/product boundaries and truthful execution states verified.");
