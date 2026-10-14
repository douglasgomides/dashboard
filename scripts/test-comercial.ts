// Teste do diagnóstico comercial com dados reais (saída da RPC crm_diagnostico_comercial,
// rodada em leitura no banco em 13/10/2026, período 13/09–12/10/2026).
// Rodar: npx tsx scripts/test-comercial.ts
import { lerDiagnosticoRpc, montarDadosReduzidos, lerComercial, tipoProblema, type DadosComerciais } from "../src/lib/comercial";

const rpc = {
  lana: {
    base: {
      leads: 9906,
      ganhos: 6,
      abertos: 8443,
      perdidos: 1457,
      agendados: 200,
      atendidos: 4827,
      com_origem: 3188,
      na_entrada: 5079,
      com_contato: 0,
      em_consulta: 194,
      na_entrada_3d: 5077,
      dono_conhecido: true,
      origem_eh_funil: 0,
      parece_consulta: 0,
      abertos_sem_dono: 2,
      agendados_provaveis: 200,
      ganhos_em_etapa_agenda: 0,
    },
    periodo: {
      leads: 978,
      ganhos: 0,
      abertos: 930,
      perdidos: 48,
      agendados: 20,
      atendidos: 915,
      com_origem: 526,
      na_entrada: 63,
      com_contato: 0,
      em_consulta: 20,
      na_entrada_3d: 63,
      dono_conhecido: true,
      origem_eh_funil: 0,
      parece_consulta: 0,
      abertos_sem_dono: 0,
      agendados_provaveis: 20,
      ganhos_em_etapa_agenda: 0,
    },
    provider: "kommo",
    etapas_total: 67,
    etapas_entrada: 11,
    etapas_consulta: 5,
    lista_importada: 517,
    crm_compartilhado: { nomes: null, clientes: 0 },
    etapas_consulta_equipe: 0,
    etapas_parece_consulta: 1,
    lista_importada_periodo: 0,
  },
  marcelly: {
    base: {
      leads: 1008,
      ganhos: 39,
      abertos: 839,
      perdidos: 130,
      agendados: 61,
      atendidos: 546,
      com_origem: 0,
      na_entrada: 460,
      com_contato: 1007,
      em_consulta: 37,
      na_entrada_3d: 406,
      dono_conhecido: true,
      origem_eh_funil: 1008,
      parece_consulta: 34,
      abertos_sem_dono: 492,
      agendados_provaveis: 78,
      ganhos_em_etapa_agenda: 32,
    },
    periodo: {
      leads: 659,
      ganhos: 9,
      abertos: 640,
      perdidos: 10,
      agendados: 17,
      atendidos: 200,
      com_origem: 0,
      na_entrada: 458,
      com_contato: 658,
      em_consulta: 12,
      na_entrada_3d: 406,
      dono_conhecido: true,
      origem_eh_funil: 659,
      parece_consulta: 14,
      abertos_sem_dono: 463,
      agendados_provaveis: 26,
      ganhos_em_etapa_agenda: 9,
    },
    provider: "clint",
    etapas_total: 44,
    etapas_entrada: 19,
    etapas_consulta: 2,
    lista_importada: 3084,
    crm_compartilhado: { nomes: null, clientes: 0 },
    etapas_consulta_equipe: 0,
    etapas_parece_consulta: 3,
    lista_importada_periodo: 3084,
  },
  doctorCreator: {
    base: {
      leads: 2625,
      ganhos: 4,
      abertos: 2613,
      perdidos: 8,
      agendados: 4,
      atendidos: 222,
      com_origem: 0,
      na_entrada: 2395,
      com_contato: 2597,
      em_consulta: 0,
      na_entrada_3d: 2384,
      dono_conhecido: true,
      origem_eh_funil: 2625,
      parece_consulta: 0,
      abertos_sem_dono: 1984,
      agendados_provaveis: 4,
      ganhos_em_etapa_agenda: 0,
    },
    periodo: {
      leads: 352,
      ganhos: 0,
      abertos: 351,
      perdidos: 1,
      agendados: 0,
      atendidos: 37,
      com_origem: 0,
      na_entrada: 314,
      com_contato: 345,
      em_consulta: 0,
      na_entrada_3d: 303,
      dono_conhecido: true,
      origem_eh_funil: 352,
      parece_consulta: 0,
      abertos_sem_dono: 339,
      agendados_provaveis: 0,
      ganhos_em_etapa_agenda: 0,
    },
    provider: "clint",
    etapas_total: 22,
    etapas_entrada: 4,
    etapas_consulta: 0,
    lista_importada: 0,
    crm_compartilhado: { nomes: null, clientes: 0 },
    etapas_consulta_equipe: 0,
    etapas_parece_consulta: 0,
    lista_importada_periodo: 0,
  },
  julianaPaola: {
    base: {
      leads: 4177,
      ganhos: 235,
      abertos: 3942,
      perdidos: 0,
      agendados: 235,
      atendidos: 2730,
      com_origem: 0,
      na_entrada: 1447,
      com_contato: 4,
      em_consulta: 0,
      na_entrada_3d: 1447,
      dono_conhecido: true,
      origem_eh_funil: 0,
      parece_consulta: 235,
      abertos_sem_dono: 0,
      agendados_provaveis: 235,
      ganhos_em_etapa_agenda: 235,
    },
    periodo: {
      leads: 223,
      ganhos: 10,
      abertos: 213,
      perdidos: 0,
      agendados: 10,
      atendidos: 138,
      com_origem: 0,
      na_entrada: 85,
      com_contato: 0,
      em_consulta: 0,
      na_entrada_3d: 85,
      dono_conhecido: true,
      origem_eh_funil: 0,
      parece_consulta: 10,
      abertos_sem_dono: 0,
      agendados_provaveis: 10,
      ganhos_em_etapa_agenda: 10,
    },
    provider: "flwchat",
    etapas_total: 5,
    etapas_entrada: 1,
    etapas_consulta: 0,
    lista_importada: 0,
    crm_compartilhado: { nomes: null, clientes: 0 },
    etapas_consulta_equipe: 0,
    etapas_parece_consulta: 2,
    lista_importada_periodo: 0,
  },
  fernanda: {
    base: {
      leads: 107,
      ganhos: 10,
      abertos: 96,
      perdidos: 1,
      agendados: 10,
      atendidos: 83,
      com_origem: 95,
      na_entrada: 24,
      com_contato: 107,
      em_consulta: 0,
      na_entrada_3d: 24,
      dono_conhecido: true,
      origem_eh_funil: 0,
      parece_consulta: 16,
      abertos_sem_dono: 0,
      agendados_provaveis: 22,
      ganhos_em_etapa_agenda: 4,
    },
    periodo: {
      leads: 28,
      ganhos: 0,
      abertos: 28,
      perdidos: 0,
      agendados: 0,
      atendidos: 19,
      com_origem: 17,
      na_entrada: 9,
      com_contato: 28,
      em_consulta: 0,
      na_entrada_3d: 9,
      dono_conhecido: true,
      origem_eh_funil: 0,
      parece_consulta: 6,
      abertos_sem_dono: 0,
      agendados_provaveis: 6,
      ganhos_em_etapa_agenda: 0,
    },
    provider: "rdstation",
    etapas_total: 8,
    etapas_entrada: 1,
    etapas_consulta: 0,
    lista_importada: 0,
    crm_compartilhado: { nomes: null, clientes: 0 },
    etapas_consulta_equipe: 0,
    etapas_parece_consulta: 1,
    lista_importada_periodo: 0,
  },
  anaClaudia: {
    base: {
      leads: 7848,
      ganhos: 387,
      abertos: 6338,
      perdidos: 1123,
      agendados: 388,
      atendidos: 6363,
      com_origem: 3476,
      na_entrada: 1485,
      com_contato: 5934,
      em_consulta: 1,
      na_entrada_3d: 1466,
      dono_conhecido: true,
      origem_eh_funil: 0,
      parece_consulta: 1047,
      abertos_sem_dono: 0,
      agendados_provaveis: 1435,
      ganhos_em_etapa_agenda: 0,
    },
    periodo: {
      leads: 1294,
      ganhos: 2,
      abertos: 1277,
      perdidos: 15,
      agendados: 3,
      atendidos: 881,
      com_origem: 666,
      na_entrada: 413,
      com_contato: 796,
      em_consulta: 1,
      na_entrada_3d: 394,
      dono_conhecido: true,
      origem_eh_funil: 0,
      parece_consulta: 253,
      abertos_sem_dono: 0,
      agendados_provaveis: 256,
      ganhos_em_etapa_agenda: 0,
    },
    provider: "kommo",
    etapas_total: 37,
    etapas_entrada: 9,
    etapas_consulta: 1,
    lista_importada: 0,
    crm_compartilhado: { nomes: [], clientes: 2 },
    etapas_consulta_equipe: 0,
    etapas_parece_consulta: 2,
    lista_importada_periodo: 0,
  },
};

