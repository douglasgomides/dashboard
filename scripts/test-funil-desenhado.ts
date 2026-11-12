// Funil desenhado (sketch 001, variante A2): geometria, textos e adaptadores, com honestidade.
// Números da Lana tirados do sketch (13/10 a 11/11/2026): 5.808 conversas, 2.283 entraram, 217 atendidos, 39 agendaram, 18 compraram.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-funil-desenhado.ts
import assert from "node:assert/strict";
import {
  NOMES_DO_FUNIL,
  daJornada,
  deFunilComercial,
  dePacientesDoPeriodo,
  larguraDaEtapa,
  larguraDoAnterior,
  maiorDaEscala,
  poligonoDaLigacao,
  resumoAcessivel,
  rotuloDoAnterior,
  textoDaPassagem,
} from "../src/lib/funil-desenhado";
import { montarFunil, type Contagem, type DadosComerciais } from "../src/lib/comercial";
import { montarFunil as montarJornada, type FunilBanco } from "../src/lib/jornada-funil";
import type { ItemPessoa, Lista, Numero, PacientesPeriodo } from "../src/lib/pacientes";

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
assert.equal(poligonoDaLigacao(100, 33.333), "polygon(0% 0, 100% 0, 66.67% 100%, 33.33% 100%)", "no máximo 2 casas");

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

// ================================================================ dePacientesDoPeriodo (Funil › Do contato à venda)
const num = (valor: number | null, motivo: string | null = valor == null ? "A fonte não respondeu." : null): Numero => ({ valor, fonte: "teste", motivo_sem_dado: motivo, responsavel: null });
const pessoa = (id: string): ItemPessoa => ({ id, pessoa: id, nome: null, canal: null, conversa_id: null, data: null, fonte: null, crm: null, leitura: null });
const lista = (ids: string[], total = ids.length): Lista => ({ total, itens: ids.map(pessoa) });
const ids = (prefixo: string, n: number) => Array.from({ length: n }, (_, i) => `${prefixo}${i + 1}`);
type DadosPac = Pick<PacientesPeriodo, "numeros" | "listas">;
function pacientes(sobre: { numeros?: Record<string, Numero>; listas?: Record<string, Lista> } = {}): DadosPac {
  return {
    numeros: { mandaram_mensagem: num(120), leads_novos: num(80), antigos: num(40), agendaram: num(30), negociacao: num(12), compareceram: num(null), fecharam: num(9), abordados: num(null), engajaram_instagram: num(15), ...sobre.numeros },
    // Atendido = pessoas distintas de negociação (12), agendaram (30) e fecharam (os 9 já estão entre as outras): 42.
    listas: {
      negociacao: lista(ids("a", 12)), agendaram: lista(ids("b", 30)), fecharam: lista([...ids("a", 3), ...ids("b", 6)]),
      mandaram_mensagem: lista([]), leads_novos: lista([]), antigos: lista([]), compareceram: lista([]), abordados: lista([]), engajaram_instagram: lista([]),
      ...sobre.listas,
    },
  } as DadosPac;
}
const variaGeral = (chave: string) => ({ pct: chave === "fecharam" ? -50 : 25, sobe: chave !== "fecharam" });

const p = dePacientesDoPeriodo({ dados: pacientes(), variacao: variaGeral });
assert.deepEqual(p.etapas.map((e) => e.nome), [...NOMES_DO_FUNIL]);
assert.deepEqual(p.etapas.map((e) => e.valor), [120, 80, 42, 30, 9], "Atendido é a união das 3 listas, sem repetir pessoa");
// Variação só onde o diário tem o campo; Atendido nunca tem variação nem contorno.
assert.deepEqual(p.etapas[0].variacao, { pct: 25, sobe: true });
assert.deepEqual(p.etapas[4].variacao, { pct: -50, sobe: false });
assert.equal(p.etapas[2].variacao, null, "o diário não tem o campo de Atendido");
assert.equal(larguraDoAnterior(p.etapas[2], 120), null);
assert.notEqual(larguraDoAnterior(p.etapas[0], 120), null);
// Ligações: as duas primeiras sem %, Atendido → Agendou pela base de leads, Agendou → Fechou pela base de agendamentos.
assert.match(p.etapas[1].passagem?.sem ?? "", /pacientes antigos/);
assert.match(p.etapas[2].passagem?.sem ?? "", /pacientes antigos/);
assert.equal(textoDaPassagem(p.etapas[3].passagem), "71% passam");
assert.equal(textoDaPassagem(p.etapas[4].passagem), "30% passam");
assert.deepEqual(p.maiorPerda, { de: 3, para: 4, texto: "30% passam" }, "a menor taxa abaixo de 1");
assert.equal(p.foraDeOrdem, false);
// Detalhe só com números.
assert.deepEqual(p.etapas[0].detalhe.map((b) => b.rotulo), ["Pessoas novas", "Pacientes antigos"]);
assert.deepEqual(p.etapas[2].detalhe.map((b) => b.rotulo), ["Em atendimento agora", "Agendaram", "Fecharam"]);
assert.deepEqual(p.etapas[3].detalhe.map((b) => b.rotulo), ["Fecharam"], "Foram na consulta sem medida não vira barra");
for (const e of p.etapas) for (const b of e.detalhe) assert.match(b.exibicao, /^[\d.]+$/);
const comConsulta = dePacientesDoPeriodo({ dados: pacientes({ numeros: { compareceram: num(7) } }), variacao: () => null });
assert.deepEqual(comConsulta.etapas[3].detalhe.map((b) => b.rotulo), ["Foram na consulta", "Fecharam"]);
assert.ok(comConsulta.etapas.every((e) => e.variacao === null), "sem variação da tela, sem contorno");

