// Leitura das telas de Marketing, parte Instagram (Phase 3.1, plano 05): Analisar desempenho, Encontrar destaques,
// Público do Instagram, Consultar publicações e Conteúdo × Comercial. Só regra fixa, sem IA e sem banco.
// Rodar: npx tsx scripts/test-leitura-instagram.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERBOS_PROVISORIOS } from "../src/lib/leitura/tipos";
import type { FatosDaTela, Fato } from "../src/lib/leitura/tipos";
import { montarTexto, problemasDoTexto } from "../src/lib/leitura/texto";
import {
  fatosConteudoComercial,
  fatosDePublicacoes,
  fatosDoInstagram,
  fatosDoPublico,
  fatosSemInstagram,
  guardaOrigemPorPost,
  SEM_LEITURA_ORIGEM_POR_POST,
  VERSAO_REGRAS_INSTAGRAM,
  type PostLeitura,
} from "../src/lib/leitura/fatos-instagram";
import { lerPeriodo, MIN_POSTS_LEITURA } from "../src/lib/leitura-periodo";
import { ig, posts as postsLana } from "./fixtures/lana-2026-10";

assert.equal(VERSAO_REGRAS_INSTAGRAM, 1);

// ---------- fixtures ----------
const START = "2026-09-13", END = "2026-10-12", HOJE = "2026-10-14";
const alcance: Record<string, number> = { "2026-09-13":61623,"2026-09-14":58056,"2026-09-15":67139,"2026-09-16":53382,"2026-09-17":47272,"2026-09-18":42881,"2026-09-19":39477,"2026-09-20":37724,"2026-09-21":30967,"2026-09-22":30734,"2026-09-23":35195,"2026-09-24":42662,"2026-09-25":95179,"2026-09-26":81621,"2026-09-27":67709,"2026-09-28":91403,"2026-09-29":132261,"2026-09-30":84931,"2026-10-01":52075,"2026-10-02":37995,"2026-10-03":36884,"2026-10-04":62354,"2026-10-05":32303,"2026-10-06":36768,"2026-10-07":33028,"2026-10-08":47120,"2026-10-09":39077,"2026-10-10":29260,"2026-10-11":30235,"2026-10-12":32332 };
const FORMATOS = ["reels", "carrossel", "estatico"] as const;
const diario = ig.map(([date]) => ({ date, reach: alcance[date], new_followers: 180 }));
const diarioAnterior = ig.map(([date], i) => ({ date: `2026-08-${String(14 + i).padStart(2, "0")}`.slice(0, 10), reach: Math.round(alcance[date] * 0.6), new_followers: 120 })).filter((d) => d.date <= "2026-09-12");
// Posts da Lana com formato, alcance e salvamentos sintéticos (a fixture traz só a data, o engajamento e a legenda).
const postsDaLana = postsLana.map(([posted_at, engagement, caption], i) => ({
  posted_at,
  caption,
  format: FORMATOS[i % 3],
  reach: engagement * 9 + 600,
  saved: Math.round(engagement / 9),
  tema: i % 4 === 3 ? null : ["Menopausa", "Emagrecimento", "Exames"][i % 3],
}));

const leituraLana = lerPeriodo({ diario, diarioAnterior, posts: postsDaLana });
const entrada = (extra: Partial<Parameters<typeof fatosDoInstagram>[1]> = {}) => ({ de: START, ate: END, hoje: HOJE, posts: postsDaLana, diario, anteriorMedido: true, ...extra });

const todasAsFrases = (f: FatosDaTela) => f.fatos.map((x) => x.frase);
const SEM_PROJECAO = /projeção|projecao|previsão|\bvai\b|ritmo atual|\bdeve\b|em risco/i;
const verbosOk = (f: FatosDaTela) => [f.proximoPasso, ...f.outrosPassos].filter(Boolean).every((p) => (VERBOS_PROVISORIOS as readonly string[]).includes(p!.verbo));
/** Toda saída passa por problemasDoTexto: jargão, previsão, causa sem ressalva, CFM, dado pessoal, linha longa. */
const limpa = (f: FatosDaTela) => {
  const t = montarTexto(f);
  assert.deepEqual(problemasDoTexto(t), [], `problemas de linguagem: ${JSON.stringify(problemasDoTexto(t))}`);
  return t;
};

