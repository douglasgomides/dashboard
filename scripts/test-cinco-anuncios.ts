// Anúncios no formato 5 segundos (Phase 03.1.1.1, plano 09): o veredito do custo por conversa com o sinal honesto, o custo de cada dia, a média
// móvel de 7 dias, os dias de verba baixa e as descobertas. Módulo puro, só dados fictícios: nenhum nome, número ou campanha dos pilotos entra aqui.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-cinco-anuncios.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checarFraseCinco, textoDaFrase } from "../src/lib/leitura/cinco-segundos";
import type { FatosDaTela } from "../src/lib/leitura/tipos";
import { custoPorDia, mediaMovel7, vereditoDosAnuncios, type DiaDeAnuncio } from "../src/lib/leitura/cinco-anuncios";

// O real brasileiro sai com espaço sem quebra (U+00A0) em alguns pontos: nos testes comparamos com espaço comum.
const sp = (t: string) => t.replace(/ /g, " ");

const dia = (i: number) => new Date(Date.UTC(2026, 9, 30) - i * 86_400_000).toISOString().slice(0, 10);
/** `n` dias terminando em `fim` dias atrás, todos com o mesmo gasto e as mesmas conversas. */
function dias(n: number, gasto: number, conversas: number, fim = 0): DiaDeAnuncio[] {
  return Array.from({ length: n }, (_, k) => ({ dia: dia(fim + (n - 1 - k)), gasto, conversas }));
}

const fatosOk = (): FatosDaTela => ({
  tela: "anuncios",
  versaoRegras: 1,
  tipoPeriodo: "periodo",
  periodo: { de: dia(29), ate: dia(0), anterior: { de: dia(59), ate: dia(30) } },
  portao: { ok: true },
  fatos: [],
  proximoPasso: null,
  outrosPassos: [],
});
const fatosSuspeitos = (): FatosDaTela => ({
  ...fatosOk(),
  portao: {
    ok: false,
    codigo: "rastreio_suspeito",
    motivo: "o rastreio das conversas dos anúncios está suspeito (700 cliques no link e só 9 conversas contadas)",
    passo: { verbo: "corrigir", texto: "o rastreio das conversas dos anúncios", quem: "gestor_trafego" },
  },
});

// ---------------------------------------------------------------- veredito
{
  // Custo caiu de 29 para 24: "Melhorou", "mais barato", e a frase cabe nas regras de texto.
  const v = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 2400, conversas: 100 }, anterior: { gasto: 2900, conversas: 100 } });
  assert.ok(v && v.tipo === "veredito");
  assert.equal(v.palavra, "Melhorou");
  assert.equal(v.tom, "bom");
  const t = sp(textoDaFrase(v.frase));
  assert.equal(t, "R$ 24 por conversa: 17% mais barato que no período anterior");
  assert.ok(t.length <= 90);
  assert.deepEqual(checarFraseCinco(t), []);
  assert.match(sp(v.apoio ?? ""), /^Antes: R\$ 29,00 por conversa\. Investido caiu 17%; conversas iguais\.$/);
  // O número vem em destaque e o percentual leva a ênfase do lado bom.
  assert.equal(v.frase[0].enfase, "numero");
  assert.equal(v.frase[2].enfase, "bom");
}
{
  // Custo subiu: "Piorou" e "mais caro", nunca "mais barato".
  const v = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 3000, conversas: 80 }, anterior: { gasto: 3000, conversas: 100 } });
  assert.ok(v && v.tipo === "veredito");
  assert.equal(v.palavra, "Piorou");
  assert.equal(v.tom, "ruim");
  const t = sp(textoDaFrase(v.frase));
  assert.match(t, /^R\$ 38 por conversa: 25% mais caro que no período anterior$/);
  assert.ok(!/barato/.test(t), "custo que subiu nunca diz mais barato");
  assert.equal(v.frase[2].enfase, "ruim");
}
{
  // Dentro de 3%: "Estável" e "igual ao período anterior", sem percentual.
  const v = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 3000, conversas: 100 }, anterior: { gasto: 2950, conversas: 100 } });
  assert.ok(v && v.tipo === "veredito");
  assert.equal(v.palavra, "Estável");
  assert.equal(v.tom, "neutro");
  assert.equal(sp(textoDaFrase(v.frase)), "R$ 30 por conversa: igual ao período anterior");
}
{
  // Custo abaixo de R$ 10 mostra os centavos; o limite de 90 caracteres vale para custo e percentuais grandes.
  const v = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 540, conversas: 60 }, anterior: { gasto: 3000, conversas: 60 } });
  assert.ok(v && v.tipo === "veredito");
  const t = sp(textoDaFrase(v.frase));
  assert.match(t, /^R\$ 9,00 por conversa: 82% mais barato/);
  assert.ok(t.length <= 90);
}
{
  // Poucas conversas (abaixo do mínimo do funil) em qualquer período: sem percentual, vira a conclusão que a leitura já tinha.
  const sem = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 300, conversas: 10 }, anterior: { gasto: 300, conversas: 100 } });
  assert.ok(sem);
  assert.ok(sem.tipo === "sem_leitura" || !/%/.test(textoDaFrase(sem.frase)), "sem base mínima nunca dá percentual de custo");
  const semAnterior = vereditoDosAnuncios({ fatos: fatosOk(), atual: { gasto: 3000, conversas: 100 }, anterior: null });
  assert.ok(semAnterior);
  assert.ok(semAnterior.tipo === "sem_leitura" || !/mais (barato|caro)/.test(textoDaFrase(semAnterior.frase)));
}
{
  // Rastreio suspeito: o mesmo "Falta dado:" e o mesmo passo da leitura (Gestor de tráfego), nunca um veredito de custo.
  const v = vereditoDosAnuncios({ fatos: fatosSuspeitos(), atual: { gasto: 3000, conversas: 100 }, anterior: { gasto: 3000, conversas: 80 } });
  assert.ok(v && v.tipo === "sem_leitura");
  assert.match(v.motivo, /rastreio das conversas dos anúncios está suspeito/);
  assert.equal(v.passo.quem, "gestor_trafego");
  assert.match(v.passo.rotuloQuem, /Gestor de tráfego/);
}
{
  // Fatos ainda carregando: nada.
  assert.equal(vereditoDosAnuncios({ fatos: null, atual: null, anterior: null }), null);
}