// Atendido só com as 3 listas inteiras e negociação com valor.
const cortada = dePacientesDoPeriodo({ dados: pacientes({ listas: { negociacao: lista(ids("a", 5), 12) } }), variacao: variaGeral });
assert.equal(cortada.etapas[2].valor, null);
assert.equal(cortada.etapas[2].texto, "Falta dado");
assert.match(cortada.etapas[2].motivo ?? "", /não veio inteira/);
assert.equal(cortada.etapas[3].passagem, null, "com Atendido sem dado a ligação fica neutra");
const semNegociacao = dePacientesDoPeriodo({ dados: pacientes({ numeros: { negociacao: num(null, "Sem etapa de negociação no CRM.") } }), variacao: variaGeral });
assert.equal(semNegociacao.etapas[2].valor, null);
assert.match(semNegociacao.etapas[2].motivo ?? "", /Sem etapa de negociação/);

// Agendou → Fechou: fecharam > agendaram não ganha %; com o aviso da tela de pacientes.
const maisFechouQueAgendou = dePacientesDoPeriodo({ dados: pacientes({ numeros: { fecharam: num(40) }, listas: { fecharam: lista(ids("c", 40)) } }), variacao: () => null });
assert.equal(maisFechouQueAgendou.etapas[4].passagem?.taxa, null);
assert.match(maisFechouQueAgendou.etapas[4].passagem?.sem ?? "", /40 pessoas fecharam no período, mas só 30 aparecem como agendadas/);
// Base pequena: "N de M".
const poucosAgendou = dePacientesDoPeriodo({ dados: pacientes({ numeros: { agendaram: num(10) }, listas: { agendaram: lista(ids("b", 10)), fecharam: lista(ids("b", 6)) } }), variacao: () => null });
assert.deepEqual(poucosAgendou.etapas[4].passagem?.fracao, { n: 9, m: 10 });
assert.equal(textoDaPassagem(poucosAgendou.etapas[4].passagem), "9 de 10");
// Falta dado em número sem medida: o motivo é o da fonte.
const semLeads = dePacientesDoPeriodo({ dados: pacientes({ numeros: { leads_novos: num(null, "CRM não ligado.") } }), variacao: variaGeral });
assert.equal(semLeads.etapas[1].valor, null);
assert.equal(semLeads.etapas[1].motivo, "CRM não ligado.");
assert.equal(semLeads.etapas[1].passagem, null);
assert.equal(semLeads.etapas[1].variacao, null, "Falta dado não tem contorno");

