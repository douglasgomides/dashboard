import assert from "node:assert/strict";
import { algumCardComTag, linhaDoCardFlw, origemDaDescricao, origemDasTags, tagsDoCard, tipoDasTags, type CtxCardFlw } from "../api/_lib/flwchat-sync";

assert.equal(origemDaDescricao("Origem: Instagram"), "Instagram");
assert.equal(origemDaDescricao("origem organica, quer agendar"), "Orgânico");
assert.equal(origemDaDescricao("Orgânico"), "Orgânico");
assert.equal(origemDaDescricao("Veio pelo CONTEÚDO do reels"), "Conteúdo");
assert.equal(origemDaDescricao("Indicação. Esposo de paciente"), "Indicação");
assert.equal(origemDaDescricao("Instagram e indicação"), null);
assert.equal(origemDaDescricao("Implanon por convenio"), null);
assert.equal(origemDaDescricao("instagramer"), null);
assert.equal(origemDaDescricao(""), null);
assert.equal(origemDaDescricao(undefined), null);
assert.equal(origemDaDescricao(42), null);

// Tags do contato no WTS (Dr. Sergio Maia): "Origem · X" e "Tipo · X".
assert.equal(origemDasTags(["Tipo · Paciente", "Origem · Instagram"]), "Instagram");
assert.equal(origemDasTags(["Origem · Indicação", "Origem · Indicação"]), "Indicação", "a mesma tag duas vezes conta como uma");
assert.equal(origemDasTags(["Origem · Instagram", "Origem · Anúncio"]), null, "duas origens: não adivinha");
assert.equal(origemDasTags(["Origem · Não identificada"]), null, "não identificada fica vazia");
assert.equal(origemDasTags(["Oportunidade", "Remarketing"]), null);
assert.equal(origemDasTags([]), null);
assert.equal(tipoDasTags(["Tipo · Fornecedor ou representante", "Oportunidade"]), "Fornecedor ou representante");
assert.equal(tipoDasTags(["Tipo · Paciente", "Tipo · Lead novo"]), null, "dois tipos: não escolhe");

// Etiquetas do card (tagIds), traduzidas pelo mesmo mapa de /core/v1/tag. Dados inventados.
const nomesTags = new Map([["a", "Origem · Indicação"], ["b", "VIP"], ["c", "Origem · Anúncio"]]);
assert.deepEqual(tagsDoCard({ tagIds: ["a", "b", "z"] }, nomesTags), ["Origem · Indicação", "VIP"], "id desconhecido fica de fora");
assert.deepEqual(tagsDoCard({ tagIds: null }, nomesTags), []);
assert.deepEqual(tagsDoCard({}, nomesTags), []);
assert.deepEqual(tagsDoCard({ tagIds: ["a"] }, null), [], "sem mapa, sem nomes");
assert.equal(algumCardComTag([{ tagIds: [] }, {}, { tagIds: null }]), false);
assert.equal(algumCardComTag([{}, { tagIds: ["x"] }]), true);

const ctx = (extra: Partial<CtxCardFlw> = {}): CtxCardFlw => ({
  connectionId: "conn-1", clientId: "cli-1", panelId: "painel-1", outcome: "open",
  tagsContato: [], nomesTags, agora: "2026-01-02T00:00:00Z", ...extra,
});
const card = { id: "card-1", title: "Paciente Teste", stepId: "e1", createdAt: "2026-01-01T10:00:00Z", contactIds: ["k1"] };

// Card com "Origem · X": origem X e card_tags no payload.
const comTag = linhaDoCardFlw({ ...card, tagIds: ["a", "b", "z"] }, ctx());
assert.equal(comTag.source, "Indicação");
assert.deepEqual((comTag.raw_payload as Record<string, unknown>).card_tags, ["Origem · Indicação", "VIP"]);

// Card "Origem · A" e contato "Origem · B": vale o card.
const conflito = linhaDoCardFlw({ ...card, tagIds: ["c"] }, ctx({ tagsContato: ["Origem · Instagram"] }));
assert.equal(conflito.source, "Anúncio");
// Etiqueta do card que não é de origem não vira origem; a do contato continua valendo.
const soContato = linhaDoCardFlw({ ...card, tagIds: ["b"] }, ctx({ tagsContato: ["Origem · Instagram"] }));
assert.equal(soContato.source, "Instagram");
assert.equal(linhaDoCardFlw({ ...card, tagIds: ["b"] }, ctx()).source, null, "VIP não é origem");

// Card sem tagIds: a linha de antes, campo por campo.
const semTag = linhaDoCardFlw({ ...card, monetaryAmount: 0, description: "Indicação de amiga" }, ctx({ outcome: "won", tagsContato: ["Tipo · Paciente"] }));
assert.deepEqual(semTag, {
  crm_connection_id: "conn-1",
  client_id: "cli-1",
  provider: "flwchat",
  external_lead_id: "card-1",
  event_type: "sync",
  status_id: "e1",
  pipeline_id: "painel-1",
  price: null,
  occurred_at: "2026-01-01T10:00:00Z",
  outcome: "won",
  source: "Indicação",
  contact_name: "Paciente Teste",
  raw_payload: { ...card, monetaryAmount: 0, description: "Indicação de amiga", contato_tags: ["Tipo · Paciente"], contato_tipo: "Paciente" },
  received_at: "2026-01-01T10:00:00Z",
});
assert.equal("card_tags" in (semTag.raw_payload as Record<string, unknown>), false);
// Sem mapa de nomes (nenhum card com etiqueta na conexão), igual a hoje.
assert.deepEqual(linhaDoCardFlw({ ...card }, ctx({ nomesTags: null })), linhaDoCardFlw({ ...card }, ctx()));

console.log("flwchat origem ok");
