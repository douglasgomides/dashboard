// Instagram > Desempenho no formato 5 segundos (Phase 03.1.1.1, plano 07): o veredito de alcance e seguidores, os 3 números-chave, o mapa de
// horários dos próprios posts, a frase do formato e as descobertas. Módulo puro, só dados fictícios: nenhuma legenda, nome ou número dos
// pilotos entra aqui.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-cinco-instagram.ts
import assert from "node:assert/strict";
import { fatosSemInstagram } from "../src/lib/leitura/fatos-instagram";
import { checarFraseCinco, textoDaFrase } from "../src/lib/leitura/cinco-segundos";
import type { FatosDaTela } from "../src/lib/leitura/tipos";
import type { GroupStat } from "../src/lib/hub-conteudo";
import { MIN_POSTS_DO_FORMATO, fraseDoFormato, numerosDoInstagram, vereditoDoInstagram, type DiaDoInstagram } from "../src/lib/leitura/cinco-instagram";
import { FRASE_SEM_MELHOR_HORARIO, MIN_POSTS_NO_HORARIO, fraseDaCelula, horasDoMapa, mapaDosPosts, melhorHorario } from "../src/lib/mapa-dos-posts";

// O real brasileiro sai com espaço sem quebra (U+00A0): nos testes comparamos com espaço comum.
const sp = (t: string) => t.replace(/ /g, " ");

const dia = (i: number) => new Date(Date.UTC(2026, 9, 30) - i * 86_400_000).toISOString().slice(0, 10);
/** `n` dias terminando em `fim` dias atrás: alcance e salvos fixos por dia, seguidores subindo `passo` por dia. */
function dias(n: number, opc: { fim?: number; reach?: number | null; saves?: number | null; seguidores?: number | null; passo?: number; taps?: number | null } = {}): DiaDoInstagram[] {
  const { fim = 0, reach = 1000, saves = 20, seguidores = 5000, passo = 10, taps = 3 } = opc;
  return Array.from({ length: n }, (_, k) => {
    const i = fim + (n - 1 - k);
    return { date: dia(i), reach, saves, profile_links_taps: taps, followers_count: seguidores == null ? null : seguidores - (n - 1 - k) * passo };
  });
}

const fatosOk = (): FatosDaTela => ({
  tela: "conteudo",
  versaoRegras: 1,
  tipoPeriodo: "periodo",
  periodo: { de: dia(29), ate: dia(0), anterior: { de: dia(59), ate: dia(30) } },
  portao: { ok: true },
  fatos: [],
  proximoPasso: null,
  outrosPassos: [],
});

