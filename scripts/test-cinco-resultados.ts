// Resultados da clínica no formato 5 segundos (Phase 03.1.1.1, plano 03): o veredito, os 3 anéis contra o próprio período anterior,
// "Você agora contra você antes", os cartões de dinheiro e as descobertas. Módulo puro, só dados fictícios: nenhum número, nome
// ou legenda dos pilotos entra aqui.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-cinco-resultados.ts
import assert from "node:assert/strict";
import { checarDescoberta, checarFraseCinco, textoDaFrase } from "../src/lib/leitura/cinco-segundos";
import type { FatosDaTela } from "../src/lib/leitura/tipos";
import {
  aneisDeResultados,
  vereditoDeResultados,
  type EntradaCincoResultados,
} from "../src/lib/leitura/cinco-resultados";

const fatos = (ok = true): FatosDaTela => ({
  tela: "resultados",
  versaoRegras: 2,
  tipoPeriodo: "periodo",
  periodo: { de: "2026-10-01", ate: "2026-10-30", anterior: { de: "2026-09-01", ate: "2026-09-30" } },
  portao: ok
    ? { ok: true }
    : { ok: false, codigo: "sem_dado", motivo: "o Instagram não tem nenhum dia com dado neste período", passo: { verbo: "conferir", texto: "a conexão das fontes", quem: "equipe_hub" } },
  fatos: [],
  proximoPasso: null,
  outrosPassos: [],
});

const entrada = (parte: Partial<EntradaCincoResultados> = {}): EntradaCincoResultados => ({
  fatos: fatos(),
  dias: 30,
  valores: { mandaram_mensagem: 150, agendaram: 60, fecharam: 18 },
  atual: { mandaram_mensagem: 150, agendaram: 60, fecharam: 18 },
  antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 },
  diario: [],
  ads: null,
  seguidores: null,
  salvos: null,
  retorno: null,
  ...parte,
});

// ---------------------------------------------------------------- anéis
{
  const [conversas, agendaram, fecharam] = aneisDeResultados(entrada());
  assert.equal(conversas.rotulo, "Conversas");
  assert.equal(agendaram.rotulo, "Agendaram");
  assert.equal(fecharam.rotulo, "Fecharam");
  // 150 contra 100: o anel enche inteiro e dá uma volta a mais de 0,5.
  assert.equal(conversas.fracao, 1);
  assert.equal(conversas.volta, 0.5);
  assert.equal(conversas.selo, "Em alta");
  assert.equal(conversas.variacao?.texto, "▲ 50%");
  // 60 contra 80: três quartos, sem volta; 18 contra 36: metade, sem volta.
  assert.equal(agendaram.fracao, 0.75);
  assert.equal(agendaram.volta, 0);
  assert.equal(agendaram.selo, "Em queda");
  assert.equal(fecharam.fracao, 0.5);
  assert.equal(fecharam.volta, 0);
  assert.equal(fecharam.selo, "Em queda");
  assert.equal(fecharam.tom, "ruim");
  // O número do centro é o do cartão (a mesma conta que a tela já mostrava), não a soma dos dias.
  const dosCartoes = aneisDeResultados(entrada({ valores: { mandaram_mensagem: 140, agendaram: 55, fecharam: 17 } }));
  assert.deepEqual(dosCartoes.map((a) => a.valor), [140, 55, 17]);
}
{
  // Igual (menos de 3%): anel cheio, sem volta, selo "Igual".
  const [c] = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 101, agendaram: 60, fecharam: 18 } }));
  assert.equal(c.selo, "Igual");
  assert.equal(c.volta, 0.01);
  assert.equal(c.tom, "neutro");
}
{
  // Volta nunca passa de uma volta inteira.
  const [c] = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 900, agendaram: 60, fecharam: 18 } }));
  assert.equal(c.fracao, 1);
  assert.equal(c.volta, 1);
}
{
  // Antes abaixo da base mínima, ausente ou zero: sem comparação, "Falta dado", sem volta e nunca 0%.
  for (const antes of [{ mandaram_mensagem: 5 }, { mandaram_mensagem: null }, { mandaram_mensagem: 0 }]) {
    const [c] = aneisDeResultados(entrada({ antes: { ...entrada().antes, ...antes } }));
    assert.equal(c.variacao, null);
    assert.equal(c.selo, "Falta dado");
    assert.equal(c.tom, "neutro");
    assert.equal(c.fracao, 0);
    assert.equal(c.volta, 0);
  }
  // Sem número no cartão, o centro não inventa: valor null.
  const [c] = aneisDeResultados(entrada({ valores: { mandaram_mensagem: null, agendaram: 60, fecharam: 18 } }));
  assert.equal(c.valor, null);
}
{
  // Passagem entre os anéis: do mesmo período e da mesma fonte; "N de M" quando a base é pequena; nada quando fora de ordem.
  const [, ag, fe] = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 1000, agendaram: 50, fecharam: 25 } }));
  assert.equal(ag.passagemAteAqui, "5% seguem");
  assert.equal(fe.passagemAteAqui, "50% seguem");
  const pequena = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 20, agendaram: 10, fecharam: 4 } }));
  assert.equal(pequena[1].passagemAteAqui, "10 de 20 seguem", "abaixo da base do funil: N de M, sem %");
  assert.equal(pequena[2].passagemAteAqui, "4 de 10 seguem");
  const decimal = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 5000, agendaram: 36, fecharam: 18 } }));
  assert.equal(decimal[1].passagemAteAqui, "0,7% seguem");
  const foraDeOrdem = aneisDeResultados(entrada({ atual: { mandaram_mensagem: 100, agendaram: 10, fecharam: 30 } }));
  assert.equal(foraDeOrdem[2].passagemAteAqui, null, "fechou mais do que agendou: não existe passagem");
  const semNumero = aneisDeResultados(entrada({ atual: { mandaram_mensagem: null, agendaram: 10, fecharam: 3 } }));
  assert.equal(semNumero[1].passagemAteAqui, null);
  assert.equal(aneisDeResultados(entrada())[0].passagemAteAqui, null, "o primeiro anel não tem passagem");
}

