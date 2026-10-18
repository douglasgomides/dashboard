import assert from "node:assert/strict";
import { gatilhoPendente, gatilhosRecentes, respostaHumana, resumoPiloto, riscoDaMensagem, validarFatos, validarRascunho, duracao, type Msg } from "../src/lib/atendente";

const m = (id: string, direcao: string, texto: string, min: number, tipo = "text"): Msg => ({ id, direcao, texto, tipo, enviada_em: new Date(Date.parse("2026-10-18T12:00:00Z") + min * 60_000).toISOString() });

// ---- Gatilho: o bloco de entrada depois da última saída
const conv = [m("1", "entrada", "Oi, boa tarde", 0), m("2", "entrada", "Vocês atendem convênio?", 1), m("3", "saida", "Boa tarde! Atendemos só particular.", 30), m("4", "entrada", "E qual o endereço?", 40)];
const g = gatilhoPendente(conv);
assert.equal(g?.mensagem_id, "4");
assert.equal(g?.texto, "E qual o endereço?");
assert.equal(gatilhoPendente(conv.slice(0, 3)), null, "clínica já respondeu: sem gatilho");
assert.equal(gatilhoPendente([m("x", "entrada", "", 0, "audio")])?.texto, "[audio]");

// ---- Todos os turnos recentes, cada um com o histórico anterior (sem ver a resposta da secretária)
const gs = gatilhosRecentes(conv, "2026-10-18T11:00:00Z");
assert.deepEqual(gs.map((x) => x.mensagem_id), ["2", "4"]);
assert.equal(gs[0].texto, "Oi, boa tarde\nVocês atendem convênio?");
assert.ok(!gs[0].antes.some((x) => x.direcao === "saida"), "o 1º turno não pode ver a resposta da secretária");
assert.deepEqual(gatilhosRecentes(conv, "2026-10-18T12:35:00Z").map((x) => x.mensagem_id), ["4"]);

// ---- Resposta humana e tempo
const h = respostaHumana(conv, gs[0].em);
assert.equal(h?.segundos, 29 * 60);
assert.equal(respostaHumana(conv, g!.em), null);

// ---- Risco vai para uma pessoa
assert.equal(riscoDaMensagem("Estou com falta de ar depois da aplicação"), "urgencia");
assert.equal(riscoDaMensagem("É normal ficar inchado depois do procedimento?"), "clinico");
assert.equal(riscoDaMensagem("Que absurdo, ninguém me respondeu, vou no Reclame Aqui"), "reclamacao");
assert.equal(riscoDaMensagem("Qual o horário de vocês?"), null);

// ---- Validação do rascunho
const fatos = { atend_horario: "Segunda a sexta, das 8h às 18h", atend_valores: "Consulta particular R$ 450,00" };
const ok = validarRascunho({ acao: "responder", mensagem: "Oi! Atendemos de segunda a sexta, das 8h às 18h. Prefere manhã ou tarde?", motivo: "horário", fatos: ["atend_horario", "inventada"], faltou: [] }, fatos);
assert.ok(ok.ok, ok.erro ?? "");
assert.deepEqual(ok.ok!.fatos, ["atend_horario"]);
assert.ok(validarRascunho({ acao: "responder", mensagem: "A consulta é R$ 450,00. Quer que eu veja um horário?", fatos: [] }, fatos).ok, "valor aprovado passa");
assert.match(validarRascunho({ acao: "responder", mensagem: "A consulta sai por R$ 300. Quer agendar?" }, fatos).erro!, /valor fora/);
assert.match(validarRascunho({ acao: "responder", mensagem: "Tenho um horário amanhã às 14h, pode ser?" }, fatos).erro!, /data ou horário/);
assert.match(validarRascunho({ acao: "responder", mensagem: "Pode ficar tranquila, sua consulta está confirmada." }, fatos).erro!, /agenda/);
assert.match(validarRascunho({ acao: "responder", mensagem: "Parece ser alergia, recomendo usar um antialérgico." }, fatos).erro!, /diagnóstico/);
assert.match(validarRascunho({ acao: "responder", mensagem: "Neste mês temos 20% de desconto na avaliação!" }, fatos).erro!, /CFM/);
assert.match(validarRascunho({ acao: "talvez", mensagem: "Olá, tudo bem com você?" }, fatos).erro!, /ação/);
assert.ok(validarRascunho({ acao: "passar_humano", mensagem: "Se for urgência, ligue 192. Já avisei a equipe." }, {}).ok, "192 não é dado pessoal");

// ---- Fatos extraídos das respostas da secretária
const fx = validarFatos({ fatos: [
  { chave: "atend_horario", valor: "Segunda a sexta, 8h às 18h", vezes: 6 },
  { chave: "atend_endereco", valor: "Rua X, 100. Ligue (67) 99999-8888", vezes: 3 },
  { chave: "atend_pagamento", valor: "Pix, cartão e dinheiro", vezes: 1 },
  { chave: "outra_coisa", valor: "Qualquer coisa aqui", vezes: 9 },
  { chave: "atend_horario", valor: "duplicado", vezes: 9 },
] });
assert.deepEqual(fx.map((f) => f.chave), ["atend_horario"]);

// ---- Resumo do piloto
const r = resumoPiloto([
  { acao: "responder", tempo_humano_s: 60, resposta_humana: "x", faltou: ["Endereço"], avaliacao: "boa", risco: null },
  { acao: "responder", tempo_humano_s: 3600, resposta_humana: "x", faltou: ["endereço"], avaliacao: null, risco: null },
  { acao: "passar_humano", tempo_humano_s: null, resposta_humana: null, faltou: [], avaliacao: "ruim", risco: "clinico" },
]);
assert.equal(r.responderia, 2);
assert.equal(r.demorou15, 1);
assert.equal(r.semResposta, 1);
assert.deepEqual(r.faltou[0], ["endereco", 2]);
assert.equal(duracao(90), "2 min");
assert.equal(duracao(null), "sem resposta");

console.log("atendente: ok");
