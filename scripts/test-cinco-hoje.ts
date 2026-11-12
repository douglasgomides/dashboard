// As regras da Hoje no formato 5 segundos (Phase 03.1.1.1, plano 02): os 5 sinais da nota do dia vindos do que a Hoje já carrega, o veredito
// em uma frase e as etapas contra o período anterior. Só dados fictícios.
// node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-cinco-hoje.ts
import assert from "node:assert/strict";
import { LIMITES } from "../src/lib/limites";
import { MIN_DIAS_SALDO } from "../src/lib/leitura/fatos-instagram";
import { GUARDA_DE_TEXTO_DA_TELA_HOJE } from "../src/lib/leitura/fatos-hoje";
import { checarFraseCinco, textoDaFrase } from "../src/lib/leitura/cinco-segundos";
import { notaDoDia, type NotaDoDia } from "../src/lib/leitura/nota-do-dia";
import { etapasContraAntes, fatoresDaHoje, sentidoDaEtapa, tituloDaVirada, vereditoDaHoje, type EntradaCincoHoje } from "../src/lib/leitura/cinco-hoje";

const pessoas = (virou: number | null, atendido: number | null): EntradaCincoHoje["pessoas"] => ({
  etapas: [
    { valor: 500, motivo: null },
    { valor: virou, motivo: virou == null ? "sem lead" : null },
    { valor: atendido, motivo: atendido == null ? "sem atendido" : null },
    { valor: 30, motivo: null },
    { valor: 9, motivo: null },
  ],
});

const base = (): EntradaCincoHoje => ({
  atual: { mandaram_mensagem: 162, leads_novos: 100, agendaram: 40, fecharam: 5 },
  antes: { mandaram_mensagem: 100, leads_novos: 90, agendaram: 50, fecharam: 10 },
  ads: { atual: { gasto: 3000, conversas: 90 }, antes: { gasto: 3000, conversas: 75 } },
  crescimento: { atual: { novos: 300, diasMedidos: 30 }, antes: { novos: 270, diasMedidos: 30 } },
  pessoas: pessoas(100, 60),
});

// ---------------------------------------------------------------- os 5 sinais, na ordem do D-03
const f = fatoresDaHoje(base());
assert.deepEqual(f.map((x) => x.id), ["conversas", "custo-por-conversa", "seguidores-novos", "fecharam", "leads-atendidos"]);
const por = (id: string) => f.find((x) => x.id === id)!;
assert.equal(por("conversas").atual, 162);
assert.equal(por("conversas").anterior, 100);
assert.equal(por("conversas").baseMinima, LIMITES.funil.minLeads);
assert.equal(por("custo-por-conversa").menorEhMelhor, true);
assert.equal(Math.round((por("custo-por-conversa").atual as number) * 100) / 100, 33.33);
assert.equal(por("custo-por-conversa").anterior, 40);
assert.equal(por("custo-por-conversa").baseDoAnterior, 75, "a base do custo são as conversas do anúncio do período anterior");
assert.equal(por("custo-por-conversa").baseMinima, LIMITES.funil.minLeads);
assert.equal(por("custo-por-conversa").formatar?.(33.333), "R$ 33,33");
assert.equal(por("fecharam").baseMinima, LIMITES.leitura.grupoMinimo);
// Seguidores novos: média por dia medido (períodos com dias fechados diferentes não se comparam pelo total).
assert.equal(por("seguidores-novos").atual, 10);
assert.equal(por("seguidores-novos").anterior, 9);
// Leads atendidos: o período anterior de pessoas não é medido, então o sinal é sempre Falta dado.
assert.equal(por("leads-atendidos").anterior, null);
assert.equal(por("leads-atendidos").motivoSemDado, "O período anterior de pessoas não é medido");

const nota = notaDoDia(f);
assert.equal(nota.faltaDado.length, 1, "só leads atendidos fica de fora");
assert.equal(nota.faltaDado[0].id, "leads-atendidos");
assert.equal(nota.faltaDado[0].motivo, "O período anterior de pessoas não é medido");
assert.equal(nota.fatores.length, 4);

// fecharam com anterior 4 (abaixo de LIMITES.leitura.grupoMinimo = 5) vira Falta dado
const pequena = base();
pequena.antes.fecharam = 4;
const notaPequena = notaDoDia(fatoresDaHoje(pequena));
assert.equal(notaPequena.faltaDado.find((x) => x.id === "fecharam")?.motivo, `base pequena: 4 de ${LIMITES.leitura.grupoMinimo}`);
assert.equal(notaPequena.fatores.find((x) => x.id === "fecharam"), undefined);

