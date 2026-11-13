// As respostas dos blocos dos Detalhes de Onde os pacientes travam › Funil › No CRM e a descoberta "Falta dado" que toma o lugar da
// leitura negada (quick-ver-tudo-abas, 13/11/2026). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-crm-painel.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import { checarDescoberta } from "../src/lib/leitura/cinco-segundos";
import { fatosEmConstrucao } from "../src/lib/leitura/fatos-pacientes";
import { ABRIR_VER_TUDO } from "../src/lib/leitura/leitura-em-descobertas";
import {
  cabecaDaAtividade,
  cabecaDaBaseGeral,
  cabecaDaBaseViva,
  cabecaDaConversao,
  cabecaDasLimitacoes,
  cabecaDasVisoes,
  cabecaDoAtendimento,
  cabecaDoCampo,
  cabecaDoChecklist,
  cabecaDoFunilDaBase,
  cabecaDoPeriodoNoCrm,
  cabecaDoQueTrava,
  cabecaDosFunis,
  cabecaDosLinks,
  cabecaDosOrcamentos,
  comAcaoCurta,
  descobertaDaFaltaDeDado,
  MAX_DA_ACAO,
} from "../src/lib/leitura/ver-tudo-crm-painel";

const ok = (c: CabecaDoBloco, esperado: string) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  assert.equal(textoDaCabeca(c), esperado);
};
const falta = (c: CabecaDoBloco, motivo: RegExp) => {
  assert.equal(c.tipo, "falta", `sem dado vira "Falta dado": ${textoDaCabeca(c)}`);
  assert.match(textoDaCabeca(c), motivo);
  assert.deepEqual(checarCabeca(c), []);
};

// No período selecionado: só o que os cartões do topo não mostram.
ok(cabecaDoPeriodoNoCrm({ carregando: false, erro: false, pessoas: { pessoas: 90, cards: 120, max_cards_por_pessoa: 4 }, periodo: { perdidos: 3, valor: 12000 } }), "120 cards de 90 pessoas no período; até 4 por pessoa.");
ok(cabecaDoPeriodoNoCrm({ carregando: false, erro: false, pessoas: null, periodo: { perdidos: 3, valor: 12000 } }), "3 perdidos no período; os cards somam R$ 12.000.");
ok(cabecaDoPeriodoNoCrm({ carregando: false, erro: false, pessoas: null, periodo: { perdidos: 1, valor: 0 } }), "1 perdido no período; os cards somam R$ 0.");
falta(cabecaDoPeriodoNoCrm({ carregando: true, erro: false, pessoas: null, periodo: { perdidos: 3, valor: 1 } }), /carregando/);
falta(cabecaDoPeriodoNoCrm({ carregando: false, erro: true, pessoas: null, periodo: null }), /não respondeu/);
falta(cabecaDoPeriodoNoCrm({ carregando: false, erro: false, pessoas: null, periodo: null }), /não devolveu/);

ok(cabecaDoQueTrava({ performance: 1, operacao: 1, rastreamento: 0 }), "2 problemas travam o funil: 1 de resultado e 1 de operação.");
ok(cabecaDoQueTrava({ performance: 0, operacao: 1, rastreamento: 0 }), "1 problema trava o funil: 1 de operação.");
falta(cabecaDoQueTrava({ performance: 0, operacao: 0, rastreamento: 0 }), /nenhum problema/);

ok(cabecaDasLimitacoes(1), "1 coisa que o painel ainda não consegue dizer.");
ok(cabecaDasLimitacoes(3), "3 coisas que o painel ainda não consegue dizer.");

ok(cabecaDaBaseGeral({ total: 500, novos7d: 15 }), "500 leads no histórico do CRM; 15 cards novos em 7 dias.");
falta(cabecaDaBaseGeral({ total: 0, novos7d: 0 }), /sem leads/);
ok(cabecaDoFunilDaBase({ total: 500, emDisputa: 430 }), "430 de 500 leads da base ainda estão em disputa.");

// Conversão: com menos de 30 cards com resultado, "N de M" e nunca porcentagem.
ok(cabecaDaConversao({ ganhos: 40, perdidos: 30 }), "57% dos cards com resultado foram ganhos: 40 de 70.");
ok(cabecaDaConversao({ ganhos: 4, perdidos: 3 }), "4 de 7 cards com resultado foram ganhos.");
assert.doesNotMatch(textoDaCabeca(cabecaDaConversao({ ganhos: 4, perdidos: 3 })), /%/, "base pequena nunca vira porcentagem");
falta(cabecaDaConversao({ ganhos: 0, perdidos: 0 }), /nenhum card/);

