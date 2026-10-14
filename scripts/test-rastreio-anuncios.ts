import assert from "node:assert/strict";
import { avaliarRastreio, nomeObjetivo, objetivoNaoContaConversa } from "../src/lib/rastreio-anuncios";

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
console.log("test-rastreio-anuncios: ok");
