// Contrato das telas no formato 5 segundos (Phase 03.1.1.1, plano 01): variação contra o próprio histórico, guardas de frase
// (90 caracteres, jargão, nunca comparar uma clínica com outras, D-02), "visíveis e resto" e o veredito de reserva.
// Só dados fictícios: nenhum número, nome ou legenda dos pilotos entra aqui.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-cinco-segundos.ts
import assert from "node:assert/strict";
import { ROTULO_RESPONSAVEL } from "../src/lib/insight";
import { GUARDA_DE_TEXTO_DA_HOJE, GUARDA_DE_TEXTO_DA_TELA_HOJE, checarTextoDaHoje } from "../src/lib/leitura/fatos-hoje";
import { montarTexto } from "../src/lib/leitura/texto";
import type { Fato, FatosDaTela, PassoFato } from "../src/lib/leitura/tipos";
import {
  GUARDA_SEM_COMPARAR_CLINICAS,
  VERSAO_REGRAS_CINCO,
  barrasDoPorque,
  checarDescoberta,
  checarFraseCinco,
  textoDaFrase,
  variacaoPropria,
  vereditoDosFatos,
  visiveisEResto,
  type Descoberta,
} from "../src/lib/leitura/cinco-segundos";

assert.equal(VERSAO_REGRAS_CINCO, 1);

// ---------------------------------------------------------------- variação só contra a própria clínica
assert.deepEqual(variacaoPropria(120, 100), { pct: 20, sinal: "▲", texto: "▲ 20%", melhor: true });
assert.deepEqual(variacaoPropria(80, 100), { pct: -20, sinal: "▼", texto: "▼ 20%", melhor: false });
// Quando menos é melhor (custo, espera), cair é bom, e o sinal continua mostrando a direção do número.
const custo = variacaoPropria(80, 100, { menorEhMelhor: true });
assert.equal(custo?.melhor, true);
assert.equal(custo?.sinal, "▼");
assert.equal(variacaoPropria(120, 100, { menorEhMelhor: true })?.melhor, false);
// Abaixo de 3% é "igual", nunca bom nem ruim.
assert.deepEqual(variacaoPropria(102, 100), { pct: 2, sinal: "=", texto: "= igual", melhor: null });
assert.deepEqual(variacaoPropria(98, 100), { pct: -2, sinal: "=", texto: "= igual", melhor: null });
assert.equal(variacaoPropria(103, 100)?.sinal, "▲");
// Sem comparação possível, nunca um 0% de mentira.
assert.equal(variacaoPropria(10, null), null);
assert.equal(variacaoPropria(10, undefined), null);
assert.equal(variacaoPropria(10, 0), null);
assert.equal(variacaoPropria(null, 10), null);
assert.equal(variacaoPropria(10, 4, { baseMinima: 5 }), null, "base anterior abaixo do mínimo não compara");
assert.equal(variacaoPropria(10, 5, { baseMinima: 5 })?.pct, 100);