// conversas com anterior abaixo de LIMITES.funil.minLeads também
const poucas = base();
poucas.antes.mandaram_mensagem = 12;
assert.equal(notaDoDia(fatoresDaHoje(poucas)).faltaDado.find((x) => x.id === "conversas")?.motivo, `base pequena: 12 de ${LIMITES.funil.minLeads}`);

// custo por conversa: anterior com poucas conversas do anúncio (base) fica de fora, sem anúncio idem
const adsPoucos = base();
adsPoucos.ads = { atual: { gasto: 3000, conversas: 90 }, antes: { gasto: 3000, conversas: 10 } };
assert.equal(notaDoDia(fatoresDaHoje(adsPoucos)).faltaDado.find((x) => x.id === "custo-por-conversa")?.motivo, `base pequena: 10 de ${LIMITES.funil.minLeads}`);
const semAds = base();
semAds.ads = null;
const semAdsNota = notaDoDia(fatoresDaHoje(semAds));
assert.match(semAdsNota.faltaDado.find((x) => x.id === "custo-por-conversa")?.motivo ?? "", /anúncio/);
const semConversaAtual = base();
semConversaAtual.ads = { atual: { gasto: 3000, conversas: 0 }, antes: { gasto: 3000, conversas: 75 } };
assert.match(notaDoDia(fatoresDaHoje(semConversaAtual)).faltaDado.find((x) => x.id === "custo-por-conversa")?.motivo ?? "", /conversas pelo anúncio/);

// seguidores novos: menos de MIN_DIAS_SALDO dias medidos em um dos períodos, ou sem Instagram
const poucosDias = base();
poucosDias.crescimento = { atual: { novos: 30, diasMedidos: MIN_DIAS_SALDO - 1 }, antes: { novos: 270, diasMedidos: 30 } };
assert.match(notaDoDia(fatoresDaHoje(poucosDias)).faltaDado.find((x) => x.id === "seguidores-novos")?.motivo ?? "", new RegExp(`${MIN_DIAS_SALDO}`));
const semIg = base();
semIg.crescimento = null;
assert.ok(notaDoDia(fatoresDaHoje(semIg)).faltaDado.some((x) => x.id === "seguidores-novos"));

// histórico diário que não cobre o período (null): conversas e fecharam ficam de fora, nunca 0
const semSoma = base();
semSoma.atual = { mandaram_mensagem: null, leads_novos: null, agendaram: null, fecharam: null };
const notaSemSoma = notaDoDia(fatoresDaHoje(semSoma));
assert.ok(notaSemSoma.faltaDado.some((x) => x.id === "conversas"));
assert.ok(notaSemSoma.faltaDado.some((x) => x.id === "fecharam"));
assert.ok(!notaSemSoma.fatores.some((x) => x.atual === 0));

// ---------------------------------------------------------------- o veredito em uma frase
const manual = (itens: { id: string; rotulo: string; atual: number; anterior: number; menorEhMelhor?: boolean }[]): NotaDoDia =>
  notaDoDia(itens.map((i) => ({ ...i })));
const mista = manual([
  { id: "conversas", rotulo: "Conversas", atual: 162, anterior: 100 },
  { id: "fecharam", rotulo: "Fecharam", atual: 5, anterior: 10 },
  { id: "custo-por-conversa", rotulo: "Custo", atual: 9, anterior: 10, menorEhMelhor: true },
]);
const v = vereditoDaHoje(mista);
assert.equal(v.tipo, "veredito");
assert.equal(textoDaFrase(v.frase), "Chegaram 62% mais conversas, mas os fechados caíram 50%.");
assert.ok(textoDaFrase(v.frase).length <= 90);
assert.equal(checarFraseCinco(textoDaFrase(v.frase)).length, 0);
assert.ok(!GUARDA_DE_TEXTO_DA_TELA_HOJE.test(textoDaFrase(v.frase)));
assert.equal(v.palavra, "Atenção");
assert.equal(v.tom, "atencao");
assert.ok(v.frase.some((p) => p.enfase === "bom" && /62%/.test(p.texto)), "o número que ajudou tem ênfase");
assert.ok(v.frase.some((p) => p.enfase === "ruim" && /50%/.test(p.texto)), "o número que puxou para baixo tem ênfase");

