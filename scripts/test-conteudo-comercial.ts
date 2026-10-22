import assert from "node:assert/strict";
import { conclusoes, conclusoesProfundas, type DadosCruzamento, type DadosProfundos } from "../src/lib/conteudo-comercial";

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

// Cruzamentos profundos.
const vazio: DadosProfundos = { posts_compra: [], comentarios: { total: 0, compra: 0, posts_com_compra: 0 }, compra_por_formato: [], temas_valor: [], resposta: [], resposta_tema: [], cobertura: { conversas: 0, com_lead: 0, com_tema: 0, horario_comercial: 0 } };
assert.match(conclusoesProfundas(vazio)[0].titulo, /CRM não tem vendas/);
const post = { post_id: "p", comentarios: 500, compra: 14, preco: 2, agendar: 6, onde: 0, convenio: 4, contato: 5, permalink: null, thumbnail_url: null, legenda: "", tema: "Menopausa", formato: "reels", posted_at: "2026-10-01" };
const cp = conclusoesProfundas({ ...vazio, posts_compra: [post], comentarios: { total: 2971, compra: 70, posts_com_compra: 32 } });
assert.match(cp[0].titulo, /70 comentários/);
assert.match(cp[0].texto, /reels de tema "Menopausa"/);
// Tema × valor: abaixo do mínimo não elege tema; acima, cita receita e ticket.
assert.match(conclusoesProfundas({ ...vazio, temas_valor: [{ tema: "Catarata", conversas: 50, com_lead: 40, ganhos: 3, perdidos: 1, ganhos_com_valor: 3, receita: 9000 }] })[0].titulo, /Ainda não dá/);
const tv = conclusoesProfundas({ ...vazio, temas_valor: [{ tema: "Catarata", conversas: 50, com_lead: 40, ganhos: 10, perdidos: 5, ganhos_com_valor: 10, receita: 50000 }, { tema: "Miopia", conversas: 80, com_lead: 70, ganhos: 20, perdidos: 5, ganhos_com_valor: 20, receita: 30000 }] })[0];
assert.match(tv.titulo, /"Catarata" é o tema que mais fatura/);
assert.match(tv.texto, /R\$\s?5\.000/);
// Resposta: rápida agenda mais → atenção com ação; sem resposta alta vira alerta.
const r = conclusoesProfundas({ ...vazio, cobertura: { conversas: 1000, com_lead: 900, com_tema: 100, horario_comercial: 700 }, resposta: [
  { faixa: "1_ate_15min", conversas: 400, agendaram: 40 }, { faixa: "3_1_a_4h", conversas: 100, agendaram: 4 }, { faixa: "4_mais_de_4h", conversas: 50, agendaram: 2 }, { faixa: "5_sem_resposta", conversas: 150, agendaram: 3 }] });
assert.ok(r.some((x) => /até 15 min agenda 10%; depois de 1 hora, 4%/.test(x.titulo)));
assert.ok(r.some((x) => /21% das conversas em horário comercial sem resposta/.test(x.titulo)));
console.log("conteudo-comercial profundo ok");