// ---------------------------------------------------------------- frase: tamanho, jargão e D-02
assert.deepEqual(checarFraseCinco("Chegaram 62% mais conversas, mas os fechados caíram 50%."), []);
assert.deepEqual(checarFraseCinco("3 clínicas precisam de você hoje"), []);
assert.deepEqual(checarFraseCinco("Virou lead: 40 pessoas esperam atendimento."), [], "lead continua permitido (nome da etapa do funil)");
assert.ok(checarFraseCinco("a".repeat(91)).length > 0, "mais de 90 caracteres reprova");
assert.deepEqual(checarFraseCinco("a".repeat(90)), []);
assert.deepEqual(checarFraseCinco("a".repeat(100), 120), [], "o limite pode ser passado");
assert.ok(checarFraseCinco("A mediana do alcance subiu 10%.").length > 0, "jargão da Hoje reprova");
assert.ok(checarFraseCinco("O CPL caiu 10%.").length > 0);
for (const frase of [
  "Você está melhor que 3 de 12 clínicas.",
  "Sua taxa está acima da média da carteira.",
  "Acima da mediana da carteira em 10%.",
  "Você passou a média das clínicas.",
  "Outras clínicas fecham mais.",
  "Veja as clínicas parecidas com a sua.",
  "Você está no ranking das melhores.",
  "Você está entre as 25% melhores.",
  "Posição 3 de 12 na carteira.",
  "Pior que 4 de 10 clínicas.",
]) {
  assert.match(frase, GUARDA_SEM_COMPARAR_CLINICAS, `D-02 deveria pegar: ${frase}`);
  assert.ok(checarFraseCinco(frase).length > 0, `checarFraseCinco deveria reprovar: ${frase}`);
}
for (const frase of ["Seguidores novos: 120 contra 100 no período anterior.", "3 clínicas precisam de você hoje", "Melhor dia da clínica: terça."]) {
  assert.doesNotMatch(frase, GUARDA_SEM_COMPARAR_CLINICAS, `não deveria pegar: ${frase}`);
}
assert.ok(checarFraseCinco("Você vai fechar 10 pacientes a mais.").length > 0, "promessa e projeção não entram");
assert.ok(checarFraseCinco("~10 a mais se você responder rápido.").length > 0);

// ---------------------------------------------------------------- visíveis e resto
assert.deepEqual(visiveisEResto(["a", "b", "c", "d", "e"], 3), { visiveis: ["a", "b", "c"], resto: ["d", "e"] });
assert.deepEqual(visiveisEResto(["a", "b"]), { visiveis: ["a", "b"], resto: [] });
assert.deepEqual(visiveisEResto([] as string[], 3), { visiveis: [], resto: [] });
assert.deepEqual(visiveisEResto(["a", "b", "c", "d"]), { visiveis: ["a", "b", "c"], resto: ["d"] }, "o padrão é 3");

// ---------------------------------------------------------------- o texto de uma frase em partes
assert.equal(textoDaFrase([{ texto: "Chegaram " }, { texto: "62%", enfase: "numero" }, { texto: " mais conversas." }]), "Chegaram 62% mais conversas.");

// ---------------------------------------------------------------- veredito de reserva a partir dos fatos
const PASSO: PassoFato = { verbo: "conferir", texto: "a conexão do Instagram", quem: "equipe_hub" };
const fato = (id: string, tom: Fato["tom"], frase: string, exibicao: string, extra: Partial<Fato> = {}): Fato => ({
  id, tom, peso: 3, frase, numeros: [{ chave: id, exibicao }], ...extra,
});
const base = (fatos: Fato[], portao: FatosDaTela["portao"] = { ok: true }): FatosDaTela => ({
  tela: "hoje",
  versaoRegras: 1,
  tipoPeriodo: "periodo",
  periodo: { de: "2026-10-01", ate: "2026-10-30", anterior: { de: "2026-09-01", ate: "2026-09-30" } },
  portao,
  fatos,
  proximoPasso: null,
  outrosPassos: [],
});

// Portão negado: o mesmo motivo e o mesmo passo de montarTexto, sem frase de conclusão.
const negado = base([], { ok: false, codigo: "fonte_parada", motivo: "o Instagram está sem dado novo desde 25/10", passo: PASSO });
const deNegado = vereditoDosFatos(negado);
assert.equal(deNegado?.tipo, "sem_leitura");
const textoNegado = montarTexto(negado);
assert.equal(textoNegado.tipo, "sem_leitura");
if (deNegado?.tipo === "sem_leitura" && textoNegado.tipo === "sem_leitura") {
  assert.equal(deNegado.motivo, textoNegado.motivo);
  assert.deepEqual(deNegado.passo, textoNegado.passo);
  assert.equal(deNegado.passo.rotuloQuem, ROTULO_RESPONSAVEL.equipe_hub);
}
assert.equal(vereditoDosFatos(null), null);