// ================================================================ daJornada
const banco = (sobre: Partial<FunilBanco> = {}, fontes: Partial<FunilBanco["fontes"]> = {}): FunilBanco => ({
  alcance: 50000, dias_alcance: 30, interacoes: 2000, dias_interacoes: 30, comentarios: 300, comentaristas: 200, conversas: 120, leads: 100, leads_com_etapa: 90,
  agendados: 30, vendas: 6, receita: 0, dias_periodo: 30,
  fontes: { tem_instagram: true, tem_comentarios: true, tem_whatsapp: true, tem_conversas: true, tem_crm: true, tem_etapa_agendamento: true, tem_venda_registrada: true, crm_provider: "kommo", ...fontes },
  ...sobre,
});
const comercialDaJornada = (c: Partial<Contagem> = {}, escopo: "periodo" | "base" = "periodo") => {
  const d = dados({ c: { leads: 100, atendidos: 60, agendados: 30, agendadosProvaveis: 30, ganhos: 6, perdidos: 4, emConsulta: 20, ...c }, escopo });
  return { funil: montarFunil(d), dados: d };
};
const j = daJornada({ funil: montarJornada(banco()), comercial: comercialDaJornada() });
assert.deepEqual(j.antes.map((a) => a.nome), ["Alcance", "Engajamento", "Comentário ou direct"], "a faixa Antes da conversa, com os nomes de hoje");
assert.deepEqual(j.antes.map((a) => a.valor), [50000, 2000, 200]);
assert.equal(j.antes[0].texto, "50.000");
assert.deepEqual(j.funil.etapas.map((e) => e.nome), [...NOMES_DO_FUNIL]);
assert.deepEqual(j.funil.etapas.map((e) => e.valor), [120, 100, 60, 30, 6], "Atendido é o passo atendidos do diagnóstico");
// Ligações: as de fora herdam a taxa; as duas de Atendido são sempre sem %.
assert.equal(textoDaPassagem(j.funil.etapas[1].passagem), "83% passam");
assert.match(j.funil.etapas[2].passagem?.sem ?? "", /Atendido conta cards do CRM, e Virou lead conta pessoas/);
assert.match(j.funil.etapas[3].passagem?.sem ?? "", /Agendou conta pessoas, e Atendido conta cards do CRM/);
assert.equal(textoDaPassagem(j.funil.etapas[4].passagem), "20% passam");
assert.deepEqual(j.funil.maiorPerda, { de: 3, para: 4, texto: "20% passam" });
// A maior queda só vale quando as duas etapas ficam vizinhas no funil desenhado.
const quedaDistante = daJornada({ funil: montarJornada(banco({ vendas: 27 })), comercial: comercialDaJornada({ ganhos: 27 }) });
assert.equal(quedaDistante.funil.maiorPerda, null, "a maior queda (Virou lead → Agendou) não é vizinha: não aponta");
assert.equal(quedaDistante.funil.foraDeOrdem, false);
// Taxa acima de 1 liga fora de ordem e apaga a maior perda.
const foraJ = daJornada({ funil: montarJornada(banco({ leads: 200, agendados: 30 })), comercial: comercialDaJornada() });
assert.equal(foraJ.funil.foraDeOrdem, true);
assert.equal(foraJ.funil.maiorPerda, null);
assert.match(foraJ.funil.aviso ?? "", /fora de ordem/);
// Atendido só com escopo do período e passo confiável.
const base2 = daJornada({ funil: montarJornada(banco()), comercial: comercialDaJornada({}, "base") });
assert.equal(base2.funil.etapas[2].valor, null);
assert.equal(base2.funil.etapas[2].texto, "Falta dado");
assert.equal(daJornada({ funil: montarJornada(banco()), comercial: null }).funil.etapas[2].valor, null);
// Pacientes presentes: o agendamento e a venda herdam o "sem %" da jornada.
const comPac = daJornada({
  funil: montarJornada(banco(), undefined, { numeros: { leads_novos: num(80), agendaram: num(30), fecharam: num(9) } as PacientesPeriodo["numeros"] }),
  comercial: comercialDaJornada(),
});
assert.match(comPac.funil.etapas[4].passagem?.sem ?? "", /A venda conta cards criados no período e o agendamento conta pessoas/);
assert.equal(comPac.funil.etapas[1].valor, 80, "Virou lead conta as pessoas novas quando pacientes_periodo respondeu");
// Etapa sem integração vira Falta dado com o que falta (integração, dado, onde) na explicação.
const semWhatsJ = daJornada({ funil: montarJornada(banco({}, { tem_whatsapp: false })), comercial: comercialDaJornada() });
assert.equal(semWhatsJ.funil.etapas[0].valor, null);
assert.match(semWhatsJ.funil.etapas[0].motivo ?? "", /não está ligado/);
assert.match(semWhatsJ.funil.etapas[0].explicacao ?? "", /WhatsApp pela WTS/);
assert.match(semWhatsJ.funil.etapas[0].explicacao ?? "", /Onde resolver/);
assert.equal(semWhatsJ.funil.etapas[1].passagem, null, "com Conversou sem dado a ligação fica neutra");
// Antes da conversa: sem Instagram, as 3 viram Falta dado.
const semIg = daJornada({ funil: montarJornada(banco({}, { tem_instagram: false })), comercial: comercialDaJornada() });
assert.ok(semIg.antes.every((a) => a.valor === null && a.texto === "Falta dado" && a.motivo));

console.log("test-funil-desenhado: ok");
