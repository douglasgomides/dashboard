// As respostas dos blocos do "Ver tudo" de Anúncios (quick-ver-tudo, 13/11/2026): UMA frase de até 90 caracteres, com o número em destaque,
// tirada dos dados do próprio bloco; sem dado, "Falta dado". Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-anuncios.ts
import assert from "node:assert/strict";
import { checarCabeca, textoDaCabeca, type CabecaDoBloco } from "../src/lib/leitura/cabeca-do-bloco";
import {
  cabecaDasCampanhas,
  cabecaDasLimitacoes,
  cabecaDaQualidadeDosLeads,
  cabecaDeOndeFoiAVerba,
  cabecaDoAnuncioAConversa,
  cabecaDoComparativo,
  cabecaDoDiaADia,
  cabecaDoPlano,
  cabecaDosImpulsionados,
  cabecaPorObjetivo,
} from "../src/lib/leitura/ver-tudo-anuncios";

const ok = (c: CabecaDoBloco, esperado: string | RegExp) => {
  assert.deepEqual(checarCabeca(c), [], `cabeça válida: ${textoDaCabeca(c)}`);
  if (typeof esperado === "string") assert.equal(textoDaCabeca(c), esperado);
  else assert.match(textoDaCabeca(c), esperado);
};

// ---------- gráfico por dia ----------
const dia = (k: number) => new Date(Date.UTC(2026, 9, 5 + k, 12)).toISOString().slice(0, 10);
const semanas = Array.from({ length: 28 }, (_, k) => ({ dia: dia(k), gasto: 100, conversas: new Date(`${dia(k)}T12:00:00Z`).getUTCDay() === 2 ? 8 : 3 }));
ok(cabecaDoDiaADia(semanas), "Terça é o dia com mais conversas: 8 em média.");
const iguais = Array.from({ length: 10 }, (_, k) => ({ dia: dia(k), gasto: 100, conversas: 3 }));
ok(cabecaDoDiaADia(iguais), "As conversas vieram parecidas todo dia: 3 por dia, em média.");
const comPico = Array.from({ length: 6 }, (_, k) => ({ dia: dia(k), gasto: 100, conversas: k === 2 ? 12 : 2 }));
ok(cabecaDoDiaADia(comPico), "O dia de mais conversas foi 07/10: 12, com R$ 100 investidos.");
assert.equal(cabecaDoDiaADia([]).tipo, "falta");

// ---------- do anúncio à conversa ----------
ok(cabecaDoAnuncioAConversa({ aparicoes: 580000, cliques: 6000, conversas: 87 }), "De cada 100 cliques no link, 1,5 viram conversa.");
assert.equal(textoDaCabeca(cabecaDoAnuncioAConversa({ aparicoes: 10, cliques: 0, conversas: 0 })), "Falta dado: nenhum clique no link no período");

// ---------- campanhas ----------
const campanhas = [
  { campanha: "Consulta fictícia", gasto: 1740, conversas: 87, resultados: 87, custoPorConversa: 20 },
  { campanha: "Tráfego fictício", gasto: 870, conversas: 0, resultados: 3480, custoPorConversa: null },
  { campanha: "Alcance fictício", gasto: 580, conversas: 0, resultados: 0, custoPorConversa: null },
];
ok(cabecaDeOndeFoiAVerba(campanhas), "“Consulta fictícia” levou 55% da verba e 100% das conversas.");
// Nome comprido demais: a frase sem o nome.
ok(cabecaDeOndeFoiAVerba([{ ...campanhas[0], campanha: "Campanha fictícia com um nome muito comprido que não cabe na frase de jeito nenhum" }, campanhas[1]]), "A campanha que mais gastou levou 67% da verba e 100% das conversas.");
assert.equal(cabecaDeOndeFoiAVerba([]).tipo, "falta");
// A conversa mais cara contra a típica da conta (só a partir de 1,5×).
ok(cabecaDasCampanhas([...campanhas, { campanha: "Cara fictícia", gasto: 810, conversas: 10, resultados: 10, custoPorConversa: 81 }], 17.2), "“Cara fictícia” custou 4,7× a típica da conta: R$ 81 por conversa.");
// Sem conversa cara: quanto da verba foi para campanhas sem resultado (o diagnóstico marca; sem a marca, sem resultado nenhum).
ok(cabecaDasCampanhas(campanhas, 20), "“Alcance fictício” levou 18% da verba (R$ 580) sem nenhum resultado.");
ok(cabecaDasCampanhas([campanhas[0], { ...campanhas[1], semResultado: true }, campanhas[2]], 20), "45% da verba (R$ 1.450) foi para campanhas sem nenhum resultado.");
// Sem nada disso: a que mais trouxe conversa.
ok(cabecaDasCampanhas([campanhas[0]], 20), "“Consulta fictícia” trouxe 87 conversas, a R$ 20 cada.");
assert.equal(cabecaDasCampanhas([], 20).tipo, "falta");

// ---------- objetivo, plano, comparativo ----------
ok(cabecaPorObjetivo([{ nome: "mensagem", gasto: 1740, conversas: 87 }, { nome: "tráfego", gasto: 870, conversas: 0 }], null), "Mensagem levou 67% da verba e trouxe 87 conversas.");
ok(cabecaPorObjetivo([], { caro: "tráfego", barato: "mensagem", vezes: 3.2 }), "A conversa de tráfego custou 3,2× a de mensagem.");
ok(cabecaDoPlano(1, false), "1 campanha pede mudança de verba agora.");
ok(cabecaDoPlano(0, false), "Nenhuma campanha pede mudança de verba agora.");
assert.equal(cabecaDoPlano(2, true).tipo, "falta", "rastreio suspeito: nada de plano de verba");
ok(
  cabecaDoComparativo([
    { rotulo: "Aparições", agora: 600000, antes: 600000, bomSobe: true },
    { rotulo: "Cliques no link", agora: 7200, antes: 6000, bomSobe: true },
  ]),
  "Cliques no link subiram 20% contra o período anterior.",
);
ok(cabecaDoComparativo([{ rotulo: "Aparições", agora: 100, antes: 101, bomSobe: true }, { rotulo: "Cliques no link", agora: 50, antes: 50, bomSobe: true }]), "Nenhum dos 2 números mudou 5% ou mais contra o período anterior.");
// Rótulo com jargão (CTR) não vai para a frase: a frase sem o nome.
ok(cabecaDoComparativo([{ rotulo: "CTR", agora: 2, antes: 1, bomSobe: true }]), "O número que mais mudou subiu 100%.");
assert.equal(cabecaDoComparativo([{ rotulo: "Aparições", agora: 10, antes: null, bomSobe: true }]).tipo, "falta");

// ---------- leads, impulsionados, limitações ----------
ok(cabecaDaQualidadeDosLeads({ leadsDoPeriodo: 120, leadsComCampanha: 30 }), "Dos leads do período, 30 de 120 trazem a campanha de origem.");
assert.equal(cabecaDaQualidadeDosLeads({ leadsDoPeriodo: 0, leadsComCampanha: 0 }).tipo, "falta");
ok(cabecaDosImpulsionados([{ gasto: 100 }, { gasto: 50 }]), "2 posts impulsionados somaram R$ 150 no período.");
ok(cabecaDasLimitacoes(2), "O painel ainda não mede 2 coisas destes anúncios.");

console.log("test-ver-tudo-anuncios: ok");
