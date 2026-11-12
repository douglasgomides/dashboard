// Instagram > Desempenho no formato 5 segundos (Phase 03.1.1.1, plano 07): o veredito de alcance e seguidores, os 3 números-chave, o mapa de
// horários dos próprios posts, a frase do formato e as descobertas. Módulo puro, só dados fictícios: nenhuma legenda, nome ou número dos
// pilotos entra aqui.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-cinco-instagram.ts
import assert from "node:assert/strict";
import { fatosSemInstagram } from "../src/lib/leitura/fatos-instagram";
import { checarFraseCinco, textoDaFrase } from "../src/lib/leitura/cinco-segundos";
import type { FatosDaTela } from "../src/lib/leitura/tipos";
import { numerosDoInstagram, vereditoDoInstagram, type DiaDoInstagram } from "../src/lib/leitura/cinco-instagram";

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

console.log("test-cinco-instagram: ok");