// ---------- toda leitura que conclui traz um próximo passo; sem correção, o passo é conferir de novo ----------
{
  const so = fatosDoPublico({ de: "2026-09-13", ate: "2026-10-12", hoje: HOJE, dias: 30, faixas: null, alcance: null, saldo: { seguiram: 540, deixaram_de_seguir: 120, saldo: 420 }, janelaOnline: null });
  assert.equal(so.proximoPasso?.verbo, "conferir", "saldo bom e nada mais: o passo é conferir de novo");
  assert.equal(so.proximoPasso?.quem, "social_media");
  const t = limpa(so);
  assert.equal(t.tipo, "leitura");
  if (t.tipo === "leitura") assert.ok(t.proximoPasso && /próximo período/.test(t.proximoPasso.frase) && t.semPassoMotivo == null);
  // Portão negado não ganha passo de conferir: a leitura já diz "Sem leitura:" e quem resolve.
  const negado = fatosDoPublico({ de: "2026-09-13", ate: "2026-10-12", hoje: HOJE, dias: 30, faixas: null, alcance: null, saldo: null, janelaOnline: null });
  assert.equal(negado.proximoPasso, null);
}

// ---------- Analisar desempenho: poucos posts nega com o número no motivo ----------
{
  const poucos = postsDaLana.slice(0, 3);
  const f = fatosDoInstagram(lerPeriodo({ diario, posts: poucos }), entrada({ posts: poucos }));
  assert.equal(f.portao.ok, false, "menos posts que o mínimo nega");
  if (!f.portao.ok) {
    assert.equal(f.portao.codigo, "amostra_pequena");
    assert.match(f.portao.motivo, /poucos posts no período \(3,/, "o número vai no motivo");
    assert.ok(f.portao.motivo.includes(String(MIN_POSTS_LEITURA)), "o mínimo vai no motivo");
    assert.equal(f.portao.passo.quem, "social_media");
  }
  const t = limpa(f);
  assert.equal(t.tipo, "sem_leitura");
  if (t.tipo === "sem_leitura") {
    assert.match(t.motivo, /poucos posts no período \(3/);
    assert.equal(t.passo.quem, "social_media");
  }
  // 0 posts é falta de dado, não amostra pequena.
  const zero = fatosDoInstagram(lerPeriodo({ diario, posts: [] }), entrada({ posts: [] }));
  assert.ok(!zero.portao.ok && zero.portao.codigo === "sem_dado");
  limpa(zero);
}

// ---------- Analisar desempenho: fonte do Instagram parada nega com equipe_hub ----------
{
  const parado = diario.slice(0, 10); // último dia com dado: 22/09, mais de 20 dias antes do fim
  const f = fatosDoInstagram(lerPeriodo({ diario: parado, posts: postsDaLana }), entrada({ diario: parado }));
  assert.ok(!f.portao.ok && f.portao.codigo === "fonte_parada", "fonte parada nega");
  if (!f.portao.ok) {
    assert.equal(f.portao.passo.quem, "equipe_hub");
    assert.match(f.portao.motivo, /Instagram está sem dado novo desde 22\/09/);
  }
  const t = limpa(f);
  assert.equal(t.tipo, "sem_leitura");
  if (t.tipo === "sem_leitura") assert.equal(t.passo.quem, "equipe_hub");
  // Sem nenhum dia medido também é falta de dado.
  const vazio = fatosDoInstagram(lerPeriodo({ diario: [], posts: postsDaLana }), entrada({ diario: [] }));
  assert.ok(!vazio.portao.ok && vazio.portao.codigo === "sem_dado");
  // Cliente sem Instagram ligado.
  const sem = fatosSemInstagram("conteudo", { de: START, ate: END }, HOJE);
  assert.ok(!sem.portao.ok && sem.portao.codigo === "sem_dado");
  const ts = limpa(sem);
  assert.equal(ts.tipo, "sem_leitura");
  if (ts.tipo === "sem_leitura") {
    assert.match(ts.motivo, /Instagram deste cliente ainda não está ligado/);
    assert.equal(ts.passo.quem, "equipe_hub");
  }
}

// ---------- Analisar desempenho: com achados devolve o de maior peso, com número e um passo ----------
{
  const maiorPeso = [...leituraLana.achados].filter((a) => ["ritmo", "concentracao", "formato", "seguir", "constancia"].includes(a.id)).sort((a, b) => b.peso - a.peso)[0];
  assert.ok(maiorPeso, "a fixture da Lana gera achados do Instagram");
  const f = fatosDoInstagram(leituraLana, entrada({ crescimento: { novos: 5400, saidas: 900, liquido: 4500, diasMedidos: 28 }, variacaoLimitada: { motivo: "Dias com dado diferentes (28 x 30); comparado pela média por dia." } }));
  assert.deepEqual(f.portao, { ok: true });
  assert.equal(f.tela, "conteudo");
  assert.deepEqual(f.periodo.anterior, { de: "2026-08-14", ate: "2026-09-12" }, "período anterior de mesmo tamanho");
  const doAchado = f.fatos.find((x) => x.id === maiorPeso.id)!;
  assert.ok(doAchado && doAchado.numeros.length > 0, "o achado de maior peso vira fato com número");
  assert.ok(f.fatos.every((x) => x.numeros.length > 0), "todo fato leva o número que o sustenta");
  assert.ok(f.proximoPasso, "há um próximo passo");
  assert.ok((VERBOS_PROVISORIOS as readonly string[]).includes(f.proximoPasso!.verbo), "o verbo é da lista");
  assert.equal(f.proximoPasso!.quem, "social_media");
  assert.ok(verbosOk(f));
  assert.ok(f.fatos.some((x) => x.id === "saldo-seguidores" && x.tom === "bom"), "saldo positivo vira fato bom");
  assert.ok(f.fatos.some((x) => x.id === "variacao-limitada" && x.ressalva === true), "comparação limitada é ressalva, nunca conclusão");
  const t = limpa(f);
  assert.equal(t.tipo, "leitura");
  if (t.tipo === "leitura") {
    assert.ok(t.aconteceu.numeros.length > 0, "o que aconteceu leva o número ao lado");
    assert.ok(t.proximoPasso && t.proximoPasso.quem === "social_media");
    assert.ok(!/trouxe/i.test(t.aconteceu.frase));
  }
  // Nenhuma frase de fato fala de projeção, previsão ou ritmo futuro.
  for (const frase of todasAsFrases(f)) assert.ok(!SEM_PROJECAO.test(frase), `frase com previsão: ${frase}`);
  // Perda de seguidores vira fato ruim e o passo de revisar.
  const perdeu = fatosDoInstagram(leituraLana, entrada({ crescimento: { novos: 300, saidas: 700, liquido: -400, diasMedidos: 28 } }));
  assert.ok(perdeu.fatos.some((x) => x.id === "saldo-seguidores" && x.tom === "ruim" && x.peso === 3));
  limpa(perdeu);
  // Menos dias medidos que o piso: o saldo não vira fato.
  const curto = fatosDoInstagram(leituraLana, entrada({ crescimento: { novos: 10, saidas: 2, liquido: 8, diasMedidos: 3 } }));
  assert.ok(!curto.fatos.some((x) => x.id === "saldo-seguidores"));
  // Sem período anterior medido, o subtítulo não diz "comparado com".
  assert.equal(fatosDoInstagram(leituraLana, entrada({ anteriorMedido: false })).periodo.anterior, null);
}

// ---------- Encontrar destaques: o post de maior alcance, sem afirmar causa ----------
{
  const f = fatosDoInstagram(leituraLana, entrada({ diario: undefined, crescimento: null }), "top");
  assert.equal(f.tela, "top");
  const topo = f.fatos.find((x) => x.id === "maior-alcance")!;
  assert.ok(topo, "o post de maior alcance vira fato");
  const maior = Math.max(...postsDaLana.map((p) => p.reach));
  assert.equal(topo.numeros[0].valor, maior, "o número é o alcance do post de maior alcance");
  assert.match(topo.frase, /^O post que mais alcançou foi (um Reels|um carrossel|uma imagem|um post)/);
  assert.ok(!/porque|por causa|trouxe|gerou|causou/i.test(topo.frase), "sem afirmar causa");
  assert.ok(!f.fatos.some((x) => x.id === "saldo-seguidores" || x.id === "ritmo"), "o ritmo e o saldo são de Analisar desempenho");
  const t = limpa(f);
  assert.equal(t.tipo, "leitura");
  // A legenda do post nunca entra: só contagem, formato e data.
  assert.ok(!JSON.stringify(f).includes("hemograma"), "legenda não entra no fato");
}

// ---------- Consultar publicações ----------
{
  // Formato com melhor taxa de salvamento entre os formatos com a amostra mínima.
  const mk = (formato: string, n: number, taxa: number): PostLeitura[] => Array.from({ length: n }, (_, i) => ({ format: formato, reach: 1000, saved: Math.round(1000 * taxa), posted_at: `2026-10-${String(1 + (i % 9)).padStart(2, "0")}T15:00:00+00:00`, tema: "Menopausa" }));
  const posts = [...mk("reels", 10, 0.01), ...mk("carrossel", 9, 0.04), ...mk("estatico", 3, 0.2)];
  const f = fatosDePublicacoes({ de: START, ate: END, hoje: HOJE, posts });
  assert.deepEqual(f.portao, { ok: true });
  const melhor = f.fatos.find((x) => x.id === "formato-melhor-taxa")!;
  assert.ok(melhor, "há o fato do formato com melhor taxa");
  assert.match(melhor.frase, /^Carrossel foi o formato/, "o estático tem só 3 posts e fica fora da comparação, mesmo com taxa maior");
  assert.ok(!/Imagem foi o formato/.test(melhor.frase));
  assert.equal(melhor.numeros[0].valor, 0.04);
  assert.equal(f.proximoPasso?.quem, "social_media");
  assert.ok(verbosOk(f));
  const t = limpa(f);
  assert.equal(t.tipo, "leitura");
  // Um só formato com amostra: ressalva, sem afirmar o melhor.
  const um = fatosDePublicacoes({ de: START, ate: END, hoje: HOJE, posts: [...mk("reels", 10, 0.01), ...mk("carrossel", 3, 0.04)] });
  assert.ok(!um.fatos.some((x) => x.id === "formato-melhor-taxa"));
  assert.ok(um.fatos.some((x) => x.id === "formato-sem-comparacao" && x.ressalva === true));
  limpa(um);
  // Poucos posts nega.
  const poucos = fatosDePublicacoes({ de: START, ate: END, hoje: HOJE, posts: mk("reels", 3, 0.01) });
  assert.ok(!poucos.portao.ok && poucos.portao.codigo === "amostra_pequena");
  assert.equal(limpa(poucos).tipo, "sem_leitura");
  // Muitos posts sem tema vira ressalva com o passo de corrigir.
  const semTema = fatosDePublicacoes({ de: START, ate: END, hoje: HOJE, posts: posts.map((p) => ({ ...p, tema: null })) });
  assert.ok(semTema.fatos.some((x) => x.id === "posts-sem-tema" && x.ressalva === true));
  limpa(semTema);
}

// ---------- Público do Instagram ----------
{
  const base = { de: "2026-09-13", ate: "2026-10-12", hoje: HOJE, dias: 30 };
  // Faixa sem amostra mínima não cria fato daquela faixa.
  const raso = fatosDoPublico({ ...base, faixas: [{ chave: "25-34", valor: 3 }, { chave: "35-44", valor: 2 }], alcance: null, saldo: null, janelaOnline: null });
  assert.ok(!raso.fatos.some((x) => x.id === "faixa-dominante"), "faixa com menos de 5 seguidores não vira fato");
  const cheio = fatosDoPublico({
    ...base,
    faixas: [{ chave: "18-24", valor: 420 }, { chave: "25-34", valor: 1900 }, { chave: "35-44", valor: 1600 }, { chave: "U", valor: 2500 }],
    alcance: { seguidores: 1200, nao_seguidores: 3800 },
    saldo: { seguiram: 540, deixaram_de_seguir: 120, saldo: 420 },
    janelaOnline: { dia: 3, hora: 20, online: 410 },
  });
  assert.deepEqual(cheio.portao, { ok: true });
  const faixa = cheio.fatos.find((x) => x.id === "faixa-dominante")!;
  assert.match(faixa.frase, /25-34 anos/, "a faixa não informada (U) não disputa");
  assert.ok(cheio.fatos.every((x) => x.numeros.length > 0));
  assert.ok(cheio.fatos.some((x) => x.id === "alcance-fora-da-base" && x.tom === "bom"), "76% fora da base é bom");
  assert.ok(cheio.fatos.some((x) => x.id === "saldo-publico" && x.tom === "bom"));
  assert.match(cheio.fatos.find((x) => x.id === "janela-online")!.frase, /na quarta, perto das 20h/);
  assert.equal(cheio.proximoPasso?.verbo, "publicar");
  assert.equal(cheio.proximoPasso?.quem, "social_media");
  assert.deepEqual(cheio.periodo.anterior, null, "a janela da Meta é fixa: sem comparação");
  const t = limpa(cheio);
  assert.equal(t.tipo, "leitura");
  for (const frase of todasAsFrases(cheio)) assert.ok(!SEM_PROJECAO.test(frase), frase);
  // Alcance quase todo da base é atenção, com passo de publicar.
  const base2 = fatosDoPublico({ ...base, faixas: null, alcance: { seguidores: 4500, nao_seguidores: 500 }, saldo: null, janelaOnline: null });
  assert.ok(base2.fatos.some((x) => x.id === "alcance-fora-da-base" && x.tom === "atencao"));
  assert.equal(base2.proximoPasso?.verbo, "publicar");
  limpa(base2);
  // Saldo negativo é ruim.
  const perda = fatosDoPublico({ ...base, faixas: null, alcance: null, saldo: { seguiram: 100, deixaram_de_seguir: 300, saldo: -200 }, janelaOnline: null });
  assert.ok(perda.fatos.some((x) => x.id === "saldo-publico" && x.tom === "ruim"));
  limpa(perda);
  // A Meta não devolveu nada: sem leitura, com equipe_hub.
  const nada = fatosDoPublico({ ...base, faixas: null, alcance: null, saldo: null, janelaOnline: null });
  assert.ok(!nada.portao.ok && nada.portao.codigo === "sem_dado");
  const tn = limpa(nada);
  assert.equal(tn.tipo, "sem_leitura");
  if (tn.tipo === "sem_leitura") assert.equal(tn.passo.quem, "equipe_hub");
}

// ---------- Conteúdo × Comercial ----------
{
  const dias = Array.from({ length: 56 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 1 + i, 12));
    const dia = d.toISOString().slice(0, 10);
    const comPost = i % 2 === 0;
    return { dia, posts: comPost ? 1 : 0, conversas: comPost ? 14 : 9 };
  });
  const temas = [
    { tema: "Menopausa", posts: 3, alcance: 9000, conversas: 30, pessoas: 28, comerciais: 10, pediram_preco: 4, agendaram: 14, pessoas_agendaram: 12 },
    { tema: "Tireoide", posts: 0, alcance: 0, conversas: 16, pessoas: 15, comerciais: 3, pediram_preco: 1, agendaram: 2, pessoas_agendaram: 2 },
  ];
  const grade = [{ dow: 2, hora: 19, posts: 1, conversas: 30, agendaram: 6 }, { dow: 3, hora: 10, posts: 6, conversas: 4, agendaram: 0 }, { dow: 4, hora: 9, posts: 4, conversas: 6, agendaram: 1 }];
  const dados = { dias, grade, temas, objecoes: [], cobertura: { conversas: 120, lidas: 110, sem_texto: 5, com_tema: 60, posts: 28 } };
  const f = fatosConteudoComercial({ de: "2026-09-01", ate: "2026-10-26", hoje: "2026-10-27", dados });
  assert.deepEqual(f.portao, { ok: true });
  assert.ok(f.fatos.every((x) => x.numeros.length > 0), "todo fato leva o número");
  const efeito = f.fatos.find((x) => x.id === "efeito-post")!;
  assert.equal(efeito.frase, "Dias com post tiveram mais conversas que o mesmo dia sem post.");
  assert.equal(efeito.numeros[0].exibicao, "+56% de conversas", "o destaque leigo vem primeiro");
  assert.match(efeito.numeros[1].exibicao, /contra .* conversas por dia/, "o número antigo fica como segundo número");
  assert.deepEqual(efeito.comparacao!.barras.map((b) => b.rotulo), ["Com post", "Sem post"]);
  // Frases curtas (quick 261112-e8e): até 90 caracteres, uma frase só, e barras com fração entre 0 e 1.
  for (const x of f.fatos.filter((y) => ["efeito-post", "efeito-sem-par", "resposta-rapida"].includes(y.id))) {
    assert.ok(x.frase.length <= 90, `${x.id}: frase com até 90 caracteres (${x.frase})`);
    assert.equal(x.frase.split(/(?<=[.!?])\s+/).length, 1, `${x.id}: uma frase só`);
    assert.ok(x.comparacao && x.comparacao.barras.every((b) => b.fracao >= 0 && b.fracao <= 1), `${x.id}: barras entre 0 e 1`);
  }
  assert.ok(f.fatos.some((x) => x.id === "tema-que-agenda"), "tema com a amostra mínima de pessoas");
  assert.ok(f.fatos.some((x) => x.id === "demanda-sem-post"));
  // "trouxe" com porcentagem nunca aparece, em fato nenhum nem no texto montado.
  const t = limpa(f);
  for (const frase of todasAsFrases(f)) assert.ok(!/trouxe/i.test(frase), `fato com "trouxe": ${frase}`);
  assert.equal(t.tipo, "leitura");
  // A atribuição por post sai como "origem por post não medida" no fim de "Ver mais", com a equipe da Doctor Creator.
  assert.ok(f.outrosPassos.some((p) => /origem por post não medida/.test(p.texto) && p.quem === "equipe_hub"), "origem por post não medida entra como passo de equipe_hub");
  assert.equal(f.outrosPassos[f.outrosPassos.length - 1].quem, "equipe_hub", "e fica por último");
  if (t.tipo === "leitura") {
    const ultimo = t.verMais[t.verMais.length - 1];
    assert.ok(ultimo && /origem por post não medida/.test(ultimo.frase) && ultimo.quem === "equipe_hub");
    assert.ok(t.proximoPasso && !/origem por post/.test(t.proximoPasso.frase), "o próximo passo é de verdade, não a origem por post");
  }
  assert.equal(SEM_LEITURA_ORIGEM_POR_POST, "Sem leitura: origem por post não medida");

  // Sem base (nenhuma conversa): nega, e a leitura diz o motivo.
  const semBase = fatosConteudoComercial({ de: "2026-09-01", ate: "2026-10-26", hoje: "2026-10-27", dados: { ...dados, dias: [], grade: [], temas: [], cobertura: { conversas: 0, lidas: 0, sem_texto: 0, com_tema: 0, posts: 28 } } });
  assert.ok(!semBase.portao.ok && semBase.portao.codigo === "sem_dado");
  assert.equal(limpa(semBase).tipo, "sem_leitura");
  // Poucos posts nega.
  const poucos = fatosConteudoComercial({ de: "2026-09-01", ate: "2026-10-26", hoje: "2026-10-27", dados: { ...dados, cobertura: { ...dados.cobertura, posts: 2 } } });
  assert.ok(!poucos.portao.ok && poucos.portao.codigo === "amostra_pequena");
  limpa(poucos);
  // Sem dias para comparar: ressalva, nunca conclusão.
  const semPar = fatosConteudoComercial({ de: "2026-09-01", ate: "2026-10-26", hoje: "2026-10-27", dados: { ...dados, dias: dias.slice(0, 4) } });
  assert.ok(semPar.fatos.some((x) => x.id === "efeito-sem-par" && x.ressalva === true));
  assert.ok(!semPar.fatos.some((x) => x.id === "efeito-post"));
  const sp = semPar.fatos.find((x) => x.id === "efeito-sem-par")!;
  assert.equal(sp.frase, "Faltam dias para comparar dias com e sem post.");
  assert.ok(sp.frase.length <= 90 && sp.comparacao!.barras.length === 2);
  assert.ok(sp.comparacao!.barras.some((b) => b.faltou === true), "o que faltou é listrado");
  assert.ok(sp.comparacao!.barras.every((b) => b.fracao >= 0 && b.fracao <= 1));
  limpa(semPar);
  // Resposta rápida (quick 261112-e8e): uma frase de até 90 caracteres, com a ressalva, e duas barras entre 0 e 1.
  const profundos = {
    posts_compra: [], comentarios: { total: 0, compra: 0, posts_com_compra: 0 }, compra_por_formato: [], temas_valor: [], resposta_tema: [],
    resposta: [{ faixa: "1_ate_15min", conversas: 40, agendaram: 20 }, { faixa: "4_mais_de_4h", conversas: 40, agendaram: 8 }],
    cobertura: { conversas: 80, com_lead: 60, com_tema: 50, horario_comercial: 70 },
  };
  const comResposta = fatosConteudoComercial({ de: "2026-09-01", ate: "2026-10-26", hoje: "2026-10-27", dados, profundos });
  const rr = comResposta.fatos.find((x) => x.id === "resposta-rapida")!;
  assert.ok(rr, "resposta rápida com a amostra mínima");
  assert.equal(rr.frase, "Quem foi respondido em até 15 min agendou mais; não é prova ainda.");
  assert.ok(rr.frase.length <= 90 && rr.frase.split(/(?<=[.!?])\s+/).length === 1);
  assert.deepEqual(rr.comparacao!.barras.map((b) => [b.rotulo, b.exibicao, b.fracao]), [["Até 15 min", "50%", 1], ["Mais de 1 h", "20%", 0.4]]);
  assert.equal(problemasDoTexto(limpa(comResposta)).length, 0);
}

