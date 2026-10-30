import assert from "node:assert/strict";
import { conclusoes, conclusoesProfundas, efeitoPorDiaDaSemana, recortarPeriodo, temasSemPost, juntarTemas, type DadosCruzamento, type DadosProfundos, type DiaCruzamento } from "../src/lib/conteudo-comercial";

const base: DadosCruzamento = { dias: [], grade: [], temas: [], objecoes: [] };

// Sem amostra: não conclui nada sobre postar.
assert.match(conclusoes(base)[0].titulo, /Ainda não dá/);
assert.equal(conclusoes(base).length, 1);

// Série de 4 semanas (05/10/2026 é segunda). conv(dow, comPost) define as conversas do dia.
const serie = (posta: (dow: number, semana: number) => boolean, conv: (dow: number, comPost: boolean) => number): DiaCruzamento[] =>
  Array.from({ length: 28 }, (_, i) => {
    const dia = new Date(Date.UTC(2026, 9, 5 + i, 12)).toISOString().slice(0, 10);
    const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
    const comPost = posta(dow, Math.floor(i / 7));
    return { dia, posts: comPost ? 1 : 0, conversas: conv(dow, comPost) };
  });
const fds = (dow: number) => dow === 0 || dow === 6;

// Caso Dra. Marcella: posta todo dia útil e nunca no fim de semana; o fim de semana tem pouca conversa com ou sem post.
// Antes: "Dia com post tem 1186% mais conversas". Agora: não há dia equivalente para comparar, então não conclui.
const marcella = serie((dow) => !fds(dow), (dow) => (fds(dow) ? 3 : 37));
const cm = conclusoes({ ...base, dias: marcella })[0];
assert.match(cm.titulo, /Ainda não dá/);
assert.match(cm.texto, /sábado ou no domingo/);
assert.equal(efeitoPorDiaDaSemana(marcella).diasCom, 0);

// Mesmo dia da semana com e sem post: segundas e quartas alternam; o post soma 50% no mesmo dia.
const alterna = serie((dow, semana) => !fds(dow) && (semana + dow) % 2 === 0, (dow, comPost) => (fds(dow) ? 2 : comPost ? 6 : 4));
const mais = conclusoes({ ...base, dias: alterna })[0];
assert.match(mais.titulo, /50% mais conversas que o mesmo dia da semana sem post/);
assert.equal(mais.tom, "bom");
// Diferença pequena é neutra; menos conversas com post é atenção.
assert.match(conclusoes({ ...base, dias: serie((dow, s) => !fds(dow) && (s + dow) % 2 === 0, (dow, c) => (c ? 4.2 : 4)) })[0].titulo, /não mudou/);
assert.equal(conclusoes({ ...base, dias: serie((dow, s) => !fds(dow) && (s + dow) % 2 === 0, (dow, c) => (c ? 2 : 4)) })[0].tom, "atencao");
// Fim de semana fraco sem post não infla o efeito: só os dias úteis entram na comparação.
const comFds = serie((dow, s) => !fds(dow) && (s + dow) % 2 === 0, (dow, c) => (fds(dow) ? 0 : c ? 5 : 5));
assert.match(conclusoes({ ...base, dias: comFds })[0].titulo, /não mudou/);

// Período maior que 120 dias: corta nos últimos 120.
assert.deepEqual(recortarPeriodo("2026-05-01", "2026-10-30"), { start: "2026-07-02", end: "2026-10-30", cortado: true });
assert.deepEqual(recortarPeriodo("2026-10-01", "2026-10-30"), { start: "2026-10-01", end: "2026-10-30", cortado: false });

// Tema: mesma chave junta acento e maiúscula; tema parecido já postado não vira "não teve post".
const tm = (tema: string, posts: number, conversas: number, pessoas?: number) => ({ tema, posts, alcance: 0, conversas, pessoas, comerciais: 0, pediram_preco: 0, agendaram: 0 });
const juntos = juntarTemas([tm("Autoridade e marca médica", 10, 0), tm("Autoridade e marca medica", 9, 1, 1), tm("Consultório e relação com paciente", 0, 6, 5), tm("Consultorio e relacao com paciente", 9, 0)]);
assert.equal(juntos.length, 2);
assert.equal(juntos.find((t) => t.tema.startsWith("Autoridade"))!.posts, 19);
assert.equal(juntos.find((t) => t.tema.startsWith("Autoridade"))!.tema, "Autoridade e marca médica");
assert.equal(juntos.find((t) => t.tema.startsWith("Consult"))!.posts, 9);
const semPost = temasSemPost([tm("Menopausa", 0, 22, 20), tm("Mudanças na menopausa", 4, 0), tm("IA para conteúdo", 0, 8, 8), tm("Prompts e IA para conteudo", 62, 1), tm("Canetas", 0, 6, 5)]);
assert.deepEqual(semPost.map((t) => t.tema), ["Canetas"], "Menopausa e IA para conteúdo já tiveram post com outro nome");
const pauta = conclusoes({ ...base, temas: [tm("Menopausa", 0, 22, 20), tm("Mudanças na menopausa", 4, 0), tm("Canetas", 0, 6, 5)] }).find((x) => x.titulo.includes("não tiveram post"))!;
assert.match(pauta.texto, /Canetas \(5\)/, "conta pessoas, não conversas");
assert.ok(!pauta.texto.includes("Menopausa"));

// Temas: o que mais converte exige amostra mínima; pauta pronta; conteúdo sem conversa.
const t = (tema: string, posts: number, conversas: number, agendaram: number) => ({ tema, posts, alcance: 0, conversas, comerciais: conversas, pediram_preco: 0, agendaram });
const c = conclusoes({ ...base, temas: [t("Menopausa", 1, 10, 5), t("Sono", 3, 4, 4), t("Canetas", 0, 6, 1), t("Pele", 4, 0, 0), t("null", 0, 50, 50)] });
const titulos = c.map((x) => x.titulo).join(" | ");
assert.match(titulos, /"Menopausa" é o assunto que mais vira agendamento/, "Sono tem 100% mas só 4 conversas");
assert.ok(c.find((x) => x.titulo.includes("Menopausa"))?.acao, "pouco post num tema que converte vira ação");
assert.match(c.find((x) => x.titulo.includes("não tiveram post"))!.texto, /Canetas \(6\)/);
// Pessoas no lugar de conversas: quem abriu 3 conversas conta uma vez na taxa de agendamento.
const porPessoa = conclusoes({ ...base, temas: [{ ...t("Sono", 2, 12, 6), pessoas: 6, pessoas_agendaram: 3 }] })[1];
assert.match(porPessoa.texto, /50% das pessoas .* \(3 de 6\)/);
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
// Poucos pedidos (mesmo com muitos comentários): não aponta post nem usa tom verde.
const poucos = conclusoesProfundas({ ...vazio, posts_compra: [post], comentarios: { total: 265, compra: 8, posts_com_compra: 6 } })[0];
assert.match(poucos.titulo, /Poucos pedidos/);
assert.equal(poucos.tom, "neutro");
// Palavra-chave da legenda conta como pedido; cobertura baixa dos comentários guardados é avisada.
const pk = conclusoesProfundas({ ...vazio, posts_compra: [post], comentarios: { total: 3487, compra: 2770, posts_com_compra: 40, palavra: 2736, guardados_posts_periodo: 5506, instagram_posts_periodo: 10250 } })[0];
assert.match(pk.titulo, /palavra-chave/);
assert.match(pk.texto, /2736 deles são a palavra-chave/);
assert.match(pk.texto, /54% dos comentários/);
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