// ---------------------------------------------------------------- veredito
{
  // Alcance mais que dobrou (+140%) e +6.400 seguidores: "Em alta", uma frase só.
  const agora = dias(30, { reach: 2400, seguidores: 11_400, passo: 220 });
  const antes = dias(30, { fim: 30, reach: 1000 });
  const v = vereditoDoInstagram({ diario: agora, diarioAnterior: antes, formatos: null }, fatosOk());
  assert.ok(v && v.tipo === "veredito");
  assert.equal(v.palavra, "Em alta");
  assert.equal(v.tom, "bom");
  const frase = sp(textoDaFrase(v.frase));
  assert.equal(frase, "Alcance subiu 140% e você ganhou 6,4 mil seguidores");
  assert.ok(frase.length <= 90);
  assert.deepEqual(checarFraseCinco(frase), []);
  // O número vai em destaque, como dado (nunca HTML).
  assert.deepEqual(v.frase.filter((p) => p.enfase).map((p) => sp(p.texto)), ["140%", "6,4 mil"]);
  assert.equal(v.apoio, undefined, "sem melhor formato com amostra não há apoio");

  // Alcance caiu e o perfil perdeu seguidores: "Em queda", com "caiu".
  const ruim = vereditoDoInstagram({ diario: dias(30, { reach: 600, passo: -5 }), diarioAnterior: antes, formatos: null }, fatosOk());
  assert.ok(ruim && ruim.tipo === "veredito");
  assert.equal(ruim.palavra, "Em queda");
  assert.equal(ruim.tom, "ruim");
  assert.equal(sp(textoDaFrase(ruim.frase)), "Alcance caiu 40% e você perdeu 145 seguidores");

  // Alcance subiu mas o perfil perdeu seguidores: sinais contrários viram "Atenção", sem esconder nenhum dos dois.
  const misto = vereditoDoInstagram({ diario: dias(30, { reach: 1500, passo: -5 }), diarioAnterior: antes, formatos: null }, fatosOk());
  assert.ok(misto && misto.tipo === "veredito");
  assert.equal(misto.palavra, "Atenção");
  assert.equal(sp(textoDaFrase(misto.frase)), "Alcance subiu 50%, mas você perdeu 145 seguidores");

  // Período anterior sem alcance medido: nenhum % inventado, só os seguidores.
  const semAntes = vereditoDoInstagram({ diario: agora, diarioAnterior: dias(30, { fim: 30, reach: null }), formatos: null }, fatosOk());
  assert.ok(semAntes && semAntes.tipo === "veredito");
  assert.equal(sp(textoDaFrase(semAntes.frase)), "Você ganhou 6,4 mil seguidores");
  assert.ok(!/%/.test(textoDaFrase(semAntes.frase)), "sem período anterior não há %");
  assert.equal(semAntes.palavra, "Em alta");

  // Período anterior com poucos dias medidos: a soma de 30 dias contra 10 não é comparação.
  const poucos = vereditoDoInstagram({ diario: agora, diarioAnterior: dias(10, { fim: 30, reach: 100 }), formatos: null }, fatosOk());
  assert.ok(poucos && poucos.tipo === "veredito");
  assert.ok(!/Alcance/.test(textoDaFrase(poucos.frase)));

  // O melhor formato (com a amostra mínima) vira a linha de apoio.
  const comFormato = vereditoDoInstagram(
    { diario: agora, diarioAnterior: antes, formatos: { total: 20, porFormato: [], porTema: [], melhorFormato: { key: "estatico", label: "Estático", count: 12, reachMedian: 3000, reachMean: 3100, savedMean: 30, savedMedian: 28 } } },
    fatosOk(),
  );
  assert.ok(comFormato && comFormato.tipo === "veredito");
  assert.equal(comFormato.apoio, "Estático é o que mais alcança.");

  // Sem Instagram ligado: o mesmo "Falta dado: motivo" da leitura.
  const sem = vereditoDoInstagram({ diario: [], diarioAnterior: null, formatos: null }, fatosSemInstagram("conteudo", { de: dia(29), ate: dia(0) }, dia(0)));
  assert.ok(sem && sem.tipo === "sem_leitura");
  assert.match(sem.motivo, /Instagram/);

  // Sem dado nenhum mas com o portão aberto: Falta dado, nunca "Estável" nem 0.
  const vazio = vereditoDoInstagram({ diario: dias(30, { reach: null, seguidores: null }), diarioAnterior: antes, formatos: null }, fatosOk());
  assert.ok(vazio && vazio.tipo === "sem_leitura");
}

