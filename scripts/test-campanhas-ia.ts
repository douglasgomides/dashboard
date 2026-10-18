import assert from "node:assert/strict";
import { ferirCFM, validarIdeias } from "../src/lib/campanhas-ia";

// CFM: preço, desconto, promoção, grátis, brinde, antes e depois e garantia barrados; texto de cuidado passa.
assert.equal(ferirCFM("Avaliação por R$ 199"), "preço");
assert.equal(ferirCFM("20% de desconto no pacote"), "desconto");
assert.equal(ferirCFM("Promoção de outubro"), "promoção");
assert.equal(ferirCFM("Primeira consulta gratuita"), "grátis ou cortesia");
assert.equal(ferirCFM("Sorteio de uma sessão"), "brinde, sorteio, cupom ou presente");
assert.equal(ferirCFM("Veja o antes e depois"), "antes e depois");
assert.equal(ferirCFM("Resultado garantido em 30 dias"), "garantia de resultado");
assert.equal(ferirCFM("Black Friday da pele"), "apelo comercial");
assert.equal(ferirCFM("A médica esteja presente em todas as etapas"), null);
assert.equal(ferirCFM("Programa de acompanhamento da menopausa com 3 consultas e plano por escrito"), null);

const base = { publico: "Mulheres de 45 a 60 anos que perguntaram sobre menopausa", porque: "Menopausa aparece em 18% das conversas", evidencias: ["18% das conversas citam menopausa (n = 240)"], passos: ["Montar o programa com a médica", "Treinar a secretária"], metrica: "Agendamentos do programa", esforco: "medio", prazo_dias: 30 };
const bruto = {
  ideias: [
    { ...base, tipo: "pacote", titulo: "Programa Menopausa sem Mistério", oferta: "3 consultas em 6 meses, exames de rotina e plano por escrito", brain: ["audiencia.duvida_menopausa", "inventada.chave"], mensagem: "Olá, [nome]! Muitas pacientes perguntam sobre..." },
    { ...base, tipo: "pacote", titulo: "Pacote sem descrição do que inclui" },
    { ...base, tipo: "captacao", titulo: "Consulta com 30% de desconto" },
    { ...base, tipo: "reativacao", titulo: "Reativar quem pediu preço", mensagem: "Me chama no (11) 98888-7777" },
    { ...base, tipo: "conteudo", titulo: "Série sem evidência nenhuma", evidencias: [], brain: [] },
    { ...base, tipo: "marketing", titulo: "Tipo que não existe aqui" },
    { ...base, tipo: "retorno", titulo: "programa menopausa sem misterio!" },
    { ...base, tipo: "anuncio", titulo: "Ideia que já foi proposta antes" },
  ],
};
const { ok, descartes } = validarIdeias(bruto, ["audiencia.duvida_menopausa"], ["Ideia que já foi proposta antes"]);
assert.deepEqual(ok.map((i) => i.titulo), ["Programa Menopausa sem Mistério"]);
assert.deepEqual(ok[0].brain, ["audiencia.duvida_menopausa"]);
assert.equal(descartes.length, 7);
for (const motivo of [/sem descrição/, /CFM \(desconto\)/, /dado pessoal/, /sem evidência/, /tipo inválido/, /repetida/]) assert.ok(descartes.some((d) => motivo.test(d)), String(motivo));
assert.equal(validarIdeias({ nada: 1 }, []).ok.length, 0);
console.log("ok");
