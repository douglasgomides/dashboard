import assert from "node:assert/strict";
import { diagnosticarAnuncios, escolherRecuperaveis, pecaParaTexto, validarAnuncios, validarConteudo, validarRecuperacao, type LinhaAds } from "../src/lib/agentes-sugestoes";

// ---- Recuperação: quem entra na lista
const agora = Date.parse("2026-10-18T12:00:00Z");
const h = (dias: number) => new Date(agora - dias * 86_400_000).toISOString();
const base = (id: string, dias: number, resumo: Record<string, unknown>, ate?: string) => ({ conversa_id: id, ultima_msg_em: h(dias), ate_msg_em: ate ?? h(dias), resumo });
const cands = escolherRecuperaveis([
  base("a", 3, { recuperavel: true }),
  base("b", 2, { recuperavel: true, preco_pedido: true }),
  base("c", 5, { situacao: "aguardando_clinica" }),
  base("d", 2, { recuperavel: true, etapa: "agendou" }),
  base("e", 0.2, { recuperavel: true }),
  base("f", 30, { recuperavel: true }),
  base("g", 2, { recuperavel: false }),
  base("h", 2, { recuperavel: true, comercial: false }),
  base("i", 2, { recuperavel: true }, h(4)),
  base("j", 2, { recuperavel: true }),
], new Set(["j"]), agora);
assert.deepEqual(cands.map((c) => c.conversa_id), ["c", "b", "a"]);
assert.equal(cands[0].motivo, "aguardando_clinica");

const rec = validarRecuperacao({ mensagens: [
  { conversa_id: "a", mensagem: "Oi, [nome]! Vi que você perguntou sobre a avaliação e ficou sem retorno. Posso te ajudar a escolher um horário?", por_que: "pediu horário" },
  { conversa_id: "b", mensagem: "Oi, [nome]! Temos 20% de desconto para você fechar ainda esta semana com a doutora." },
  { conversa_id: "c", mensagem: "Oi, [nome]! Me liga no (11) 98888-7777 para combinarmos a sua consulta com calma." },
  { conversa_id: "zz", mensagem: "Mensagem para uma conversa que não está na lista de hoje, não pode passar." },
  { conversa_id: "a", mensagem: "Repetida para a mesma conversa, também não pode passar de jeito nenhum." },
] }, new Set(["a", "b", "c"]));
assert.deepEqual(rec.ok.map((m) => m.conversa_id), ["a"]);
assert.equal(rec.descartes.length, 4);

// ---- Anúncios: sinais por campanha
const hoje = "2026-10-18";
const d = (n: number) => new Date(Date.parse(hoje) - n * 86_400_000).toISOString().slice(0, 10);
const linhas: LinhaAds[] = [];
const add = (c: string, n: number, spend: number, res: number, freq = 1.5) => linhas.push({ campaign_id: c, date: d(n), spend, impressions: 1000, reach: 600, frequency: freq, leads: 0, conversations: res, link_clicks: 10 });
for (let n = 0; n < 14; n++) {
  add("sem", n, 20, n < 7 ? 0 : 2);          // gastou 140 sem resultado nos últimos 7 dias
  add("subiu", n, 30, n < 7 ? 1 : 3);        // custo por resultado de 10 para 30
  add("cansou", n, 15, 2, n < 7 ? 3.6 : 2);  // frequência alta
  add("boa", n, 20, 6, 1.2);                 // custo bem abaixo da média
  add("pouco", n, 2, 0);                     // gasto pequeno: não entra
  if (n >= 5) add("parada", n, 30, 0);       // gastou 5 a 13 dias atrás e parou: já está pausada, sem sugestão
}
const sinais = diagnosticarAnuncios(linhas, { sem: "Avaliação", boa: "Mensagens" }, hoje);
const porTipo = Object.fromEntries(sinais.map((s) => [s.campanha_id, s.tipo]));
assert.deepEqual(porTipo, { sem: "sem_resultado", subiu: "custo_subiu", cansou: "fadiga", boa: "escalar" });
assert.equal(porTipo.parada, undefined, "campanha já parada não pode receber sugestão de pausar");
assert.equal(sinais[0].campanha, "Avaliação");
assert.ok(sinais[0].evidencias[0].includes("R$ 140,00"));

