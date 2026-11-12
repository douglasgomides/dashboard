// Funil desenhado (sketch 001, variante A2): geometria, textos e adaptadores, com honestidade.
// Números da Lana tirados do sketch (13/10 a 11/11/2026): 5.808 conversas, 2.283 entraram, 217 atendidos, 39 agendaram, 18 compraram.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-funil-desenhado.ts
import assert from "node:assert/strict";
import {
  NOMES_DO_FUNIL,
  deFunilComercial,
  larguraDaEtapa,
  larguraDoAnterior,
  maiorDaEscala,
  poligonoDaLigacao,
  resumoAcessivel,
  rotuloDoAnterior,
  textoDaPassagem,
} from "../src/lib/funil-desenhado";
import { montarFunil, type Contagem, type DadosComerciais } from "../src/lib/comercial";

// ---------------------------------------------------------------- nomes do João (12/11/2026, D-06)
assert.deepEqual([...NOMES_DO_FUNIL], ["Conversou", "Virou lead", "Atendido", "Agendou", "Fechou"]);

// ---------------------------------------------------------------- geometria
// Escala de raiz com mínimo de 8%: o fundo continua visível e a maior etapa ocupa tudo.
assert.equal(larguraDaEtapa(100, 100), 100);
assert.equal(larguraDaEtapa(25, 100), 50);
assert.equal(larguraDaEtapa(0, 100), 8, "valor 0 dá o mínimo");
assert.equal(larguraDaEtapa(0.01, 100), 8, "valor minúsculo não passa de baixo do mínimo");
assert.equal(larguraDaEtapa(500, 100), 100, "nunca passa de 100");
assert.equal(larguraDaEtapa(null, 100), 8, "sem valor (toco) usa o mínimo");
assert.equal(larguraDaEtapa(10, 0), 8, "escala sem maior não quebra");

const etapa = (valor: number | null, variacao: { pct: number; sobe: boolean } | null = null) => ({
  id: "x", nome: "X", valor, texto: valor == null ? "Falta dado" : String(valor), estimado: false, motivo: null, explicacao: null, variacao, passagem: null, detalhe: [],
});
// Anterior estimado: com +25% e valor 125, o mês antes foi 100.
assert.equal(larguraDoAnterior(etapa(125, { pct: 25, sobe: true }), 125), larguraDaEtapa(100, 125));
assert.equal(larguraDoAnterior(etapa(125), 125), null, "sem variação, sem contorno");
assert.equal(larguraDoAnterior(etapa(125, { pct: -100, sobe: false }), 125), null, "1 + pct/100 <= 0 não tem anterior");
assert.equal(larguraDoAnterior(etapa(125, { pct: -150, sobe: false }), 125), null);
assert.equal(larguraDoAnterior(etapa(null, { pct: 10, sobe: true }), 125), null, "sem valor, sem contorno");
// A escala cobre o maior entre os atuais e os anteriores estimados (o contorno nunca corta).
assert.equal(maiorDaEscala([etapa(50), etapa(30, { pct: -50, sobe: false })]), 60, "anterior estimado 60 é maior que 50");
assert.equal(maiorDaEscala([etapa(50), etapa(null)]), 50);
assert.equal(maiorDaEscala([etapa(null)]), 0);

// Ligação em trapézio: margem = (100 - largura) / 2.
assert.equal(poligonoDaLigacao(100, 50), "polygon(0% 0, 100% 0, 75% 100%, 25% 100%)");
assert.equal(poligonoDaLigacao(50, 50), "polygon(25% 0, 75% 0, 75% 100%, 25% 100%)");
assert.equal(poligonoDaLigacao(100, 33.333), "polygon(0% 0, 100% 0, 83.33% 100%, 16.67% 100%)", "no máximo 2 casas");

