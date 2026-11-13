// O "Ver tudo" no formato 5 segundos (quick-ver-tudo, João 13/11/2026): a cabeça de cada bloco (UMA frase de até 90 caracteres com o
// número em destaque, ou "Falta dado") e a leitura do período virando descobertas (o que o topo já diz não volta; o que só a leitura
// dizia nunca some). Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-ver-tudo-base.ts
import assert from "node:assert/strict";
import {
  VERSAO_REGRAS_CABECA,
  checarCabeca,
  diaDaSemana,
  diaDePico,
  enfase,
  faltaDado,
  maiorItem,
  melhorDiaDaSemana,
  menorItem,
  piorPassagem,
  primeiraQueCabe,
  textoDaCabeca,
  vezes,
} from "../src/lib/leitura/cabeca-do-bloco";
import { checarDescoberta, type Descoberta } from "../src/lib/leitura/cinco-segundos";
import { ABRIR_VER_TUDO, descobertasDaLeitura, fichasDeNumero, juntarDescobertas, periodoDoVerTudo } from "../src/lib/leitura/leitura-em-descobertas";
import type { Fato, FatosDaTela, PassoFato } from "../src/lib/leitura/tipos";

assert.equal(VERSAO_REGRAS_CABECA, 1);

// ---------------------------------------------------------------- cabeça do bloco
const boa = primeiraQueCabe([[{ texto: "Terça é o dia com mais conversas: " }, enfase("34"), { texto: " em média." }]], "neutro", "poucos dias");
assert.equal(boa.tipo, "frase");
assert.equal(textoDaCabeca(boa), "Terça é o dia com mais conversas: 34 em média.");
assert.deepEqual(checarCabeca(boa), []);
// Longa demais, com jargão, comparando clínicas ou sem número em destaque: pula para a próxima; nenhuma passa, "Falta dado".
const longa = [{ texto: "x".repeat(80) }, enfase("12345678901")];
const jargao = [{ texto: "O CPL caiu para " }, enfase("R$ 4")];
const compara = [{ texto: "Melhor que 3 de 12 clínicas: " }, enfase("R$ 4")];
const semNumero = [{ texto: "Tudo certo neste bloco." }];
assert.equal(primeiraQueCabe([longa, jargao, compara, semNumero], "bom", "faltam dias medidos").tipo, "falta");
assert.equal(textoDaCabeca(primeiraQueCabe([null, undefined, longa], "bom", "faltam dias medidos")), "Falta dado: faltam dias medidos");
assert.equal(textoDaCabeca(primeiraQueCabe([jargao, [{ texto: "Custo por conversa: " }, enfase("R$ 4")]], "bom", "x")), "Custo por conversa: R$ 4");
// "Falta dado" nunca passa de 90 caracteres e nunca corta palavra no meio.
const falta = faltaDado("o motivo é muito comprido ".repeat(10));
assert.ok(textoDaCabeca(falta).length <= 90);
assert.match(textoDaCabeca(falta), /^Falta dado: .*…$/);
assert.deepEqual(checarCabeca(faltaDado("poucos dias com conversa.")), []);
assert.equal(textoDaCabeca(faltaDado("poucos dias com conversa.")), "Falta dado: poucos dias com conversa");

// números e regras genéricas (só medido; tudo zero ou pouco item = null)
assert.equal(vezes(47, 10), "4,7×");
assert.equal(vezes(10, 0), null);
assert.deepEqual(maiorItem([{ nome: "A", valor: 3 }, { nome: "B", valor: 9 }, { nome: "C", valor: null }]), { nome: "B", valor: 9, total: 12, media: 6, medidos: 2 });
assert.equal(maiorItem([{ nome: "A", valor: 3 }]), null, "um item só não tem maior");
assert.equal(maiorItem([{ nome: "A", valor: 0 }, { nome: "B", valor: 0 }]), null, "tudo zero não tem maior");
assert.deepEqual(menorItem([{ nome: "A", valor: 3 }, { nome: "B", valor: 1 }]), { nome: "B", valor: 1 });
assert.equal(diaDaSemana("2026-11-10"), "terça");
const semanas = Array.from({ length: 28 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 5 + i, 12));
  const iso = d.toISOString().slice(0, 10);
  return { dia: iso, valor: d.getUTCDay() === 2 ? 34 : 10 };
});
assert.deepEqual(melhorDiaDaSemana(semanas)?.dia, "terça");
assert.equal(Math.round(melhorDiaDaSemana(semanas)!.media), 34);
assert.equal(melhorDiaDaSemana(semanas.slice(0, 3)), null, "dias com 1 semana só não disputam");
assert.deepEqual(diaDePico([{ dia: "2026-11-01", valor: 2 }, { dia: "2026-11-02", valor: 9 }, { dia: "2026-11-03", valor: null }, { dia: "2026-11-04", valor: 1 }]), { dia: "2026-11-02", valor: 9, media: 4 });
assert.equal(diaDePico([{ dia: "2026-11-01", valor: 0 }, { dia: "2026-11-02", valor: 0 }, { dia: "2026-11-03", valor: 0 }]), null);
assert.deepEqual(piorPassagem([{ nome: "Chamaram", valor: 100 }, { nome: "Agendaram", valor: 40 }, { nome: "Atendido", valor: null }, { nome: "Fecharam", valor: 30 }]), { de: "Chamaram", para: "Agendaram", porCem: 40 });
assert.equal(piorPassagem([{ nome: "A", valor: 0 }, { nome: "B", valor: 0 }]), null);

