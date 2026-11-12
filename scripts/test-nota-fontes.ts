import assert from "node:assert/strict";
import { statusDaFonte } from "../src/lib/status-fonte";
import { fatoresDaNota, notaDasFontes } from "../src/lib/nota-fontes";

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

console.log("ok nota-fontes");