// ---------------------------------------------------------------- custo por dia e média móvel
{
  const lista = custoPorDia([
    { dia: dia(3), gasto: 100, conversas: 4 },
    { dia: dia(2), gasto: 100, conversas: 0 },
    { dia: dia(1), gasto: 0, conversas: 3 },
    { dia: dia(0), gasto: 90, conversas: 3 },
  ]);
  // Dia sem conversa e dia sem gasto não ganham custo (nunca zero, nunca divisão por zero).
  assert.deepEqual(lista, [
    { dia: dia(3), custo: 25 },
    { dia: dia(0), custo: 30 },
  ]);
  assert.deepEqual(custoPorDia([]), []);
}
{
  // 10 dias a R$ 25 por conversa: os 6 primeiros são null (ainda não existem 7 dias) e depois R$ 25.
  const m = mediaMovel7(dias(10, 100, 4));
  assert.equal(m.valores.length, 10);
  assert.deepEqual(m.valores.slice(0, 6), [null, null, null, null, null, null]);
  assert.deepEqual(m.valores.slice(6), [25, 25, 25, 25]);
  assert.deepEqual(m.melhor, { valor: 25, ate: dia(3) });
  // Menos de 7 dias: nenhuma média e nenhuma melhor semana.
  const curto = mediaMovel7(dias(5, 100, 4));
  assert.ok(curto.valores.every((v) => v == null));
  assert.equal(curto.melhor, null);
  assert.deepEqual(mediaMovel7([]), { datas: [], valores: [], melhor: null });
}
{
  // A melhor semana é a menor média medida, com o dia em que a janela termina. Dias com custo alto no começo e baixo no fim.
  const alto = dias(7, 200, 4, 7); // R$ 50
  const baixo = dias(7, 80, 4, 0); // R$ 20
  const m = mediaMovel7([...alto, ...baixo]);
  assert.equal(m.melhor?.valor, 20);
  assert.equal(m.melhor?.ate, dia(0));
  // Janela sem conversa: buraco, nunca zero.
  const seca = mediaMovel7(dias(9, 100, 0));
  assert.ok(seca.valores.every((v) => v == null));
  assert.equal(seca.melhor, null);
}

// ---------------------------------------------------------------- a regra não lê dado de outra clínica
{
  const fonte = await readFile(new URL("../src/lib/leitura/cinco-anuncios.ts", import.meta.url), "utf8");
  assert.ok(!/carteira|outras cl[ií]nicas|ranking|benchmark/i.test(fonte.replace(/\/\/.*$/gm, "")), "a regra não compara com outras clínicas (D-02)");
}

console.log("test-cinco-anuncios: ok");