// Texto da passagem: mesmo formato de fmtFracao ("9,4%"), "N de M" só para fração, nada para sem passagem.
assert.equal(textoDaPassagem({ taxa: 0.094, fracao: null, sem: null }), "9,4% passam");
assert.equal(textoDaPassagem({ taxa: 0.5, fracao: null, sem: null }), "50% passam");
assert.equal(textoDaPassagem({ taxa: null, fracao: { n: 3, m: 12 }, sem: null }), "3 de 12");
assert.equal(textoDaPassagem({ taxa: null, fracao: null, sem: "contas diferentes" }), null);
assert.equal(textoDaPassagem(null), null);

assert.equal(rotuloDoAnterior(30), "mês antes");
assert.equal(rotuloDoAnterior(28), "mês antes");
assert.equal(rotuloDoAnterior(31), "mês antes");
assert.equal(rotuloDoAnterior(27), "período anterior");
assert.equal(rotuloDoAnterior(7), "período anterior");

// ---------------------------------------------------------------- deFunilComercial: o funil da Lana do sketch
function contagem(sobre: Partial<Contagem> = {}): Contagem {
  return {
    leads: 2283, atendidos: 217, naEntrada: 1500, naEntrada3d: 900, agendados: 39, emConsulta: 21, agendadosProvaveis: 39,
    ganhosEmEtapaAgenda: 0, pareceConsulta: 0, ganhos: 18, perdidos: 33, comOrigem: 2000, origemEhFunil: 0, comContato: 2200,
    abertos: 2200, abertosSemDono: 100, ...sobre,
  };
}
function dados(sobre: { c?: Partial<Contagem>; whatsapp?: Partial<DadosComerciais["whatsapp"]>; escopo?: "periodo" | "base" } = {}): DadosComerciais {
  return {
    origem: "completo", provider: "kommo", escopo: sobre.escopo ?? "periodo", c: contagem(sobre.c), base: null, listaImportada: 0,
    etapas: { total: 8, consulta: 1, consultaEquipe: null, pareceConsulta: 0 },
    whatsapp: { conectado: true, conversas: 5808, respondidas: 4100, esperaMedianaSeg: 120, ...sobre.whatsapp },
    crmCompartilhado: null,
  };
}
const lana = (sobre: Parameters<typeof dados>[0] = {}) => {
  const d = dados(sobre);
  return deFunilComercial({ funil: montarFunil(d), dados: d });
};

const f = lana();
assert.deepEqual(f.etapas.map((e) => e.nome), [...NOMES_DO_FUNIL], "5 etapas com os nomes do João");
assert.deepEqual(f.etapas.map((e) => e.valor), [5808, 2283, 217, 39, 18]);
assert.equal(f.etapas[0].texto, "5.808");
assert.ok(f.etapas.every((e) => e.variacao === null), "sem período anterior em memória, sem variação");
// Conversou → Virou lead: contas diferentes, sem %.
assert.equal(f.etapas[0].passagem, null, "a primeira etapa não tem ligação de chegada");
assert.equal(f.etapas[1].passagem?.taxa, null);
assert.equal(f.etapas[1].passagem?.fracao, null);
assert.match(f.etapas[1].passagem?.sem ?? "", /contas diferentes/);
assert.equal(textoDaPassagem(f.etapas[1].passagem), null);
// As outras ligações: a taxa do passo.
assert.equal(textoDaPassagem(f.etapas[2].passagem), "9,5% passam");
assert.equal(textoDaPassagem(f.etapas[3].passagem), "18% passam");
assert.equal(textoDaPassagem(f.etapas[4].passagem), "46% passam");
// Maior perda: Virou lead → Atendido.
assert.deepEqual(f.maiorPerda, { de: 1, para: 2, texto: "9,5% passam" });
assert.equal(f.foraDeOrdem, false);
assert.equal(f.aviso, null);
// Só números nos detalhes (nenhum nome, telefone ou e-mail) e fração relativa ao maior da própria lista.
for (const e of f.etapas) {
  for (const b of e.detalhe) {
    assert.match(b.exibicao, /^[\d.]+$/, `detalhe de ${e.nome} só tem número: ${b.exibicao}`);
    assert.ok(b.fracao >= 0 && b.fracao <= 1);
  }
}
assert.deepEqual(f.etapas[1].detalhe.map((b) => b.rotulo), ["Ainda na primeira etapa", "Já atendidos", "Perdidos", "Fechados"]);
assert.equal(f.etapas[1].detalhe[0].fracao, 1, "o maior da lista ocupa a barra inteira");
assert.deepEqual(f.etapas[0].detalhe.map((b) => b.rotulo), ["Conversas no período", "Com espera medida"]);
assert.deepEqual(f.etapas[4].detalhe.map((b) => b.rotulo), ["Fechados"]);
// Resumo para leitor de tela: uma frase por etapa e a maior perda.
const resumo = resumoAcessivel("Funil comercial", f);
assert.match(resumo, /Conversou: 5\.808/);
assert.match(resumo, /Maior perda: Virou lead para Atendido/);
assert.match(resumo, /9,5% passam/);

