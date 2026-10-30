import assert from "node:assert/strict";
import { chaveTema, normalizarTemas, rotuloDoTema, temaRelacionado } from "../src/lib/classificacao-post";
import { computeProximosAngulos, computeRepetirOuRevisar, computeTopPorTaxaDeCompartilhamento, computeTopReelsPorTaxaDeCompartilhamento } from "../src/lib/report-metrics";
import { analyzeFormatsAndTemas, ideiasDeIdentificacao } from "../src/lib/hub-conteudo";
import { gastoPorDia, temaForteDosPosts } from "../src/lib/campanhas";

// Chave única do tema: acento, maiúscula e espaço não separam o mesmo assunto.
assert.equal(chaveTema("Autoridade e marca médica"), chaveTema("autoridade  e Marca medica"));
assert.equal(chaveTema(" Consultório e relação com paciente "), "consultorio e relacao com paciente");
assert.equal(chaveTema("null"), "");
assert.equal(chaveTema(null), "");
assert.equal(rotuloDoTema(["Autoridade e marca medica", "Autoridade e marca médica"]), "Autoridade e marca médica", "no empate, a grafia com acento");
assert.equal(rotuloDoTema(["A b", "A b", "Á b"]), "A b", "a grafia mais usada vence");
const unificados = normalizarTemas([{ tema: "Autoridade e marca médica" }, { tema: "Autoridade e marca medica" }, { tema: "Autoridade e marca médica" }, { tema: "undefined" }]);
assert.deepEqual(unificados.map((p) => p.tema), ["Autoridade e marca médica", "Autoridade e marca médica", "Autoridade e marca médica", null]);
// Tema parecido: um dentro do outro como expressão inteira.
assert.ok(temaRelacionado("Menopausa", "Mudanças na menopausa"));
assert.ok(temaRelacionado("IA para conteúdo", "Prompts e IA para conteudo"));
assert.ok(!temaRelacionado("Menopausa", "Ansiedade e perimenopausa"), "palavra diferente não casa");
assert.ok(!temaRelacionado("Pele", "Sono"));

// Posts sintéticos: tema, formato, alcance, salvos, engajamento.
let seq = 0;
const post = (tema: string | null, format: string, reach: number, saved: number, engagement = saved * 2, shares = 0) => ({ id: `p${++seq}`, tema, format, reach, saved, engagement, shares });
const repete = (n: number, f: (i: number) => ReturnType<typeof post>) => Array.from({ length: n }, (_, i) => f(i));

// Analisar desempenho: grafias juntas num tema só.
const fm = analyzeFormatsAndTemas([...repete(10, () => post("Autoridade e marca médica", "reels", 1000, 5)), ...repete(9, () => post("Autoridade e marca medica", "reels", 1000, 5)), post("Saúde emocional", "reels", 367477, 50)]);
assert.equal(fm.porTema.find((t) => t.key.startsWith("Autoridade"))!.count, 19);
assert.equal(fm.porTema.filter((t) => t.key.startsWith("Autoridade")).length, 1);

// O que repetir: com um tema só não compara com ele mesmo; com 3+ temas, compara com o post típico da conta.
const umTema = computeRepetirOuRevisar([...repete(11, () => post("Mudanças hormonais", "reels", 1000, 1, 50)), ...repete(20, () => post("Outro", "reels", 1000, 1, 10)).map((p, i) => ({ ...p, tema: `Solto ${i}` }))]);
assert.equal(umTema.hasEnough, false);
assert.equal(umTema.temasComAmostra, 1);
const tres = computeRepetirOuRevisar([...repete(8, () => post("A", "reels", 1000, 1, 80)), ...repete(8, () => post("B", "reels", 1000, 1, 60)), ...repete(8, () => post("C", "reels", 1000, 1, 70)), ...repete(30, (i) => post(`D${i}`, "reels", 1000, 1, 10))]);
assert.equal(tres.hasEnough, true);
assert.deepEqual(tres.repetir.map((g) => g.tema), ["A", "C", "B"], "todos acima do post típico da conta (1%)");
assert.equal(tres.revisar.length, 0);

// Próximos ângulos: mediana e mínimo de 5 posts; um viral com 2 posts não vira sugestão.
const angulos = computeProximosAngulos([post("Suplementos", "reels", 1000, 1), post("Suplementos", "reels", 1000, 455), ...repete(6, () => post("Sono", "carrossel", 1000, 40)), ...repete(10, (i) => post(`Outro ${i}`, "reels", 1000, 5))]);
assert.deepEqual(angulos.angulos.map((a) => a.tema), ["Sono"]);
assert.equal(angulos.angulos[0].medianSaved, 40);
assert.equal(angulos.angulos[0].formato, "carrossel");
assert.equal(computeProximosAngulos([post("Suplementos", "reels", 1000, 1), post("Suplementos", "reels", 1000, 455)]).angulos.length, 0);

// Compartilhamentos em todos os formatos; o PDF continua só com reels.
const comp = [post("x", "estatico", 1000, 0, 0, 300), post("x", "carrossel", 1000, 0, 0, 100), post("x", "reels", 1000, 0, 0, 10)];
assert.deepEqual(computeTopPorTaxaDeCompartilhamento(comp, 5).map((r) => r.post.format), ["estatico", "carrossel", "reels"]);
assert.deepEqual(computeTopReelsPorTaxaDeCompartilhamento(comp, 5).map((r) => r.post.format), ["reels"]);

// Tema forte da campanha: 8 posts por tema, como o resto do painel.
const forte = temaForteDosPosts([...repete(2, () => post("Viral", "reels", 1000, 500)), ...repete(8, () => post("Menopausa", "reels", 1000, 30)), ...repete(8, () => post("Sono", "reels", 1000, 10))]);
assert.equal(forte?.tema, "Menopausa");
assert.equal(forte?.formato, "Reels");
assert.equal(temaForteDosPosts([...repete(9, (i) => post(`T${i}`, "reels", 1000, 5))])?.tema, null, "sem tema com 8 posts, não cita tema");
assert.equal(gastoPorDia(3100, "2026-09-30", "2026-10-30"), 100, "30 dias atrás até hoje são 31 dias");

// Tema que gera identificação: grafias do mesmo tema somam pessoas.
const coment = (i: number, tema: string) => ({ id: `c${i}`, text: "Passei exatamente por isso na menopausa, obrigada por falar disso", author_username: `pessoa${i}`, instagram_posts: { tema } });
const ident = ideiasDeIdentificacao([coment(1, "Menopausa e sono"), coment(2, "menopausa e sono"), coment(3, "Menopausa e Sono")]);
assert.equal(ident.ideias.length, 1, "3 pessoas no mesmo tema, mesmo com grafias diferentes");
console.log("test-tema-unico: ok");
