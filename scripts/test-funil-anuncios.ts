import assert from "node:assert/strict";
import { avaliarSeguidor, etapaDaCampanha, inicioDaLegenda, seguidoresEstimados } from "../src/lib/funil-anuncios";
import { diagnosticarAnuncios, type LinhaAds } from "../src/lib/agentes-sugestoes";

// ---- Etapa: etiqueta no nome, objetivo, post impulsionado
const posts = [{ caption: "O laser íntimo é um tratamento que...", funnel_stage: "C2" }, { caption: "A menopausa não é apenas parar de menstruar", funnel_stage: "C1" }];
assert.equal(inicioDaLegenda("Publicação do Instagram: O laser íntimo é um..."), "o laser intimo e um");
assert.equal(etapaDaCampanha("Publicação do Instagram: O laser íntimo é um...", "LINK_CLICKS", posts).etapa, "C2");
assert.equal(etapaDaCampanha("Post do Instagram: A menopausa não é apenas parar...", "LINK_CLICKS", posts).etapa, "C1");
assert.equal(etapaDaCampanha("[ATEC] [TOPO] [VISITA AO IG]", "LINK_CLICKS", []).etapa, "C1");
assert.equal(etapaDaCampanha("[REMARKETING] depoimentos", "LINK_CLICKS", []).etapa, "C3");
assert.equal(etapaDaCampanha("Campanha WhatsApp", "MESSAGES", []).etapa, "C3");
assert.equal(etapaDaCampanha("Campanha qualquer", "LINK_CLICKS", posts).etapa, null);

// ---- Seguidor estimado: rateio dos novos seguidores do dia pelos cliques
const seg = seguidoresEstimados(
  [{ campaign_id: "a", date: "2026-10-10", spend: 50, link_clicks: 300 }, { campaign_id: "b", date: "2026-10-10", spend: 50, link_clicks: 100 }, { campaign_id: "x", date: "2026-10-10", spend: 50, link_clicks: 999 }],
  [{ date: "2026-10-10", novos: 80 }], new Set(["a", "b"]));
assert.equal(seg.get("a"), 60);
assert.equal(seg.get("b"), 20);
assert.equal(seg.has("x"), false, "campanha que não é de perfil não entra no rateio");

// ---- Veredito por seguidor
assert.equal(avaliarSeguidor("C1", 60, 50).veredicto, "manter"); // R$ 1,20
assert.equal(avaliarSeguidor("C1", 40, 50).veredicto, "escalar"); // R$ 0,80
assert.equal(avaliarSeguidor("C1", 100, 50).veredicto, "revisar"); // R$ 2,00
assert.equal(avaliarSeguidor("C1", 200, 50).veredicto, "pausar"); // R$ 4,00
assert.equal(avaliarSeguidor("C2", 150, 50).veredicto, "manter", "C2 aceita seguidor mais caro (R$ 3,00, teto R$ 4,00)");
assert.equal(avaliarSeguidor("C1", 20, 5).veredicto, "pouco_dado");

// ---- Diagnóstico: C1 sem conversa NÃO vira "sem resultado"
const hoje = "2026-10-18";
const dia = (n: number) => new Date(Date.parse(hoje) - n * 86_400_000).toISOString().slice(0, 10);
const linhas: LinhaAds[] = [];
for (let d = 0; d < 7; d++) {
  linhas.push({ campaign_id: "c1", date: dia(d), spend: 40, impressions: 5000, reach: 3000, frequency: 1.5, leads: 0, conversations: 0, link_clicks: 200 });
  linhas.push({ campaign_id: "c3", date: dia(d), spend: 30, impressions: 3000, reach: 2000, frequency: 1.4, leads: 0, conversations: 0, link_clicks: 20 });
}
const semEtapa = diagnosticarAnuncios(linhas, {}, hoje);
assert.ok(semEtapa.some((s) => s.campanha_id === "c1" && s.tipo === "sem_resultado"), "sem a etapa, o erro antigo acontecia");
const comEtapa = diagnosticarAnuncios(linhas, {}, hoje, { etapas: new Map([["c1", "C1"], ["c3", "C3"]]), seguidores7: new Map([["c1", 400]]) });
assert.ok(!comEtapa.some((s) => s.campanha_id === "c1" && s.tipo === "sem_resultado"));
assert.ok(comEtapa.some((s) => s.campanha_id === "c1" && s.tipo === "perfil_escalar"), "R$ 280 / 400 seguidores = R$ 0,70 com volume: pode escalar");
assert.ok(comEtapa.some((s) => s.campanha_id === "c3" && s.tipo === "sem_resultado" && s.etapa === "C3"));
const caro = diagnosticarAnuncios(linhas, {}, hoje, { etapas: new Map([["c1", "C1"]]), seguidores7: new Map([["c1", 60]]) });
assert.equal(caro.find((s) => s.campanha_id === "c1")?.tipo, "seguidor_caro");
console.log("funil-anuncios: ok");
