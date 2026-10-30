import assert from "node:assert/strict";
import { avaliarRastreio, cliqueLevaAoPerfil, nomeObjetivo, objetivoNaoContaConversa, separarCliques } from "../src/lib/rastreio-anuncios";
import { aplicarRastreio, diagnosticarAds, type CampanhaCadastro, type LinhaAds } from "../src/lib/anuncios-objetivo";

// Caso Dr. Sergio Maia: 9.558 cliques, 2 conversas, 915 atendimentos no WhatsApp.
const sergio = avaliarRastreio({ cliquesLink: 9558, conversas: 2, atendimentosWhatsapp: 915 });
assert.equal(sergio.suspeito, true);
assert.deepEqual(sergio.motivos, ["poucas_conversas_por_clique", "whatsapp_muito_maior"]);
assert.match(sergio.mensagem!, /^Provável problema de rastreio: 9\.558 cliques e só 2 conversas atribuídas, enquanto o WhatsApp recebeu 915 atendimentos\./);
assert.match(sergio.mensagem!, /objetivo de mensagens/);

// Só a regra dos cliques (sem WhatsApp ligado).
assert.equal(avaliarRastreio({ cliquesLink: 201, conversas: 2 }).suspeito, true); // 0,99%
assert.equal(avaliarRastreio({ cliquesLink: 201, conversas: 3 }).suspeito, false); // 1,5%
assert.equal(avaliarRastreio({ cliquesLink: 200, conversas: 0 }).suspeito, false); // precisa de MAIS de 200 cliques
// Só a regra do WhatsApp.
assert.equal(avaliarRastreio({ cliquesLink: 50, conversas: 10, atendimentosWhatsapp: 101 }).suspeito, true);
assert.equal(avaliarRastreio({ cliquesLink: 50, conversas: 10, atendimentosWhatsapp: 100 }).suspeito, false); // 10x exato não passa
assert.equal(avaliarRastreio({ cliquesLink: 50, conversas: 0, atendimentosWhatsapp: 3 }).suspeito, false); // WhatsApp pequeno demais
// Rastreio bom.
const bom = avaliarRastreio({ cliquesLink: 1000, conversas: 120, atendimentosWhatsapp: 300 });
assert.equal(bom.suspeito, false);
assert.equal(bom.mensagem, null);

assert.equal(nomeObjetivo("LINK_CLICKS"), "Tráfego");
assert.equal(nomeObjetivo("MESSAGES"), "Mensagens");
assert.equal(nomeObjetivo("OUTCOME_SALES"), "Conversão (vendas)");
assert.equal(objetivoNaoContaConversa("OUTCOME_TRAFFIC"), true);
assert.equal(objetivoNaoContaConversa("MESSAGES"), false);
// Visita ao perfil não é clique para conversar (auditoria de 30/10/2026).
assert.equal(cliqueLevaAoPerfil({ destinos: ["INSTAGRAM_PROFILE"], otimizacoes: ["VISIT_INSTAGRAM_PROFILE"] }), true);
assert.equal(cliqueLevaAoPerfil({ destinos: ["instagram profile"] }), true, "destino com espaço e minúscula");
assert.equal(cliqueLevaAoPerfil({ destinos: ["INSTAGRAM_PROFILE", "WHATSAPP"] }), false, "parte vai para o WhatsApp: conta");
assert.equal(cliqueLevaAoPerfil({ destinos: ["WEBSITE"] }), false);
assert.equal(cliqueLevaAoPerfil({ destinos: null, otimizacoes: ["VISIT_INSTAGRAM_PROFILE"] }), true, "sem destino, pela otimização");
assert.equal(cliqueLevaAoPerfil({ destinos: [], otimizacoes: ["LINK_CLICKS"] }), false);
assert.equal(cliqueLevaAoPerfil({}), false, "sem destino nem otimização: não dá para saber, conta");
assert.equal(cliqueLevaAoPerfil(null), false);
assert.deepEqual(
  separarCliques(
    [{ campaign_id: "p", link_clicks: 900 }, { campaign_id: "w", link_clicks: "40" }, { campaign_id: "x", link_clicks: 10 }],
    [{ campaign_id: "p", destinos: ["INSTAGRAM_PROFILE"] }, { campaign_id: "w", destinos: ["WHATSAPP"] }],
  ),
  { paraFora: 50, paraPerfil: 900 },
);
// Dra. Marcella: 9.473 cliques, todos para o perfil, 14 conversas e 910 atendimentos no WhatsApp: sem alarme.
assert.equal(avaliarRastreio({ cliquesLink: 0, cliquesPerfil: 9473, conversas: 14, atendimentosWhatsapp: 910 }).suspeito, false);
// Doctor Creator: 26.338 cliques, 25.644 para o perfil, 42 conversas: 42 / 694 = 6%, sem alarme.
assert.equal(avaliarRastreio({ cliquesLink: 694, cliquesPerfil: 25644, conversas: 42 }).suspeito, false);
// Ainda dispara com clique para fora suficiente; a mensagem diz que as visitas ao perfil ficaram de fora.
const misto = avaliarRastreio({ cliquesLink: 5000, cliquesPerfil: 1000, conversas: 3 });
assert.equal(misto.suspeito, true);
assert.match(misto.mensagem!, /5\.000 cliques para WhatsApp ou site \(as 1\.000 visitas ao perfil ficam de fora\)/);

// No diagnóstico inteiro: a campanha que leva ao perfil não aciona o alarme nem zera o custo por conversa.
const dias = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
const linhas: LinhaAds[] = dias.flatMap((date) => [
  { date, campaign_id: "perfil", spend: 100, impressions: 20000, link_clicks: 2500, conversations: 1, leads: 0, landing_page_views: 0 },
  { date, campaign_id: "msg", spend: 50, impressions: 5000, link_clicks: 10, conversations: 4, leads: 0, landing_page_views: 0 },
]);
const cadastro: CampanhaCadastro[] = [
  { campaign_id: "perfil", name: "Perfil", objective: "LINK_CLICKS", destinos: ["INSTAGRAM_PROFILE"], otimizacoes: ["VISIT_INSTAGRAM_PROFILE"] },
  { campaign_id: "msg", name: "Mensagem", objective: "MESSAGES", destinos: ["WHATSAPP"] },
];
const d = aplicarRastreio(diagnosticarAds(linhas, cadastro, "2026-10-01", "2026-10-10"), 30);
assert.equal(d.cliquesLink, 25100);
assert.equal(d.cliquesPerfil, 25000);
assert.equal(d.rastreio?.suspeito, false, "50 conversas em 100 cliques para fora: rastreio confiável");
assert.ok(d.custoPorConversaMensagem != null);
assert.equal(d.campanhas.find((c) => c.campaign_id === "perfil")?.cliquePerfil, true);
// Sem o destino no cadastro (banco antigo), vale a regra de antes: 50 conversas em 25.100 cliques é suspeito.
const semDestino = aplicarRastreio(diagnosticarAds(linhas, cadastro.map(({ destinos, otimizacoes, ...c }) => c), "2026-10-01", "2026-10-10"), null);
assert.equal(semDestino.rastreio?.suspeito, true);
console.log("test-rastreio-anuncios: ok");