ok(cabecaDoChecklist(["feito", "parcial", "feito", "parcial", "parcial"]), "2 de 5 itens do CRM estão prontos para o painel responder.");
const pronto = cabecaDoChecklist(["feito"]);
assert.equal(pronto.tipo === "frase" ? pronto.tom : null, "bom");

ok(cabecaDosFunis([{ funil: "Captação", entraram: 60 }, { funil: "Resgate", entraram: 20 }, { funil: "Vazio", entraram: 0 }]), '"Captação" trouxe mais: 60 de 80 leads do período.');
falta(cabecaDosFunis([{ funil: "Captação", entraram: 60 }]), /menos de 2 funis/);

ok(cabecaDosOrcamentos({ pessoas: 40, pessoas_aprovadas: 12 }), "12 de 40 pacientes aprovaram algum orçamento no período.");
ok(cabecaDaBaseViva({ abertos: 400, vivos_30d: 120, parados_90d: 200 }), "120 de 400 leads em aberto se mexeram em 30 dias; 200 parados há 90+.");
ok(cabecaDoAtendimento({ semResposta: 3, conversas: 200 }), "3 pacientes sem resposta nas últimas 200 conversas.");
ok(cabecaDoAtendimento({ semResposta: 0, conversas: 200 }), "Ninguém sem resposta nas últimas 200 conversas.");
ok(cabecaDoAtendimento({ semResposta: 1, conversas: 50, contatos: true }), "1 contato sem resposta nas últimas 50 conversas.");
ok(cabecaDosLinks({ links: 4, cliques: 1200 }), "1.200 cliques de pessoas em 4 links rastreados, em 30 dias.");
ok(cabecaDosLinks({ links: 1, cliques: null }), "1 link rastreado ligado a esta clínica.");
ok(cabecaDasVisoes({ abertos: 300, parados30: 200 }), "200 de 300 leads abertos entraram há mais de 30 dias.");
ok(cabecaDaAtividade({ leads: 12, ultimo: "há 2h" }), "O último lead entrou há 2h; aqui estão os 12 mais recentes.");
falta(cabecaDaAtividade({ leads: 0, ultimo: null }), /nenhum lead recente/);
ok(cabecaDoCampo([{ chave: "Instagram", total: 30 }, { chave: "Indicação", total: 10 }], "a fonte", "x"), '"Instagram" é a fonte mais comum: 30 de 40 leads.');
falta(cabecaDoCampo([], "a fonte", "nenhum lead com fonte identificada ainda"), /nenhum lead com fonte/);

// Nenhuma frase compara com outras clínicas nem usa jargão (a guarda de checarCabeca roda em todos os "ok" acima).

// A leitura negada vira UMA descoberta "Falta dado" com o passo como ação (a aba nunca fica em branco).
const negada = descobertaDaFaltaDeDado(fatosEmConstrucao("crm-painel", { de: "2026-10-15", ate: "2026-11-13" }), false);
assert.ok(negada, "leitura negada vira descoberta");
assert.deepEqual(checarDescoberta(negada!), []);
assert.match(negada!.frase, /^Falta dado: /);
assert.equal(negada!.acao.local, ABRIR_VER_TUDO);
assert.ok(negada!.porque.barras.every((b) => b.faltou), "o que falta é barra listrada, nunca zero");
const semFatos = descobertaDaFaltaDeDado(null, false);
assert.equal(semFatos?.frase, "Falta dado: não há dado neste período.");
assert.equal(descobertaDaFaltaDeDado(null, true), null, "carregando nunca vira Falta dado");

// Ação longa: a pílula leva o começo do passo e o passo inteiro abre o "Por quê?" (nada some).
const longa = comAcaoCurta({ ...negada!, acao: { rotulo: "Revisar uma pessoa de plantão no WhatsApp em cada turno e ligar a mensagem automática", local: "x" } });
assert.ok(longa.acao.rotulo.length <= MAX_DA_ACAO, longa.acao.rotulo);
assert.match(longa.acao.rotulo, /…$/);
assert.equal(longa.porque.titulo, "O que fazer: Revisar uma pessoa de plantão no WhatsApp em cada turno e ligar a mensagem automática.");
assert.deepEqual(checarDescoberta(longa), []);
assert.equal(comAcaoCurta(negada!), negada, "ação curta não muda");

console.log("test-ver-tudo-crm-painel: ok");