// ---------------------------------------------------------------- veredito
{
  const v = vereditoDeResultados(entrada({ atual: { mandaram_mensagem: 162, agendaram: 60, fecharam: 18 }, antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 } }));
  assert.equal(v?.tipo, "veredito");
  if (v?.tipo === "veredito") {
    assert.equal(v.palavra, "Atenção");
    assert.equal(v.tom, "atencao");
    const frase = textoDaFrase(v.frase);
    assert.ok(frase.length <= 90, frase);
    assert.deepEqual(checarFraseCinco(frase), []);
    assert.equal(frase, "Chegaram 62% mais conversas, mas fecharam só 18 contra 36.");
    assert.deepEqual(v.frase.filter((p) => p.enfase).map((p) => p.texto), ["62% mais conversas", "só 18 contra 36"]);
  }
}
{
  const bom = vereditoDeResultados(entrada({ atual: { mandaram_mensagem: 150, agendaram: 90, fecharam: 40 }, antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 } }));
  assert.equal(bom?.tipo === "veredito" && bom.palavra, "Bom");
  if (bom?.tipo === "veredito") {
    assert.equal(textoDaFrase(bom.frase), "Chegaram 50% mais conversas e fecharam 40 contra 36.");
    assert.deepEqual(checarFraseCinco(textoDaFrase(bom.frase)), []);
  }
  const ruim = vereditoDeResultados(entrada({ atual: { mandaram_mensagem: 70, agendaram: 40, fecharam: 18 }, antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 } }));
  assert.equal(ruim?.tipo === "veredito" && ruim.palavra, "Ruim");
  if (ruim?.tipo === "veredito") assert.equal(textoDaFrase(ruim.frase), "Chegaram 30% menos conversas e fecharam só 18 contra 36.");
  const estavel = vereditoDeResultados(entrada({ atual: { mandaram_mensagem: 101, agendaram: 80, fecharam: 36 }, antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 } }));
  assert.equal(estavel?.tipo === "veredito" && estavel.palavra, "Estável");
  assert.equal(estavel?.tipo === "veredito" && estavel.tom, "neutro");
  const misto = vereditoDeResultados(entrada({ atual: { mandaram_mensagem: 70, agendaram: 90, fecharam: 40 }, antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 36 } }));
  assert.equal(misto?.tipo === "veredito" && misto.palavra, "Atenção");
  if (misto?.tipo === "veredito") assert.deepEqual(checarFraseCinco(textoDaFrase(misto.frase)), []);
}
{
  // Portão negado: o mesmo "Falta dado: motivo" e o passo da leitura, e nenhuma conclusão (D-05).
  const v = vereditoDeResultados(entrada({ fatos: fatos(false) }));
  assert.equal(v?.tipo, "sem_leitura");
  if (v?.tipo === "sem_leitura") {
    assert.match(v.motivo, /Instagram/);
    assert.ok(v.passo.frase.length > 0);
  }
  // Sem fatos ainda: nada a dizer.
  assert.equal(vereditoDeResultados(entrada({ fatos: null })), null);
  // Sem comparação de quem fechou (base do período anterior pequena): cai para o veredito dos fatos, nunca inventa número.
  const sem = vereditoDeResultados(entrada({ antes: { mandaram_mensagem: 100, agendaram: 80, fecharam: 4 } }));
  assert.notEqual(sem?.tipo === "veredito" ? textoDaFrase(sem.frase) : "", "Chegaram 50% mais conversas, mas fecharam só 18 contra 4.");
  if (sem?.tipo === "veredito") assert.deepEqual(checarFraseCinco(textoDaFrase(sem.frase)), []);
}
void checarDescoberta;

console.log("test-cinco-resultados: ok");