// ---------------------------------------------------------------- fichas de número (o que o topo já diz)
assert.deepEqual(fichasDeNumero("R$ 33,33 por conversa: 17% mais barato que antes (R$ 40)."), ["R$33", "17%", "R$40"]);
assert.deepEqual(fichasDeNumero("▲ 20% · vs 75 antes"), ["20%", "75"]);
assert.deepEqual(fichasDeNumero("15/10 a 13/11, às 10h, 3 posts"), [], "data, hora e número pequeno não contam");
assert.deepEqual(fichasDeNumero("1.420 pessoas"), ["1420"]);

// ---------------------------------------------------------------- a leitura vira descoberta
const periodo = { de: "2026-10-15", ate: "2026-11-13", anterior: { de: "2026-09-15", ate: "2026-10-14" } };
const fato = (id: string, tom: Fato["tom"], peso: Fato["peso"], frase: string, exibicao: string, extra: Partial<Fato> = {}): Fato => ({ id, tom, peso, frase, numeros: [{ chave: id, exibicao }], ...extra });
const passo = (verbo: PassoFato["verbo"], texto: string, fatoId?: string, motivo?: string): PassoFato => ({ verbo, texto, quem: "gestor_trafego", fatoId, motivo });
const fatos: FatosDaTela = {
  tela: "anuncios",
  versaoRegras: 1,
  tipoPeriodo: "periodo",
  periodo,
  portao: { ok: true },
  fatos: [
    fato("conversas", "bom", 3, "As conversas iniciadas pelos anúncios subiram em relação ao período anterior.", "87 conversas (+20% contra o período anterior)"),
    fato("custo-mensagem", "bom", 2, "Cada conversa vinda das campanhas de mensagem custou R$ 20,00.", "R$ 1.740,00 em 87 conversas"),
    fato("concentracao", "atencao", 1, "Um só post concentrou 44% do alcance dos posts do período.", "44% do alcance"),
  ],
  proximoPasso: passo("revisar", "o público da campanha “Tráfego fictício”"),
  outrosPassos: [passo("conferir", "com a secretária quantas viraram consulta", "custo-mensagem", "Cada conversa custou R$ 20,00.")],
};
const doTopo: Descoberta = {
  id: "anuncios-custo-por-conversa",
  tom: "bom",
  selo: "Melhorou",
  frase: "Custo por conversa caiu 17%: de R$ 40 para R$ 33.",
  impacto: "R$ 40 → R$ 33 por conversa",
  acao: { rotulo: "Ver campanhas", local: "abrir-campanhas" },
  porque: { titulo: "x", barras: [{ rotulo: "Conversas", exibicao: "75 → 87", fracao: 1 }, { rotulo: "Investido", exibicao: "R$ 3.000", fracao: 1 }] },
};
assert.equal(periodoDoVerTudo(fatos), "15/10 a 13/11, comparado com 15/09 a 14/10");
assert.equal(periodoDoVerTudo(null), null);