// ---------------------------------------------------------------- números-chave
{
  const agora = dias(30, { reach: 2400, saves: 30, seguidores: 11_400, passo: 220 });
  const antes = dias(30, { fim: 30, reach: 1000, saves: 20 });
  const [seg, alc, sal] = numerosDoInstagram({ diario: agora, diarioAnterior: antes });
  assert.equal(seg.titulo, "Seguidores");
  assert.equal(seg.valorTexto, "11.400");
  assert.equal(sp(seg.textoDaVariacao ?? ""), "▲ +6.380 · 127% no período");
  assert.equal(seg.melhor, true);
  assert.ok(seg.serie && seg.serie.datas.length === 30);

  assert.equal(alc.titulo, "Pessoas alcançadas");
  assert.equal(sp(alc.valorTexto ?? ""), "72,0 mil");
  assert.equal(sp(alc.textoDaVariacao ?? ""), "▲ 140% · vs 30,0 mil antes");
  assert.equal(alc.melhor, true);
  assert.equal(alc.selo?.texto, "Em alta");

  assert.equal(sal.titulo, "Salvos");
  assert.equal(sal.valorTexto, "900");
  assert.equal(sp(sal.textoDaVariacao ?? ""), "▲ 50% · vs 600 antes");

  // Alcance caiu: ▼ e "Em queda"; o sinal sempre vai no texto.
  const [, alcQueda] = numerosDoInstagram({ diario: dias(30, { reach: 500 }), diarioAnterior: antes });
  assert.match(alcQueda.textoDaVariacao ?? "", /^▼ 50%/);
  assert.equal(alcQueda.selo?.texto, "Em queda");
  assert.equal(alcQueda.melhor, false);

  // Sem período anterior: o número aparece, a comparação diz Falta dado com o motivo (nunca 0%).
  const [, alcSem, salSem] = numerosDoInstagram({ diario: agora, diarioAnterior: dias(30, { fim: 30, reach: null, saves: null }) });
  assert.equal(alcSem.textoDaVariacao, null);
  assert.equal(alcSem.selo?.texto, "Falta dado · sem período anterior");
  assert.ok(alcSem.motivo && /anterior/.test(alcSem.motivo));
  assert.equal(salSem.textoDaVariacao, null);
  const [, , carregando] = numerosDoInstagram({ diario: agora, diarioAnterior: null });
  assert.equal(carregando.selo?.texto, "Falta dado · sem período anterior");

  // Dia sem medida é buraco na linha de 30 dias, nunca zero.
  const furado = agora.map((d, k) => (k === 10 ? { ...d, reach: null } : d));
  const [, alcFuro] = numerosDoInstagram({ diario: furado, diarioAnterior: antes });
  assert.equal(alcFuro.serie?.valores[10], null);
  assert.equal(alcFuro.serie?.valores[9], 2400);

  // Nada medido: "Sem dado" com o motivo, nunca 0.
  const [segNada, alcNada, salNada] = numerosDoInstagram({ diario: dias(30, { reach: null, saves: null, seguidores: null }), diarioAnterior: antes });
  for (const n of [segNada, alcNada, salNada]) {
    assert.equal(n.valorTexto, null);
    assert.ok(n.motivo);
    assert.equal(n.selo, null);
  }
}

// ---------------------------------------------------------------- mapa de horários dos próprios posts
{
  // 2026-10-28 é uma quarta-feira. 21:00Z = 18h em São Paulo; 15:00Z = 12h; 02:00Z de quinta = 23h de quarta.
  const post = (iso: string, reach: number | null) => ({ posted_at: iso, reach });
  const celulas = mapaDosPosts([
    post("2026-10-28T21:00:00Z", 1000),
    post("2026-10-21T21:00:00Z", 3000), // quarta 18h de novo: média 2.000, 2 posts
    post("2026-10-26T15:00:00Z", 90_000), // segunda 12h, um post só, o maior alcance de todos
    post("2026-10-29T02:00:00Z", 400), // quarta 23h no horário de São Paulo (quinta em UTC)
    post("2026-10-22T02:00:00Z", 600), // quarta 23h de novo: média 500, 2 posts
    post("2026-10-27T21:00:00Z", null), // sem alcance medido: não vira zero, não entra
    { posted_at: null, reach: 10 }, // sem data: não entra
  ]);
  assert.deepEqual(
    celulas.map((c) => [c.dia, c.hora, c.posts, c.alcancePorPost]),
    [
      [1, 12, 1, 90_000],
      [3, 18, 2, 2000],
      [3, 23, 2, 500],
    ],
    "cada post cai no dia e na hora de São Paulo, só com alcance medido",
  );
  assert.deepEqual(horasDoMapa(celulas), [12, 18, 23], "só as horas com post viram coluna");

  // O melhor horário só vale com MIN_POSTS_NO_HORARIO posts: o post solto de 90 mil NÃO ganha a estrela.
  assert.equal(MIN_POSTS_NO_HORARIO, 2);
  const melhor = melhorHorario(celulas);
  assert.ok(melhor);
  assert.deepEqual([melhor.dia, melhor.hora], [3, 18]);
  assert.equal(melhorHorario([{ dia: 1, hora: 12, posts: 1, alcancePorPost: 90_000 }]), null, "uma célula com 1 post nunca é o melhor");
  assert.equal(melhorHorario([]), null);
  assert.equal(FRASE_SEM_MELHOR_HORARIO, "Poucos posts por horário para apontar o melhor.");

  // A frase de uma célula tocada compara só com o melhor horário dos próprios posts.
  assert.equal(sp(fraseDaCelula(melhor, melhor)), "Quarta 18h: 2,0 mil pessoas por post · o seu melhor horário.");
  assert.equal(sp(fraseDaCelula(celulas[2], melhor)), "Quarta 23h: 500 pessoas por post · 4,0× menos que Quarta 18h.");
  assert.equal(sp(fraseDaCelula(celulas[0], melhor)), "Segunda 12h: 90,0 mil pessoas por post · só 1 post, pouco para comparar.");
  assert.doesNotMatch(fraseDaCelula(celulas[0], melhor), /melhor|pior/i, "com 1 post a frase não usa melhor nem pior");
  assert.deepEqual(checarFraseCinco(fraseDaCelula(celulas[2], melhor)), []);
}

