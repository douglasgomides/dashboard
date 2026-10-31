// Funil sem taxa falsa: mínimo de base por etapa e agendados que são só os ganhos.
// Números das Dras./Drs. tirados de jornada_funil e crm_diagnostico_comercial (outubro de 2026, leitura em 31/10).
// npx tsx scripts/test-funil-taxa.ts
import assert from "node:assert/strict";
import { agendadosSaoGanhos, minimoDaBase, passagem, AVISO_MUDANCA_FUNIL } from "../src/lib/funil-taxa";
import { LIMITES } from "../src/lib/limites";
import { montarFunil as montarJornada, type FunilBanco } from "../src/lib/jornada-funil";
import { lerDiagnosticoRpc, montarFunil as montarComercial } from "../src/lib/comercial";

// Mínimos combinados.
assert.equal(LIMITES.funil.minLeads, 30);
assert.equal(LIMITES.funil.minAgendamentos, 20);
assert.equal(LIMITES.funil.minConsultas, 15);
assert.equal(minimoDaBase("consultas"), 15);

// passagem: abaixo do mínimo vira "N de M"; no mínimo vira %; sem base, nada.
assert.deepEqual(passagem(8, 14, "agendamentos"), { taxa: null, fracao: { n: 8, m: 14 } });
assert.deepEqual(passagem(10, 20, "agendamentos"), { taxa: 0.5, fracao: null });
assert.deepEqual(passagem(5, 29, "leads"), { taxa: null, fracao: { n: 5, m: 29 } });
assert.deepEqual(passagem(6, 30, "leads"), { taxa: 0.2, fracao: null });
assert.deepEqual(passagem(7, 14, "consultas"), { taxa: null, fracao: { n: 7, m: 14 } });
assert.deepEqual(passagem(3, 15, "consultas"), { taxa: 0.2, fracao: null });
assert.deepEqual(passagem(3, 0, "leads"), { taxa: null, fracao: null });
assert.deepEqual(passagem(null, 50, "leads"), { taxa: null, fracao: null });

// Agendados derivados de ganhos.
assert.equal(agendadosSaoGanhos(7, 7), true); // Samira
assert.equal(agendadosSaoGanhos(147, 147), true); // Sergio
assert.equal(agendadosSaoGanhos(14, 8), false); // HOMS: 6 numa etapa de consulta
assert.equal(agendadosSaoGanhos(0, 0), false); // sem ganho, nada a dizer
assert.equal(agendadosSaoGanhos(null, 5), false);

// Aviso de tela em português simples, sem travessão.
assert.match(AVISO_MUDANCA_FUNIL, /^Mudou em 31\/10:/);
assert.ok(!AVISO_MUDANCA_FUNIL.includes("—"));