// ---------------------------------------------------------------- Falta dado: nunca barra nem zero
const semAgendamento = lana({ c: { agendados: null, agendadosProvaveis: null, emConsulta: 0 } });
const ag = semAgendamento.etapas[3];
assert.equal(ag.valor, null);
assert.equal(ag.texto, "Falta dado");
assert.ok(ag.motivo && ag.motivo.length > 10, "Falta dado explica o motivo");
// As ligações vizinhas ficam neutras (sem % e sem aviso de "sem").
assert.equal(semAgendamento.etapas[3].passagem, null);
assert.equal(semAgendamento.etapas[4].passagem, null);
// A porcentagem com a base do passo anterior vai para a explicação da etapa de baixo.
assert.match(semAgendamento.etapas[4].explicacao ?? "", /passam|de/);
assert.equal(semAgendamento.maiorPerda?.de, 1, "a maior perda continua entre as etapas medidas");
assert.equal(semAgendamento.etapas[3].detalhe.length, 0, "etapa sem valor não desenha detalhe");

// WhatsApp desligado, conversas null ou escopo "base": Conversou vira Falta dado com o motivo.
const semWhats = lana({ whatsapp: { conectado: false } });
assert.equal(semWhats.etapas[0].valor, null);
assert.match(semWhats.etapas[0].motivo ?? "", /WhatsApp da clínica não está ligado/);
const semConversas = lana({ whatsapp: { conversas: null } });
assert.equal(semConversas.etapas[0].valor, null);
assert.match(semConversas.etapas[0].motivo ?? "", /não vieram neste período/);
const base = lana({ escopo: "base" });
assert.equal(base.etapas[0].valor, null);
assert.match(base.etapas[0].motivo ?? "", /base inteira/);
assert.equal(base.etapas[1].passagem, null, "com Conversou sem dado a ligação fica neutra");

// ---------------------------------------------------------------- base abaixo do mínimo: "N de M", nunca %
const pequeno = lana({ c: { leads: 20, atendidos: 5, agendados: 3, agendadosProvaveis: 3, ganhos: 1, perdidos: 1, emConsulta: 2 } });
assert.equal(pequeno.etapas[2].passagem?.taxa, null);
assert.deepEqual(pequeno.etapas[2].passagem?.fracao, { n: 5, m: 20 });
assert.equal(textoDaPassagem(pequeno.etapas[2].passagem), "5 de 20");
assert.equal(pequeno.maiorPerda, null, "base pequena não aponta a maior perda");
assert.ok(!resumoAcessivel("Funil", pequeno).includes("%"), "base pequena não fala em %");

// ---------------------------------------------------------------- funil fora de ordem: sem maior perda e com aviso
const fora = lana({ c: { atendidos: 100, agendados: 150, agendadosProvaveis: 150, ganhos: 18 } });
assert.equal(fora.foraDeOrdem, true);
assert.equal(fora.maiorPerda, null);
assert.match(fora.aviso ?? "", /fora de ordem/);

console.log("test-funil-desenhado: ok");
