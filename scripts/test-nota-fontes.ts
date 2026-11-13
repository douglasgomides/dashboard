import assert from "node:assert/strict";
import { statusDaFonte } from "../src/lib/status-fonte";
import { fatoresDaNota, notaDasFontes, problemasQueContam } from "../src/lib/nota-fontes";

const hoje = "2026-10-15";
const st = (data_ate: string | null, extra: Record<string, unknown> = {}) => statusDaFonte({ cadastro: data_ate !== null || !!extra.cadastro, data_ate, ...extra }, hoje);

// Tudo em dia: 100.
let n = notaDasFontes({ instagram: st("2026-10-14"), anuncios: st("2026-10-15"), crm: st("2026-10-14"), atendimento: st(null) });
assert.equal(n.nota, 100);
assert.equal(n.faixa, "boa");
assert.deepEqual(n.motivos, []);

// Uma atrasada (60) e duas em dia: (100+100+60)/3 = 87.
n = notaDasFontes({ instagram: st("2026-10-14"), anuncios: st("2026-10-13"), crm: st("2026-10-14") });
assert.equal(n.nota, 87);
assert.match(n.motivos[0], /Anúncios atrasada/);

// Parada + CRM não ligado sem decisão: (100+0)/2 - 10 = 40, ruim.
n = notaDasFontes({ instagram: st("2026-10-14"), anuncios: st("2026-10-01"), crm: st(null) });
assert.equal(n.nota, 40);
assert.equal(n.faixa, "ruim");
assert.ok(n.motivos.some((m) => /CRM não ligado/.test(m)));

// CRM marcado como "não usa" não desconta.
n = notaDasFontes({ instagram: st("2026-10-14"), crm: st(null, { naoUsa: true }) });
assert.equal(n.nota, 100);

// Problemas de dado: 2 altas + 1 média = 35; teto 40.
n = notaDasFontes({ instagram: st("2026-10-14") }, [{ severidade: "alta" }, { severidade: "alta" }, { severidade: "media" }]);
assert.equal(n.nota, 65);
assert.equal(n.faixa, "atencao");
n = notaDasFontes({ instagram: st("2026-10-14") }, Array.from({ length: 5 }, () => ({ severidade: "alta" as const })));
assert.equal(n.nota, 60);

// Nada ligado: sem nota.
n = notaDasFontes({ instagram: st(null), anuncios: st(null) });
assert.equal(n.nota, null);

// Fatores da nota (painel da clínica): as barras espelham a conta de notaDasFontes.
// Instagram em dia, Anúncios atrasada (2 dias), CRM parado, WhatsApp não ligado, 2 problemas altos.
{
  const status = { instagram: st("2026-10-14"), anuncios: st("2026-10-13"), crm: st("2026-10-01"), atendimento: st(null) };
  const problemas = [{ severidade: "alta" as const }, { severidade: "alta" as const }];
  const barras = fatoresDaNota(status, problemas);
  assert.deepEqual(
    barras.map((b) => [b.rotulo, b.exibicao, b.fracao, !!b.faltou]),
    [["Instagram", "em dia", 1, false], ["Anúncios", "atrasada (2 dias)", 0.6, false], ["CRM", "parada (14 dias)", 0, false], ["Problemas de dado", "2 (afetam a leitura)", 0.25, false]],
  );
  // A barra do dado: desconto 30 de 40, sobra 0,25.
  const nota = notaDasFontes(status, problemas);
  assert.equal(nota.nota, Math.max(0, Math.round((100 + 60 + 0) / 3 - 30)));
  // Fonte obrigatória não ligada e sem decisão: barra listrada "Não ligado".
  const sem = fatoresDaNota({ instagram: st("2026-10-14"), anuncios: st(null), crm: st(null, { naoUsa: true }) });
  assert.deepEqual(sem.map((b) => [b.rotulo, b.exibicao, b.fracao, !!b.faltou]), [["Instagram", "em dia", 1, false], ["Anúncios", "Não ligado", 0, true]]);
  // Sem nenhuma fonte ligada: sem nota, sem barra.
  assert.deepEqual(fatoresDaNota({ instagram: st(null), anuncios: st(null) }), []);
  // Problema só informativo (baixa) aparece e não desconta.
  assert.equal(fatoresDaNota({ instagram: st("2026-10-14") }, [{ severidade: "baixa" }]).at(-1)?.fracao, 1);
  // Nenhuma barra promete ponto por correção.
  for (const b of [...barras, ...sem]) assert.doesNotMatch(`${b.rotulo} ${b.exibicao}`, /pontos?|\+\d/i);
}