// ---------------------------------------------------------------- dados reais
const contagem = (o: Record<string, number>) => ({ dono_conhecido: true, origem_eh_funil: 0, ganhos_em_etapa_agenda: 0, ...o });
const rpc = {
  samira: {
    base: contagem({ leads: 1061, ganhos: 236, abertos: 818, perdidos: 7, agendados: 269, atendidos: 856, com_origem: 337, na_entrada: 205, com_contato: 852, em_consulta: 33, na_entrada_3d: 197, parece_consulta: 0, abertos_sem_dono: 205, agendados_provaveis: 269 }),
    periodo: contagem({ leads: 105, ganhos: 7, abertos: 98, perdidos: 0, agendados: 7, atendidos: 67, com_origem: 18, na_entrada: 38, com_contato: 67, em_consulta: 0, na_entrada_3d: 30, parece_consulta: 0, abertos_sem_dono: 38, agendados_provaveis: 7 }),
    provider: "kommo", etapas_total: 21, etapas_consulta: 2, etapas_consulta_equipe: 2, etapas_parece_consulta: 0, lista_importada: 0, lista_importada_periodo: 0,
  },
  sergio: {
    base: contagem({ leads: 2480, ganhos: 1815, abertos: 652, perdidos: 10, agendados: 1815, atendidos: 2480, com_origem: 55, na_entrada: 0, com_contato: 1619, em_consulta: 0, na_entrada_3d: 0, parece_consulta: 0, abertos_sem_dono: 652, agendados_provaveis: 1815 }),
    periodo: contagem({ leads: 236, ganhos: 147, abertos: 86, perdidos: 0, agendados: 147, atendidos: 236, com_origem: 40, na_entrada: 0, com_contato: 195, em_consulta: 0, na_entrada_3d: 0, parece_consulta: 0, abertos_sem_dono: 86, agendados_provaveis: 147 }),
    provider: "flwchat", etapas_total: 31, etapas_consulta: 6, etapas_consulta_equipe: 6, etapas_parece_consulta: 0, lista_importada: 0, lista_importada_periodo: 0,
  },
  homs: {
    base: contagem({ leads: 8830, ganhos: 480, abertos: 6474, perdidos: 1876, agendados: 1576, atendidos: 7062, com_origem: 3844, na_entrada: 1768, com_contato: 6589, em_consulta: 1096, na_entrada_3d: 1709, parece_consulta: 1333, abertos_sem_dono: 114, agendados_provaveis: 2909 }),
    periodo: contagem({ leads: 1313, ganhos: 8, abertos: 957, perdidos: 348, agendados: 14, atendidos: 979, com_origem: 522, na_entrada: 334, com_contato: 903, em_consulta: 6, na_entrada_3d: 275, parece_consulta: 323, abertos_sem_dono: 75, agendados_provaveis: 337 }),
    provider: "kommo", etapas_total: 37, etapas_consulta: 2, etapas_consulta_equipe: 2, etapas_parece_consulta: 2, lista_importada: 0, lista_importada_periodo: 0,
  },
};
const fontes = (o: Partial<FunilBanco["fontes"]>): FunilBanco["fontes"] => ({ tem_instagram: true, tem_comentarios: true, tem_whatsapp: false, tem_conversas: true, tem_crm: true, tem_etapa_agendamento: true, tem_venda_registrada: true, crm_provider: "kommo", ...o });
const banco = {
  samira: { alcance: 0, dias_alcance: 0, interacoes: 0, dias_interacoes: 0, comentarios: 0, comentaristas: 0, conversas: 428, leads: 105, leads_com_etapa: 105, agendados: 7, vendas: 7, receita: 0, dias_periodo: 31, fontes: fontes({ tem_instagram: false, tem_comentarios: false }) },
  sergio: { alcance: 229512, dias_alcance: 29, interacoes: 10256, dias_interacoes: 29, comentarios: 118, comentaristas: 0, conversas: 913, leads: 236, leads_com_etapa: 236, agendados: 147, vendas: 147, receita: 95485, dias_periodo: 31, fontes: fontes({ tem_whatsapp: true, crm_provider: "flwchat" }) },
  homs: { alcance: 1465, dias_alcance: 29, interacoes: 166, dias_interacoes: 29, comentarios: 7, comentaristas: 6, conversas: 3341, leads: 1313, leads_com_etapa: 1313, agendados: 14, vendas: 8, receita: 0, dias_periodo: 31, fontes: fontes({}) },
} satisfies Record<string, FunilBanco>;

const ler = (k: keyof typeof rpc) => {
  const dc = lerDiagnosticoRpc(rpc[k], { whatsappConectado: false });
  assert.equal(dc.escopo, "periodo");
  const comercial = montarComercial(dc);
  return { comercial, jornada: montarJornada(banco[k], comercial), semDiagnostico: montarJornada(banco[k]) };
};
const etapa = (f: ReturnType<typeof montarJornada>, id: string) => f.etapas.find((e) => e.id === id)!;
const passo = (f: ReturnType<typeof montarComercial>, id: string) => f.passos.find((p) => p.id === id)!;