// ---------- guardaOrigemPorPost (T-03.1-13, decisão aberta 8) ----------
{
  const nega = guardaOrigemPorPost();
  assert.equal(nega.liberado, false);
  if (!nega.liberado) {
    assert.equal(nega.motivo, "origem por post não medida");
    assert.equal(nega.passo.quem, "equipe_hub");
    assert.ok((VERBOS_PROVISORIOS as readonly string[]).includes(nega.passo.verbo));
  }
  assert.equal(guardaOrigemPorPost({ medida: false, cobertura: 0.95 }).liberado, false, "cobertura sem medida não libera");
  assert.equal(guardaOrigemPorPost({ medida: true }).liberado, false, "medida sem cobertura visível não libera");
  assert.equal(guardaOrigemPorPost({ medida: true, cobertura: 0.4 }).liberado, false, "cobertura abaixo do mínimo de origem do ROI não libera");
  const livre = guardaOrigemPorPost({ medida: true, cobertura: 0.85 });
  assert.ok(livre.liberado && livre.cobertura === 0.85, "medida, com cobertura no mínimo, libera");

  // Um fato com "trouxe" e porcentagem não passa pelo filtro de texto: a leitura cai para "Sem leitura".
  const fatoTrouxe: Fato = { id: "x", tom: "bom", peso: 3, frase: "Esse post trouxe 40% dos contatos do período.", numeros: [{ chave: "p", exibicao: "40% dos contatos" }] };
  const sujo: FatosDaTela = {
    tela: "conteudo-comercial", versaoRegras: 1, tipoPeriodo: "periodo",
    periodo: { de: START, ate: END, anterior: null }, portao: { ok: true }, fatos: [fatoTrouxe], proximoPasso: null, outrosPassos: [],
  };
  const texto = montarTexto(sujo);
  assert.equal(texto.tipo, "sem_leitura", "a frase causal sem ressalva é descartada");
  assert.ok(!JSON.stringify(texto).includes("trouxe"), "o texto montado não carrega a frase");
}

// ---------- restrições de código (LEIT-01, LEIT-02) ----------
{
  const fonte = readFileSync(new URL("../src/lib/leitura/fatos-instagram.ts", import.meta.url), "utf8").replace(/\/\/[^\n]*/g, "");
  assert.ok(!/supabase|useQuery|chamarIA|fetch\(/.test(fonte), "o módulo é puro: sem banco, sem consulta e sem IA");
  assert.ok(!/\.caption|legenda\s*[:=]/i.test(fonte), "legenda nunca entra no fato");
}

console.log("test-leitura-instagram: ok");