const novas = descobertasDaLeitura({ fatos, descobertas: [doTopo], textoDoTopo: ["R$ 33 por conversa: 17% mais barato que no período anterior", "87"] });
// "O que aconteceu" (87 conversas) o topo já diz: não volta. "Por quê" (R$ 20,00) só a leitura dizia: vira descoberta com o passo que resolve.
assert.ok(!novas.some((d) => d.id === "leitura-conversas"), "o que o topo já diz não vira descoberta");
const custo = novas.find((d) => d.id === "leitura-custo-mensagem");
assert.ok(custo, "o fato que só a leitura dizia vira descoberta");
assert.equal(custo!.frase, "Cada conversa vinda das campanhas de mensagem custou R$ 20,00.");
assert.equal(custo!.acao.rotulo, "Conferir com a secretária quantas viraram consulta", "o passo do fato vira a ação da descoberta");
assert.equal(custo!.acao.local, ABRIR_VER_TUDO);
assert.equal(custo!.quem, "Gestor de tráfego");
assert.equal(custo!.impacto, "R$ 1.740,00 em 87 conversas");
// O próximo passo sem fato (o da campanha) vira descoberta própria, com selo e "Por quê?" honesto (Falta dado, nunca zero).
const daCampanha = novas.find((d) => d.selo === "Próximo passo");
assert.ok(daCampanha);
assert.equal(daCampanha!.frase, "Revisar o público da campanha “Tráfego fictício”.");
assert.ok(daCampanha!.porque.barras.every((b) => b.faltou && b.exibicao === "Falta dado"));
for (const d of novas) assert.deepEqual(checarDescoberta(d), [], `descoberta da leitura válida: ${d.id}`);

// A concentração (só a leitura dizia) vira descoberta com a barra da fatia e a do resto.
const comFatia = descobertasDaLeitura({ fatos: { ...fatos, fatos: [fatos.fatos[2], fatos.fatos[0]], proximoPasso: null, outrosPassos: [] }, descobertas: [], textoDoTopo: [] });
const fatia = comFatia.find((d) => d.id === "leitura-concentracao");
assert.ok(fatia);
assert.deepEqual(fatia!.porque.barras.map((b) => [b.exibicao, b.fracao]), [["44% do total", 0.44], ["56% do total", 0.56]]);

// O passo que uma descoberta de cima já manda fazer não volta; o fato marcado como já dito também não.
const semRepetir = descobertasDaLeitura({
  fatos,
  descobertas: [{ ...doTopo, acao: { rotulo: "Revisar o público da campanha “Tráfego fictício”", local: "abrir-campanhas" } }],
  textoDoTopo: ["87"],
  jaDitos: ["custo-mensagem"],
});
assert.ok(!semRepetir.some((d) => d.frase.startsWith("Revisar o público")), "passo que o topo já manda fazer não volta");
assert.ok(!semRepetir.some((d) => d.id === "leitura-custo-mensagem"), "fato já dito não volta");
// O passo de um fato já dito continua (é informação só da leitura), com o motivo como frase e o passo como ação.
const doPasso = semRepetir.find((d) => d.acao.rotulo === "Conferir com a secretária quantas viraram consulta");
assert.ok(doPasso);
assert.equal(doPasso!.frase, "Cada conversa custou R$ 20,00.");

// Uma tela pode levar a ação para um lugar melhor (rota de origem ou chave local).
const comLugar = descobertasDaLeitura({ fatos, descobertas: [], textoDoTopo: ["87"], acaoDoFato: (id) => (id === "custo-mensagem" ? { rotulo: "", local: "abrir-campanhas" } : null) });
assert.equal(comLugar.find((d) => d.id === "leitura-custo-mensagem")?.acao.local, "abrir-campanhas");

// Portão negado, sem fatos ou carregando: nenhuma (o veredito já diz "Falta dado: motivo").
assert.deepEqual(descobertasDaLeitura({ fatos: null, descobertas: [] }), []);
assert.deepEqual(descobertasDaLeitura({ fatos: { ...fatos, portao: { ok: false, codigo: "sem_dado", motivo: "não há dado", passo: passo("conferir", "a conexão das fontes") } }, descobertas: [] }), []);

// ---------------------------------------------------------------- juntar por impacto
const d = (id: string, tom: Descoberta["tom"]): Descoberta => ({ ...doTopo, id, tom });
assert.deepEqual(juntarDescobertas([d("a", "atencao"), d("b", "bom")], [d("x", "ruim"), d("y", "bom"), d("z", "neutro")]).map((x) => x.id), ["x", "a", "b", "y", "z"], "a da leitura mais grave sobe; no mesmo tom fica depois");
assert.deepEqual(juntarDescobertas([d("b", "bom"), d("a", "atencao")], []).map((x) => x.id), ["b", "a"], "a ordem da regra da tela não muda");
assert.deepEqual(juntarDescobertas([d("a", "bom")], [d("a", "ruim")]).map((x) => x.id), ["a"], "id repetido não entra duas vezes");

console.log("test-ver-tudo-base: ok");