// Samira: antes "100% passam para venda" (7 de 7). Agora agendamento não medido e nenhuma % de agendou para comprou.
{
  const { comercial, jornada, semDiagnostico } = ler("samira");
  for (const f of [jornada, semDiagnostico]) {
    assert.equal(etapa(f, "agendamento").valor, null);
    assert.equal(etapa(f, "agendamento").estado, "parcial");
    assert.match(etapa(f, "agendamento").explicacao!, /^Não medido: os 7 agendados do período são os mesmos 7 ganhos/);
    assert.equal(etapa(f, "venda").taxa, null);
    assert.equal(etapa(f, "venda").fracao, null);
    assert.ok(f.etapas.every((e) => e.taxa === null || e.taxa < 1), "Samira: nenhuma passagem de 100%");
  }
  assert.equal(jornada.maiorQueda, null);
  assert.equal(passo(comercial, "agendaram").valor, null);
  assert.equal(passo(comercial, "agendaram").faixa, null);
  assert.equal(passo(comercial, "compraram").anterior, "foram atendidos"); // pula o passo sem número
  assert.ok(Math.abs(passo(comercial, "compraram").pctDoAnterior! - 7 / 67) < 1e-9);
  assert.equal(comercial.maiorPerda?.para, "atendidos");
}

// Sergio: antes 147 de 147 (100%). Agora agendamento não medido; sem "maior perda" de 0.
{
  const { comercial, jornada, semDiagnostico } = ler("sergio");
  for (const f of [jornada, semDiagnostico]) {
    assert.equal(etapa(f, "agendamento").valor, null);
    assert.equal(etapa(f, "venda").taxa, null);
    assert.equal(etapa(f, "venda").valor, 147);
  }
  assert.ok(Math.abs(etapa(jornada, "lead").taxa! - 236 / 913) < 1e-9);
  assert.deepEqual(jornada.maiorQueda?.para, "lead");
  assert.equal(passo(comercial, "agendaram").valor, null);
  assert.equal(comercial.maiorPerda, null); // entraram -> atendidos perde 0: não é "quebra"
}

// HOMS: agendados medidos (14, com 6 numa etapa de consulta), mas 14 < 20: venda mostra "8 de 14", sem %.
{
  const { comercial, jornada } = ler("homs");
  assert.equal(etapa(jornada, "agendamento").valor, 14);
  assert.ok(Math.abs(etapa(jornada, "agendamento").taxa! - 14 / 1313) < 1e-9);
  assert.equal(etapa(jornada, "venda").taxa, null);
  assert.deepEqual(etapa(jornada, "venda").fracao, { n: 8, m: 14 });
  assert.equal(jornada.maiorQueda?.para, "agendamento");
  const c = passo(comercial, "compraram");
  assert.equal(c.pctDoAnterior, null);
  assert.deepEqual(c.fracaoDoAnterior, { n: 8, m: 14 });
  assert.equal(c.anterior, "agendaram");
  assert.equal(comercial.maiorPerda?.de, "atendidos");
  assert.equal(comercial.maiorPerda?.para, "agendaram");
}

// Contrato: nenhuma taxa sai de base abaixo do mínimo, e toda taxa tem numerador contido no denominador... ou fica sem %.
for (const k of ["samira", "sergio", "homs"] as const) {
  const { comercial, jornada } = ler(k);
  jornada.etapas.forEach((e, i) => {
    if (e.taxa === null || i === 0) return;
    const ant = jornada.etapas[i - 1];
    if (ant.id === "lead" || ant.id === "conversa") assert.ok(ant.valor! >= 30, `${k}: ${e.id} com base de leads >= 30`);
    if (ant.id === "agendamento") assert.ok(ant.valor! >= 20, `${k}: ${e.id} com base de agendamentos >= 20`);
  });
  for (const p of comercial.passos) assert.ok(!(p.pctDoAnterior !== null && p.fracaoDoAnterior !== null), `${k}: ${p.id} não mostra % e N de M juntos`);
}

// Funil pequeno: 12 leads, 4 agendam. Sem % nenhuma; "N de M" e sem "de cada 10".
{
  const pequeno: FunilBanco = { ...banco.homs, conversas: 0, leads: 12, leads_com_etapa: 12, agendados: 4, vendas: 1, fontes: fontes({}) };
  const f = montarJornada(pequeno);
  assert.deepEqual(etapa(f, "agendamento").fracao, { n: 4, m: 12 });
  assert.deepEqual(etapa(f, "venda").fracao, { n: 1, m: 4 });
  assert.equal(f.maiorQueda, null);
}

console.log("test-funil-taxa: ok");