// D-04: fonte ligada que funciona não perde ponto por estado do negócio (dados inventados).
{
  const sucessoHoje = "2026-10-15T12:00:00Z";
  const ig = st("2026-10-14");
  const crm = st("2026-10-14", { fonte: "crm" });
  // Anúncios "Parada pelo cliente": dado de 5 dias, leitura de hoje sem erro, motivo com dono "cliente".
  const anunciosCliente = st("2026-10-10", { fonte: "anuncios", ultimo_sucesso: sucessoHoje, motivo: "Conta atingiu o limite de gastos", motivo_dono: "cliente" });
  assert.equal(anunciosCliente.rotulo, "Parada pelo cliente");
  let r = notaDasFontes({ instagram: ig, anuncios: anunciosCliente, crm });
  assert.equal(r.nota, 100, "neutra: fora da média (antes valia 0 e a nota caía para 67)");
  assert.ok(r.motivos.includes("Anúncios parada pelo cliente: quem resolve é o cliente"));

  // CRM "Sem movimento": leitura de hoje sem erro, mais de 3 dias úteis sem lead e sem dono de aviso.
  const crmParado = st("2026-10-07", { fonte: "crm", ultimo_sucesso: sucessoHoje });
  assert.equal(crmParado.rotulo, "Sem movimento");
  r = notaDasFontes({ instagram: ig, anuncios: st("2026-10-15", { fonte: "anuncios" }), crm: crmParado });
  assert.equal(r.nota, 100);
  assert.ok(r.motivos.includes("CRM sem movimento desde 07/10"));

  // Planilha manual atrasada (dono "manual"): 60, tarefa da equipe, nunca 0. (100+100+60)/3 = 87.
  const planilha = st("2026-10-05", { fonte: "anuncios", ultimo_sucesso: sucessoHoje, motivo: "Anúncios lidos da planilha da equipe", motivo_dono: "manual" });
  assert.equal(planilha.dono, "manual");
  r = notaDasFontes({ instagram: ig, anuncios: planilha, crm });
  assert.equal(r.nota, 87);
  assert.ok(r.motivos.includes("Anúncios por planilha sem lançamento desde 05/10: quem resolve é a equipe"));

  // Todas as ligadas neutras: 100 com os alertas (não "sem nota").
  r = notaDasFontes({ anuncios: anunciosCliente, crm: crmParado });
  assert.equal(r.nota, 100);
  assert.equal(r.motivos.length, 2);

  // Um fato, um desconto: ads-sem-gasto não repete Anúncios parada pelo cliente.
  const semGasto = [{ id: "ads-sem-gasto", severidade: "media" as const }];
  assert.equal(notaDasFontes({ instagram: ig, anuncios: anunciosCliente, crm }, semGasto).nota, 100);
  assert.equal(notaDasFontes({ instagram: ig, anuncios: st("2026-10-15", { fonte: "anuncios" }), crm }, semGasto).nota, 95);

  // A mesma família (90 dias e 30 dias) conta uma vez.
  r = notaDasFontes({ instagram: ig, crm }, [{ id: "crm-ganho-sem-valor", severidade: "media" }, { id: "crm-ganho-sem-valor-30d", severidade: "media" }]);
  assert.equal(r.nota, 95);
  assert.ok(r.motivos.includes("1 problema de dado"));
  // Na família, fica a maior severidade, no lugar do primeiro.
  assert.deepEqual(
    problemasQueContam({}, [{ id: "x-30d", severidade: "media" }, { id: "y", severidade: "baixa" }, { id: "x", severidade: "alta" }]),
    [{ id: "x", severidade: "alta" }, { id: "y", severidade: "baixa" }],
  );

  // sync-erro-<fonte> não repete a fonte já vermelha "Erro"; com a fonte em dia, desconta.
  const syncErro = [{ id: "sync-erro-anuncios", severidade: "alta" as const }];
  const anunciosErro = st("2026-10-15", { fonte: "anuncios", last_error: "falhou a leitura" });
  assert.equal(anunciosErro.rotulo, "Erro");
  assert.equal(notaDasFontes({ instagram: ig, anuncios: anunciosErro, crm }, syncErro).nota, 67, "(100+0+100)/3, sem o -15");
  assert.equal(notaDasFontes({ instagram: ig, anuncios: st("2026-10-15", { fonte: "anuncios" }), crm }, syncErro).nota, 85);

  // Falha de verdade continua custando: Parada vermelha vale 0 (o caso de 40 acima) e problema sem id conta um a um.
  assert.equal(notaDasFontes({ instagram: ig, anuncios: st("2026-10-01"), crm: st(null) }).nota, 40);
  assert.equal(problemasQueContam({}, [{ severidade: "media" }, { severidade: "media" }]).length, 2);

  // As barras espelham: neutra cheia "(fora da conta)", planilha 0,6, problemas já sem repetição.
  const barras = fatoresDaNota({ instagram: ig, anuncios: anunciosCliente, crm: crmParado }, [...semGasto, { id: "crm-sem-origem", severidade: "media" }]);
  assert.deepEqual(
    barras.map((b) => [b.rotulo, b.exibicao, b.fracao, !!b.faltou]),
    [["Instagram", "em dia", 1, false], ["Anúncios", "parada pelo cliente (fora da conta)", 1, false], ["CRM", "sem movimento (fora da conta)", 1, false], ["Problemas de dado", "1", 0.875, false]],
  );
  const comPlanilha = fatoresDaNota({ instagram: ig, anuncios: planilha, crm });
  assert.equal(comPlanilha.find((b) => b.rotulo === "Anúncios")?.fracao, 0.6);
  for (const b of [...barras, ...comPlanilha]) assert.doesNotMatch(`${b.rotulo} ${b.exibicao}`, /pontos?|\+\d/i);
}

console.log("ok nota-fontes");