// Portão ok: a palavra vem do tom do fato e a frase tem até 90 caracteres, com o número em destaque.
const bom = vereditoDosFatos(base([fato("a", "bom", "As conversas subiram 20% contra o período anterior.", "+20% de conversas")]));
assert.equal(bom?.tipo, "veredito");
if (bom?.tipo === "veredito") {
  assert.equal(bom.palavra, "Bom");
  assert.equal(bom.tom, "bom");
  assert.ok(textoDaFrase(bom.frase).length <= 90);
  assert.ok(bom.frase.some((p) => p.enfase === "numero"), "o número vai em destaque");
  assert.deepEqual(checarFraseCinco(textoDaFrase(bom.frase)), []);
}
const ruim = vereditoDosFatos(base([fato("b", "ruim", "Os pacientes que fecharam caíram 50% contra o período anterior.", "-50% de fechados")]));
assert.equal(ruim?.tipo === "veredito" ? ruim.palavra : null, "Ruim");
const atencao = vereditoDosFatos(base([fato("c", "atencao", "O Instagram ficou 3 dias sem publicar nada novo.", "3 dias")]));
assert.equal(atencao?.tipo === "veredito" ? atencao.palavra : null, "Atenção");

// Frase longa é cortada na primeira oração ou, sem ela, na fronteira de uma palavra, e nunca passa de 90.
const longa = vereditoDosFatos(
  base([fato("d", "ruim", "Chegaram 62% mais conversas no período, mas os pacientes que fecharam caíram pela metade em relação ao período anterior da clínica.", "+62% de conversas")]),
);
assert.equal(longa?.tipo, "veredito");
if (longa?.tipo === "veredito") {
  const t = textoDaFrase(longa.frase);
  assert.ok(t.length <= 90, `frase de ${t.length} caracteres`);
  assert.ok(!/\s$/.test(t));
  assert.deepEqual(checarFraseCinco(t), []);
}

// Fato que cita clínicas de fora nunca vira veredito (D-02), e a guarda extra da tela também vale.
const comparando = vereditoDosFatos(base([fato("e", "ruim", "A clínica está pior que 4 de 10 outras clínicas.", "4 de 10")]));
assert.equal(comparando?.tipo, "sem_leitura", "sem outra frase aproveitável o veredito diz Falta dado");
const comGuardaExtra = vereditoDosFatos(
  base([
    fato("f", "ruim", "Os pacientes que chamaram caíram 30% contra o período anterior.", "-30%"),
    fato("g", "atencao", "O Instagram ficou 3 dias sem publicar nada novo.", "3 dias", { peso: 2 }),
  ]),
  /chamaram/i,
);
assert.equal(comGuardaExtra?.tipo, "veredito");
if (comGuardaExtra?.tipo === "veredito") assert.equal(comGuardaExtra.palavra, "Atenção", "a guarda extra pula o fato que a viola");

// ---------------------------------------------------------------- barras do "Por quê?"
const medida = barrasDoPorque(undefined, { rotulo: "Posts no período", exibicao: "30 posts" });
assert.ok(medida.length >= 2 && medida.length <= 3, "de 2 a 3 fatores");
assert.equal(medida[0].faltou, undefined);
assert.ok(medida.slice(1).every((b) => b.faltou === true && b.exibicao === "Falta dado" && b.fracao === 0), "o que falta é barra listrada com Falta dado");
assert.equal(new Set(medida.map((b) => b.rotulo)).size, medida.length, "rótulos únicos (a barra usa o rótulo como chave)");
const completa = barrasDoPorque([
  { rotulo: "Agora", exibicao: "10", fracao: 1 },
  { rotulo: "Antes", exibicao: "8", fracao: 0.8 },
  { rotulo: "Meta", exibicao: "12", fracao: 1 },
  { rotulo: "Extra", exibicao: "1", fracao: 0.1 },
]);
assert.equal(completa.length, 3, "no máximo 3 fatores");
assert.equal(barrasDoPorque([{ rotulo: "Só uma", exibicao: "5", fracao: 1 }]).length, 2, "uma barra medida completa com uma listrada");
assert.equal(barrasDoPorque(undefined).length, 2, "sem nada medido, só barras listradas");
assert.ok(barrasDoPorque(undefined).every((b) => b.faltou));