// WTS real no mesmo período (wts_resumo): só a Juliana Paola tem WhatsApp ligado entre estes.
const wtsJuliana = {
  atendimentos: 21,
  espera_mediana_seg: 4316,
  espera_cobertura: 13,
};

const casos: [string, DadosComerciais][] = [
  ["Lana Torres (Kommo)", lerDiagnosticoRpc(rpc.lana, { whatsappConectado: false })],
  ["Dra. Marcelly Achkar (Clint)", lerDiagnosticoRpc(rpc.marcelly, { whatsappConectado: false })],
  ["Doctor Creator (Clint)", lerDiagnosticoRpc(rpc.doctorCreator, { whatsappConectado: false })],
  [
    "Dra. Juliana Paola (WTS/flwchat)",
    lerDiagnosticoRpc(rpc.julianaPaola, {
      whatsappConectado: true,
      wts: wtsJuliana,
    }),
  ],
  ["Dra. Fernanda Nunes (RD Station)", lerDiagnosticoRpc(rpc.fernanda, { whatsappConectado: false })],
  ["Dra. Ana Claudia (Kommo compartilhado HOMS)", lerDiagnosticoRpc(rpc.anaClaudia, { whatsappConectado: false })],
  // Sem a RPC: o que o front monta com as funções que já existem (Fernanda, dados reais).
  [
    "Dra. Fernanda Nunes — leitura reduzida (sem RPC)",
    montarDadosReduzidos({
      provider: "rdstation",
      metricas: {
        total_leads: 107,
        consultas_agendadas: 0,
        ganhos: 10,
        perdidos: 1,
        fonte_preenchida_pct: 88.8,
      },
      etapas: [
        { pipeline: "Pacientes", etapa: "Qualificação / Interesse", total: 26 },
        { pipeline: "Pacientes", etapa: "Novo Lead", total: 24 },
        { pipeline: "Pacientes", etapa: "Agendado", total: 16 },
        { pipeline: "Pacientes", etapa: "Recall", total: 12 },
        { pipeline: "Pacientes", etapa: "Pós Venda", total: 11 },
        { pipeline: "Pacientes", etapa: "Contato realizado", total: 8 },
        { pipeline: "Pacientes", etapa: "Proposta em análise", total: 7 },
        { pipeline: "Pacientes", etapa: "Acordo de prosposta", total: 3 },
      ],
      jornada: { leads_total: 107, leads_sem_pessoa: 3 },
      whatsappConectado: false,
    }),
  ],
];

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) {
    falhas++;
    console.log(`  ✗ FALHOU: ${msg}`);
  }
};