const ads = validarAnuncios({ recomendacoes: [
  { campanha_id: "sem", titulo: "Pausar a campanha Avaliação", acao: "Pausar e revisar o público, gastou sem gerar conversa.", passos: ["Pausar hoje", "Revisar público"], copies: [
    { gancho: "Você sabia que a avaliação muda o tratamento?", texto: "Entenda o que é olhado na primeira consulta e por que ela importa para o seu caso.", cta: "Fale com a equipe" },
    { gancho: "Consulta com 30% de desconto só hoje", texto: "Aproveite a condição especial desta semana para agendar a sua avaliação completa.", cta: "Agende" },
  ] },
  { campanha_id: "x", titulo: "Fora da lista", acao: "não deveria passar de jeito nenhum aqui", passos: ["a1", "b2"] },
] }, new Set(["sem"]));
assert.equal(ads.ok.length, 1);
assert.equal(ads.ok[0].copies.length, 1);
assert.equal(ads.descartes.length, 2);

// ---- Conteúdo: peça pronta
const peca = { formato: "reels", titulo: "3 sinais de que a sua pele pede avaliação", objetivo: "salvamento", gancho: "Se você tem uma pinta assim — pare tudo.",
  cenas: [{ fala: "Pinta que muda de cor merece olhar médico.", tela: "Mudou de cor?", visual: "Médica apontando" }, { fala: "Borda irregular também.", tela: "Borda irregular", visual: "Close" }, { fala: "E coceira que não passa.", tela: "Coça?", visual: "Médica sentada" }],
  legenda: "Muita gente acha que pinta é só estética. Não é. Salve este vídeo e compartilhe com quem precisa ver isso hoje. Ficou com dúvida? Me chama no direct.",
  cta: "Salve e mande para alguém", hashtags: ["dermatologia", "#pele"], evidencias: ["'pinta' aparece em 14 perguntas nos comentários"], brain: ["audiencia.duvida_pinta", "inventada.x"] };
const cont = validarConteudo({ pecas: [peca, { ...peca, titulo: "Resultado garantido no tratamento de manchas" }, { ...peca, titulo: "Reels curto demais", cenas: [peca.cenas[0]] }, { ...peca, formato: "carrossel", titulo: "Carrossel sem slides suficientes" }] }, ["audiencia.duvida_pinta"]);
assert.equal(cont.ok.length, 1);
assert.equal(cont.ok[0].gancho, "Se você tem uma pinta assim, pare tudo.");
assert.deepEqual(cont.ok[0].hashtags, ["#dermatologia", "#pele"]);
assert.deepEqual(cont.ok[0].brain, ["audiencia.duvida_pinta"]);
assert.equal(cont.descartes.length, 3);
assert.ok(pecaParaTexto(cont.ok[0]).includes("Cena 2\nFala: Borda irregular também."));
console.log("ok");

// Recuperação: data/horário inventados saem; "Oi!" sem nome ganha [nome]; " - " vira vírgula.
const r2 = validarRecuperacao({ mensagens: [
  { conversa_id: "a", mensagem: "Oi! Temos horário com a doutora nos dias 4 e 5 de novembro. Qual prefere para a sua consulta?" },
  { conversa_id: "b", mensagem: "Oi! Desculpe a demora - vi sua dúvida sobre a avaliação. Posso ver um horário em [dia] às [horário] para você?" },
  { conversa_id: "c", mensagem: "Olá, tudo bem? Posso reservar para quinta-feira às 14h a sua avaliação com a equipe da clínica?" },
] }, new Set(["a", "b", "c"]));
assert.deepEqual(r2.ok.map((m) => m.conversa_id), ["b"]);
assert.equal(r2.ok[0].mensagem, "Oi, [nome]! Desculpe a demora, vi sua dúvida sobre a avaliação. Posso ver um horário em [dia] às [horário] para você?");
assert.equal(r2.descartes.filter((d) => /inventou/.test(d)).length, 2);
console.log("ok 2");

// Recuperação: não afirma estado de agendamento que não conhece.
const r3 = validarRecuperacao({ mensagens: [
  { conversa_id: "a", mensagem: "Oi, [nome]! Seu agendamento segue confirmado com a doutora. Caso precise mudar algo, me avise por aqui." },
  { conversa_id: "b", mensagem: "Oi, [nome]! Você conseguiu confirmar o melhor horário para a consulta? Posso ajudar a marcar." },
] }, new Set(["a", "b"]));
assert.deepEqual(r3.ok.map((m) => m.conversa_id), ["b"]);
console.log("ok 3");