// ---------------------------------------------------------------- uma descoberta bem formada
const descoberta: Descoberta = {
  id: "x",
  tom: "ruim",
  selo: "Em queda",
  frase: "Só 30% dos atendidos agendam. Antes eram 40%.",
  quem: "Equipe da clínica",
  impacto: "30% dos atendidos",
  acao: { rotulo: "Conferir a agenda", rota: "/_authenticated/$clientId/pacientes" },
  porque: { titulo: "O que explica", barras: barrasDoPorque(undefined, { rotulo: "Atendidos que agendaram", exibicao: "30%" }), obs: "Comparado com a própria clínica no período anterior." },
};
assert.deepEqual(checarDescoberta(descoberta), []);
assert.ok(checarDescoberta({ ...descoberta, selo: "x".repeat(25) }).length > 0, "selo de até 24 caracteres");
assert.ok(checarDescoberta({ ...descoberta, frase: "x".repeat(91) }).length > 0, "frase de até 90 caracteres");
assert.ok(checarDescoberta({ ...descoberta, impacto: "x".repeat(41) }).length > 0, "impacto de até 40 caracteres");
assert.ok(checarDescoberta({ ...descoberta, impacto: "~12 a mais se você mudar" }).length > 0, "impacto nunca é projeção");
assert.ok(checarDescoberta({ ...descoberta, porque: { ...descoberta.porque, obs: "x".repeat(91) } }).length > 0, "obs de até 90 caracteres");
assert.ok(checarDescoberta({ ...descoberta, porque: { ...descoberta.porque, barras: descoberta.porque.barras.slice(0, 1) } }).length > 0, "de 2 a 3 fatores");
assert.ok(checarDescoberta({ ...descoberta, frase: "Você está no ranking das melhores." }).length > 0, "D-02 também vale na descoberta");

// ---------------------------------------------------------------- A-01: o texto da PÁGINA Hoje libera só Agendaram e Fecharam
for (const liberada of ["Agendaram", "agendaram 30 pessoas", "Fecharam", "fecharam menos", "Fechou", "Etapa Agendou"]) {
  assert.doesNotMatch(liberada, GUARDA_DE_TEXTO_DA_TELA_HOJE, `A-01 libera: ${liberada}`);
}
for (const barrada of ["chamaram", "Chamaram 120 pessoas", "Compareceram", "compareceram no mês", "Os pacientes foram à consulta", "Os pacientes foram a consulta", "foram na consulta"]) {
  assert.match(barrada, GUARDA_DE_TEXTO_DA_TELA_HOJE, `A-01 segue barrando: ${barrada}`);
}
// A guarda das AÇÕES não muda: continua pegando os 4 números da Phase 9 (a regra de ações segue como era).
for (const palavra of ["agendaram", "fecharam", "chamaram", "compareceram"]) {
  assert.match(palavra, GUARDA_DE_TEXTO_DA_HOJE, `a guarda das ações segue pegando: ${palavra}`);
  assert.ok(checarTextoDaHoje(`Os pacientes ${palavra} no mês.`).length > 0, `checarTextoDaHoje segue reprovando: ${palavra}`);
}
assert.equal(GUARDA_DE_TEXTO_DA_HOJE.source, String.raw`\b(agendaram|fecharam|chamaram|compareceram)\b|foram (a|à|na) consulta`);

console.log("test-cinco-segundos: ok");