// só melhorou, só piorou, tudo igual
const bom = vereditoDaHoje(manual([{ id: "conversas", rotulo: "Conversas", atual: 130, anterior: 100 }]));
assert.equal(textoDaFrase(bom.frase), "Chegaram 30% mais conversas.");
assert.equal(bom.palavra, "Atenção", "a palavra vem da faixa da nota: 65 é Atenção");
const forte = vereditoDaHoje(manual([{ id: "conversas", rotulo: "Conversas", atual: 400, anterior: 100 }, { id: "fecharam", rotulo: "Fecharam", atual: 30, anterior: 10 }]));
assert.equal(forte.palavra, "Ótimo");
assert.equal(forte.tom, "bom");
const ruim = vereditoDaHoje(manual([{ id: "fecharam", rotulo: "Fecharam", atual: 5, anterior: 10 }, { id: "conversas", rotulo: "Conversas", atual: 50, anterior: 100 }]));
assert.equal(ruim.palavra, "Ruim");
assert.equal(ruim.tom, "ruim");
assert.equal(textoDaFrase(ruim.frase), "Os fechados caíram 50%.", "só puxou para baixo: abre com o que mais puxou");
const igual = vereditoDaHoje(manual([{ id: "conversas", rotulo: "Conversas", atual: 100, anterior: 100 }]));
assert.equal(textoDaFrase(igual.frase), "Tudo igual ao período anterior.");
const caro = vereditoDaHoje(manual([{ id: "custo-por-conversa", rotulo: "Custo", atual: 11, anterior: 10, menorEhMelhor: true }, { id: "seguidores-novos", rotulo: "Seguidores", atual: 130, anterior: 100 }]));
assert.equal(textoDaFrase(caro.frase), "Entraram 30% mais seguidores, mas cada conversa ficou 10% mais cara.");
assert.ok(textoDaFrase(caro.frase).length <= 90);

// sem nota: Falta dado, tom neutro, nunca 0
const vazio = vereditoDaHoje(notaDoDia([]));
assert.equal(vazio.palavra, "Falta dado");
assert.equal(vazio.tom, "neutro");
assert.ok(textoDaFrase(vazio.frase).length > 0 && textoDaFrase(vazio.frase).length <= 90);
assert.ok(!/\b0\b/.test(textoDaFrase(vazio.frase)));

// toda frase possível passa nas guardas (90, jargão, outras clínicas, promessa, texto da Hoje)
const ids = ["conversas", "custo-por-conversa", "seguidores-novos", "fecharam"];
for (const a of ids) for (const b of ids) {
  if (a === b) continue;
  for (const [pa, pb] of [[300, 40], [40, 300], [150, 50]]) {
    const n = manual([
      { id: a, rotulo: a, atual: pa, anterior: 100, menorEhMelhor: a === "custo-por-conversa" },
      { id: b, rotulo: b, atual: pb, anterior: 100, menorEhMelhor: b === "custo-por-conversa" },
    ]);
    const t = textoDaFrase(vereditoDaHoje(n).frase);
    assert.equal(checarFraseCinco(t).length, 0, t);
    assert.ok(!GUARDA_DE_TEXTO_DA_TELA_HOJE.test(t), t);
  }
}

// ---------------------------------------------------------------- as etapas contra o período anterior
const virada = (): EntradaCincoHoje => ({
  ...base(),
  atual: { mandaram_mensagem: 162, leads_novos: 144, agendaram: 40, fecharam: 5 },
  antes: { mandaram_mensagem: 100, leads_novos: 100, agendaram: 50, fecharam: 10 },
});
const etapas = etapasContraAntes(virada());
assert.deepEqual(etapas.map((x) => x.rotulo), ["Conversou", "Virou lead", "Atendido", "Agendou", "Fechou"]);
assert.deepEqual(etapas.map((x) => x.pct), [62, 44, null, -20, -50]);
assert.deepEqual(etapas.map((x) => x.atual), [162, 144, 60, 40, 5], "Atendido agora vem do funil de pessoas");
assert.equal(etapas[2].antes, null);
assert.equal(etapas[2].motivo, "o período anterior de pessoas não é medido");
assert.equal(etapas[0].antes, 100);
assert.equal(etapas[0].motivo, undefined);
const titulo = tituloDaVirada(etapas);
assert.deepEqual(titulo, { indice: 3, titulo: "Até Virou lead, tudo cresce. Depois, cai." }, "pula a etapa sem dado");