// ---------------------------------------------------------------- frase do formato
{
  const grupo = (key: string, label: string, count: number, savedMean: number): GroupStat => ({ key, label, count, reachMedian: 1000, reachMean: 1100, savedMean, savedMedian: savedMean });
  // Estático salva 2,3 vezes mais, mas você postou 47 Reels e 19 estáticos.
  const f = fraseDoFormato({ porFormato: [grupo("estatico", "Estático", 19, 339), grupo("reels", "Reels", 47, 150)] });
  assert.equal(f.tipo, "descompasso");
  assert.equal(sp(f.frase), "Estático salva 2,3× mais, mas você postou 47 Reels e 19 estáticos.");
  assert.deepEqual(checarFraseCinco(f.frase), []);
  assert.ok(f.frase.length <= 90);

  // O formato que mais salva é o que mais se posta: sem descompasso.
  const alinhado = fraseDoFormato({ porFormato: [grupo("reels", "Reels", 30, 300), grupo("estatico", "Estático", 20, 100)] });
  assert.equal(alinhado.tipo, "alinhado");
  assert.equal(alinhado.frase, "Reels é o que mais salva e o que você mais posta.");

  // Salvam parecido: frase neutra, nenhum "melhor".
  const neutro = fraseDoFormato({ porFormato: [grupo("reels", "Reels", 30, 100), grupo("estatico", "Estático", 20, 110)] });
  assert.equal(neutro.tipo, "neutro");
  assert.doesNotMatch(neutro.frase, /melhor|mais salva/i);

  // Formato com menos de 8 posts não disputa nada (a mesma amostra de conclusão do painel), e "não classificado" nunca entra.
  const poucos = fraseDoFormato({ porFormato: [grupo("estatico", "Estático", 7, 900), grupo("reels", "Reels", 47, 150), grupo("não classificado", "não classificado", 40, 5000)] });
  assert.equal(poucos.tipo, "poucos");
  assert.equal(poucos.frase, "Poucos posts por formato para apontar o melhor.");
  assert.equal(fraseDoFormato(null).tipo, "poucos");
  assert.equal(MIN_POSTS_DO_FORMATO, 8);

  // Empate de quantidade não é descompasso.
  const empate = fraseDoFormato({ porFormato: [grupo("reels", "Reels", 20, 100), grupo("estatico", "Estático", 20, 300)] });
  assert.equal(empate.tipo, "alinhado");
}

console.log("test-cinco-instagram: ok");
