import assert from "node:assert/strict";
import { conclusoes, type DadosCruzamento } from "../src/lib/conteudo-comercial";

const base: DadosCruzamento = { efeito_post: null, grade: [], temas: [], objecoes: [] };

// Sem amostra: não conclui nada sobre postar.
assert.match(conclusoes(base)[0].titulo, /Ainda não dá/);
assert.equal(conclusoes(base).length, 1);

// Dia com post melhor.
const mais = conclusoes({ ...base, efeito_post: { dias_com_post: 10, media_com_post: 6, dias_sem_post: 8, media_sem_post: 4 } })[0];
assert.match(mais.titulo, /50% mais/);
assert.equal(mais.tom, "bom");
// Diferença pequena é neutra.
assert.match(conclusoes({ ...base, efeito_post: { dias_com_post: 10, media_com_post: 4.2, dias_sem_post: 8, media_sem_post: 4 } })[0].titulo, /não mudou/);
// Menos conversas com post.
assert.equal(conclusoes({ ...base, efeito_post: { dias_com_post: 10, media_com_post: 2, dias_sem_post: 8, media_sem_post: 4 } })[0].tom, "atencao");

// Temas: o que mais converte exige amostra mínima; pauta pronta; conteúdo sem conversa.
const t = (tema: string, posts: number, conversas: number, agendaram: number) => ({ tema, posts, alcance: 0, conversas, comerciais: conversas, pediram_preco: 0, agendaram });
const c = conclusoes({ ...base, temas: [t("Menopausa", 1, 10, 5), t("Sono", 3, 4, 4), t("Canetas", 0, 6, 1), t("Pele", 4, 0, 0), t("null", 0, 50, 50)] });
const titulos = c.map((x) => x.titulo).join(" | ");
assert.match(titulos, /"Menopausa" é o assunto que mais vira agendamento/, "Sono tem 100% mas só 4 conversas");
assert.ok(c.find((x) => x.titulo.includes("Menopausa"))?.acao, "pouco post num tema que converte vira ação");
assert.match(c.find((x) => x.titulo.includes("não tiveram post"))!.texto, /Canetas \(6\)/);
assert.match(titulos, /"Pele" teve 4 posts e nenhuma conversa/);
assert.ok(!titulos.includes("null"), "tema não identificado não vira conclusão");

// Horário: posts fora do pico pedem ação.
const grade = [{ dow: 1, hora: 20, posts: 0, conversas: 30, agendaram: 5 }, { dow: 3, hora: 9, posts: 10, conversas: 1, agendaram: 0 }];
const h = conclusoes({ ...base, grade }).find((x) => x.titulo.startsWith("Pico"))!;
assert.match(h.titulo, /segunda às 20h/);
assert.equal(h.tom, "atencao");

// Objeção: ignora "outro" e cita a regra do CFM.
const o = conclusoes({ ...base, objecoes: [{ objecao: "outro", n: 9, agendaram: 0 }, { objecao: "preco", n: 4, agendaram: 1 }] }).find((x) => x.titulo.includes("objeção"))!;
assert.match(o.titulo, /preço/);
assert.match(o.acao ?? "", /CFM/);
console.log("conteudo-comercial ok");