// Etapa com anterior abaixo da base fixada: pct null com "base pequena: N de M"
const pequenaBase = etapasContraAntes({ ...virada(), antes: { mandaram_mensagem: 100, leads_novos: 100, agendaram: 12, fecharam: 4 } });
assert.equal(pequenaBase[3].pct, null);
assert.equal(pequenaBase[3].motivo, `base pequena: 12 de ${LIMITES.funil.minAgendamentos}`);
assert.equal(pequenaBase[4].pct, null);
assert.equal(pequenaBase[4].motivo, `base pequena: 4 de ${LIMITES.leitura.grupoMinimo}`);
const baseConversas = etapasContraAntes({ ...virada(), antes: { mandaram_mensagem: 20, leads_novos: 29, agendaram: 50, fecharam: 10 } });
assert.equal(baseConversas[0].motivo, `base pequena: 20 de ${LIMITES.funil.minLeads}`);
assert.equal(baseConversas[1].motivo, `base pequena: 29 de ${LIMITES.funil.minLeads}`);

// Sem soma diária (histórico não cobre o período): nunca 0
const semHistorico = etapasContraAntes({ ...virada(), atual: { mandaram_mensagem: null, leads_novos: null, agendaram: null, fecharam: null }, antes: { mandaram_mensagem: null, leads_novos: null, agendaram: null, fecharam: null } });
for (const k of [0, 1, 3, 4]) {
  assert.equal(semHistorico[k].pct, null);
  assert.equal(semHistorico[k].atual, null);
  assert.ok((semHistorico[k].motivo ?? "").length > 0);
}
// Sem funil de pessoas: Atendido sem número, com motivo
const semPessoas = etapasContraAntes({ ...virada(), pessoas: null });
assert.equal(semPessoas[2].atual, null);
assert.equal(semPessoas[2].pct, null);
assert.ok((semPessoas[2].motivo ?? "").length > 0);

// Sem o padrão cresce-depois-cai: título neutro e sem linha de virada
const todasCrescem = tituloDaVirada(etapasContraAntes({ ...virada(), atual: { mandaram_mensagem: 162, leads_novos: 144, agendaram: 70, fecharam: 14 } }));
assert.deepEqual(todasCrescem, { indice: null, titulo: "Cada etapa comparada com o período anterior" });
const todasCaem = tituloDaVirada(etapasContraAntes({ ...virada(), atual: { mandaram_mensagem: 60, leads_novos: 60, agendaram: 30, fecharam: 5 } }));
assert.equal(todasCaem.indice, null);
const caiESobe = tituloDaVirada(etapasContraAntes({ ...virada(), atual: { mandaram_mensagem: 162, leads_novos: 60, agendaram: 80, fecharam: 5 } }));
assert.equal(caiESobe.indice, null, "cresce, cai e volta a crescer: não é 'depois, cai'");
const nenhuma = tituloDaVirada(etapasContraAntes({ ...virada(), atual: { mandaram_mensagem: null, leads_novos: null, agendaram: null, fecharam: null }, pessoas: null }));
assert.equal(nenhuma.indice, null);
// Menos de 3% é "igual" (a mesma folga dos números do topo): não conta como crescer nem como cair
assert.equal(sentidoDaEtapa(null), "falta");
assert.equal(sentidoDaEtapa(2), "igual");
assert.equal(sentidoDaEtapa(-2), "igual");
assert.equal(sentidoDaEtapa(3), "sobe");
assert.equal(sentidoDaEtapa(-3), "cai");
const comIgual = tituloDaVirada(etapasContraAntes({ ...virada(), atual: { mandaram_mensagem: 162, leads_novos: 101, agendaram: 40, fecharam: 5 } }));
assert.deepEqual(comIgual, { indice: 3, titulo: "Até Conversou, tudo cresce. Depois, cai." }, "Virou lead +1% é igual e fica de fora");
const soIgual = tituloDaVirada(etapasContraAntes({ ...virada(), atual: { mandaram_mensagem: 101, leads_novos: 100, agendaram: 51, fecharam: 10 } }));
assert.equal(soIgual.indice, null);
// A virada na segunda etapa
const cedo = tituloDaVirada(etapasContraAntes({ ...virada(), atual: { mandaram_mensagem: 162, leads_novos: 60, agendaram: 30, fecharam: 5 } }));
assert.deepEqual(cedo, { indice: 1, titulo: "Até Conversou, tudo cresce. Depois, cai." });

console.log("test-cinco-hoje: ok");