const ICONE = { feito: "✔", parcial: "◐", falta: "✘", sem_dado: "?" } as const;
for (const [nome, d] of casos) {
  const r = lerComercial(d);
  console.log(`\n=== ${nome} — ${r.funil.escopoTexto} ===`);
  for (const p of r.funil.passos) {
    const v = p.valor === null ? "—" : p.valor.toLocaleString("pt-BR");
    const extra = [
      p.pctDoAnterior !== null ? `${Math.round(p.pctDoAnterior * 100)}% do anterior` : "",
      p.deCada ?? "",
      p.faixa ? `[${p.faixa}]` : "",
      p.estimado ? "(estimado)" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(`  ${p.rotulo.padEnd(16)} ${v.padStart(7)}  ${extra}${p.aviso ? `\n${" ".repeat(27)}aviso: ${p.aviso}` : ""}`);
  }
  if (r.funil.maiorPerda)
    console.log(
      `  maior perda: ${r.funil.maiorPerda.de} → ${r.funil.maiorPerda.para} (${Math.round(r.funil.maiorPerda.pct * 100)}%, ${r.funil.maiorPerda.tipo})`,
    );
  console.log("  checklist:");
  for (const it of r.checklist)
    console.log(
      `    ${ICONE[it.status]} ${it.titulo.padEnd(32)} ${it.pct !== null ? `${Math.round(it.pct * 100)}%`.padStart(4) : "    "}  ${it.detalhe}  [${it.resolve}]`,
    );
  console.log("  problemas:");
  for (const i of r.insights)
    console.log(
      `    ${(tipoProblema(i) ?? "?").padEnd(12)} ${i.tom.padEnd(7)} ${i.confianca.padEnd(5)} ${i.titulo}\n${" ".repeat(18)}→ ${i.acao?.texto ?? "-"} (${i.responsavel})`,
    );
  for (const l of r.limitacoes) console.log(`  limitação: ${l.texto}`);

  // Contrato: todo insight é da área comercial, tem tipo, ação e evidência.
  for (const i of r.insights) {
    ok(i.area === "comercial", `${i.id} área comercial`);
    ok(tipoProblema(i) !== null, `${i.id} tem tipo`);
    ok(!!i.acao?.texto && !!i.evidencia, `${i.id} tem ação e evidência`);
    ok(["comercial", "atendimento", "equipe_hub"].includes(i.responsavel), `${i.id} responsável comercial/atendimento/equipe_hub`);
  }
  // Só pinta contra o mercado quando a etapa de consulta é confirmada.
  for (const p of r.funil.passos) if (p.faixa) ok(p.confiavel && !p.estimado, `${nome}: faixa só com número confiável`);
}

// Verificações específicas com os dados reais.
const L = lerComercial(casos[0][1]);
ok(L.checklist.find((i) => i.id === "contato")!.status === "falta", "Lana: sem telefone sincronizado");
ok(L.checklist.find((i) => i.id === "resultado")!.status === "parcial", "Lana: ganho pouco registrado");
const M = lerComercial(casos[1][1]);
ok(M.checklist.find((i) => i.id === "origem")!.status === "parcial", "Marcelly: origem = nome do funil");
ok(
  M.insights.some((i) => i.id === "comercial:operacao:sem-dono"),
  "Marcelly: leads sem dono",
);
const J = lerComercial(casos[3][1]);
ok(J.funil.passos.find((p) => p.id === "compraram")!.valor === null, "Juliana Paola: ganho = agendamento, compra desconhecida");
ok(
  J.insights.some((i) => i.id === "comercial:operacao:primeira-resposta"),
  "Juliana Paola: tempo de resposta do WhatsApp",
);
const A = lerComercial(casos[5][1]);
ok(
  A.insights.some((i) => i.id === "comercial:rastreamento:crm-compartilhado"),
  "Ana Claudia: CRM compartilhado",
);
const F = lerComercial(casos[6][1]);
ok(
  F.limitacoes.some((l) => l.id === "comercial-leitura-reduzida"),
  "Fernanda reduzida: avisa leitura reduzida",
);

console.log(falhas ? `\n${falhas} verificação(ões) falharam` : "\nTodas as verificações passaram");
if (falhas) process.exit(1);
