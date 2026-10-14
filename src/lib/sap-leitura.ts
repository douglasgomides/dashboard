// SAP · Leitura semanal automática (08.05 · Rotina de Leitura Semanal e Plano por Vazamento).
//
// Toda segunda a Doctor Creator lê o funil numa ordem fixa (8 passos), acha a etapa que mais vaza,
// escolhe UMA ação por lado (DC e clínica) pelo mapa V1–V20 e sabe quando escalar ao Fundador.
// Aqui a leitura sai pronta a partir do tracker automático (últimas 4 semanas fechadas), da baseline e
// das metas. Lógica pura: scripts/test-sap-leitura.ts.
//
// Ordem de escolha entre vazamentos (08.05, 3.6):
//   1. dado ruim (V15 linhas incompletas, V1 divergência) vem antes de tudo;
//   2. tempo de resposta vermelho (V4/V5) vem antes de qualquer ajuste de anúncio;
//   3. depois, a etapa com maior perda estimada (tratamentos perdidos × ticket de referência).
import { montarKpisSap, REF_SAP, type TrackerAutoBruto } from "@/lib/sap-auto";
import type { LinhaPlano } from "@/lib/sap-metas";

export type CodigoV = `V${number}`;

export interface Vazamento {
  codigo: CodigoV;
  grupo: "Dado e atração" | "Conversa e agendamento" | "Confirmação e comparecimento" | "Consulta e decisão" | "Registro, fidelização e indicação";
  titulo: string;
  sintoma: string;
  acaoDc: string | null;
  acaoClinica: string | null;
  dono: string;
  prazo: string;
}

// Mapa do 08.05, seção 3 (texto resumido, mesma ação padrão).
export const MAPA_VAZAMENTOS: Vazamento[] = [
  { codigo: "V1", grupo: "Dado e atração", titulo: "Plataforma e CRM não batem", sintoma: "Divergência plataforma × CRM acima de 20%", acaoDc: "Testar o caminho completo com um lead de teste, conferir se a fonte de dados foi classificada como saúde e corrigir UTM e integração.", acaoClinica: "Registrar todo lead novo no dia, com a origem.", dono: "Gestor de Tráfego; recepção", prazo: "2 dias úteis" },
  { codigo: "V2", grupo: "Dado e atração", titulo: "Lead desqualificado", sintoma: "Qualificação (A+B ÷ leads) caiu 10 p.p. ou mais", acaoDc: "Trocar o ângulo do anúncio para educação de mecanismo e situação do paciente; revisar a pergunta de filtro; checar idade e região.", acaoClinica: null, dono: "Gestor de Tráfego + Editor e Copy", prazo: "1 semana" },
  { codigo: "V3", grupo: "Dado e atração", titulo: "Fadiga de criativo", sintoma: "CTR caiu e custo por lead subiu 30% ou mais em 2 semanas, com a mesma verba", acaoDc: "Subir 2 a 3 criativos novos; impulsionar o post orgânico que performou; subir verba só 20% a 30% a cada 3 a 4 dias.", acaoClinica: null, dono: "Gestor de Tráfego + Editor e Copy", prazo: "3 dias úteis" },
  { codigo: "V4", grupo: "Conversa e agendamento", titulo: "Resposta lenta", sintoma: "1ª resposta (mediana) acima da meta D90", acaoDc: "Conferir regra de horário e resposta automática; alerta de lead sem resposta em 5 min.", acaoClinica: "Definir um responsável fixo pelo WhatsApp por turno, com substituto.", dono: "Recepção líder; CS e Relacionamento", prazo: "2 dias úteis" },
  { codigo: "V5", grupo: "Conversa e agendamento", titulo: "Lead fora do horário espera", sintoma: "Mediana boa, mas menos de 60% respondidos em até 5 min", acaoDc: "Mensagem de abertura fora do horário com pergunta e contato no primeiro horário útil.", acaoClinica: "Abrir o WhatsApp antes da primeira consulta do dia.", dono: "CS e Relacionamento; recepção", prazo: "1 semana" },
  { codigo: "V6", grupo: "Conversa e agendamento", titulo: "Conversa não conduz ao agendamento", sintoma: "Agendamento abaixo da baseline com tempo de resposta bom", acaoDc: "Auditar 10 conversas da semana e fazer retreino de 30 min nos pontos que caíram (perguntar antes, oferecer dois horários).", acaoClinica: "Oferecer sempre dois horários e pedir que o paciente escreva o horário combinado.", dono: "CS e Relacionamento", prazo: "Retreino em até 5 dias úteis" },
  { codigo: "V7", grupo: "Conversa e agendamento", titulo: "Quem pede valor some", sintoma: "Leads que pediram valores agendam menos que os outros", acaoDc: "Ajustar a resposta de valor: o que a avaliação inclui e convite com horário.", acaoClinica: "Nunca mandar preço seco: explicar a avaliação e oferecer horário.", dono: "CS e Relacionamento", prazo: "3 dias úteis" },
  { codigo: "V8", grupo: "Confirmação e comparecimento", titulo: "Paciente não comparece", sintoma: "Comparecimento abaixo da baseline ou abaixo de 75%", acaoDc: "Conferir na auditoria se a régua de confirmação saiu para 90% ou mais dos agendados.", acaoClinica: "Confirmação D-1 com resposta escrita e ligação para quem não respondeu até as 16h.", dono: "Recepção líder; CS e Relacionamento", prazo: "Na semana" },
  { codigo: "V9", grupo: "Confirmação e comparecimento", titulo: "Remarcação que some", sintoma: "\"Remarcou\" acima de 10% dos agendados", acaoDc: null, acaoClinica: "Toda desmarcação sai com duas novas opções de horário na mesma conversa; lista de espera para encaixe.", dono: "Recepção líder", prazo: "Na semana" },
  { codigo: "V10", grupo: "Confirmação e comparecimento", titulo: "Agenda longe demais", sintoma: "Comparecimento cai quando a consulta fica longe da entrada do lead", acaoDc: "Segurar verba se a agenda não absorver.", acaoClinica: "Abrir horários de avaliação na semana (encaixe, outro profissional para a avaliação inicial).", dono: "Decisor; Gestor de Tráfego", prazo: "2 semanas" },
  { codigo: "V11", grupo: "Consulta e decisão", titulo: "Consulta não converte", sintoma: "Conversão abaixo da baseline por 2 semanas, com motivos espalhados", acaoDc: "Revisar 3 consultas com o médico ou consultora contra o roteiro; simulação extra de 30 min.", acaoClinica: "Plano escrito em toda consulta.", dono: "CS e Relacionamento + médico", prazo: "1 semana" },
  { codigo: "V12", grupo: "Consulta e decisão", titulo: "Objeção de preço, medo ou comparação", sintoma: "Preço, medo ou comparação acima de 40% dos não fechamentos", acaoDc: "Ajustar anúncio e página para tratar a objeção antes da consulta.", acaoClinica: "Apresentar plano completo e faseado com formas de pagamento, sem desconto como gatilho.", dono: "Médico ou consultora; Editor e Copy", prazo: "1 semana" },
  { codigo: "V13", grupo: "Consulta e decisão", titulo: "Paciente sai sem próximo passo", sintoma: "\"Tempo para decidir\" ou \"cônjuge\" alto, ou \"Pensando\" em cadência abaixo de 90%", acaoDc: null, acaoClinica: "Toda consulta sem fechamento termina com data combinada de retorno e cadência ativada no mesmo dia.", dono: "Consultora ou recepção", prazo: "Na semana" },
  { codigo: "V14", grupo: "Consulta e decisão", titulo: "Follow-up não fecha nada", sintoma: "Nenhum fechamento no follow-up por 3 semanas", acaoDc: "Conferir a data do F1 (meta: 24 h) e ativar a automação da cadência.", acaoClinica: null, dono: "CS e Relacionamento", prazo: "3 dias úteis" },
  { codigo: "V15", grupo: "Registro, fidelização e indicação", titulo: "CRM incompleto", sintoma: "Linhas completas abaixo de 90%", acaoDc: "Mandar na sexta de manhã a lista de pendências do CRM.", acaoClinica: "Nomear um dono do registro e um horário fixo (sexta, 15 min) para completar origem, etapa e valor.", dono: "Recepção líder; Coordenador", prazo: "Até a sexta" },
  { codigo: "V16", grupo: "Registro, fidelização e indicação", titulo: "Indicação não acontece", sintoma: "Indicações abaixo da baseline ou sem código", acaoDc: null, acaoClinica: "Pedir indicação no momento combinado e entregar o código; perguntar \"como conheceu a clínica?\" em toda primeira conversa.", dono: "Recepção; médico", prazo: "2 semanas" },
  { codigo: "V17", grupo: "Registro, fidelização e indicação", titulo: "Retorno e recompra parados", sintoma: "Retornos e recompras abaixo da baseline", acaoDc: "Conferir se a automação de relacionamento está ligada.", acaoClinica: "Enviar o lote de recall e reativação da semana.", dono: "CS e Relacionamento; recepção", prazo: "1 semana" },
  { codigo: "V18", grupo: "Dado e atração", titulo: "Anúncio parou de entregar", sintoma: "Leads caíram 30% ou mais com a mesma verba, ou verba gasta abaixo de 80%", acaoDc: "Abrir Qualidade da conta e diagnóstico do anúncio; avisar a clínica se for pagamento.", acaoClinica: "Regularizar a forma de pagamento no mesmo dia, se for o caso.", dono: "Gestor de Tráfego; decisor", prazo: "1 dia útil" },
  { codigo: "V19", grupo: "Registro, fidelização e indicação", titulo: "Receita caiu com os mesmos fechados", sintoma: "Receita atribuída caiu com o mesmo número de fechados", acaoDc: null, acaoClinica: "Revisar com o médico se o plano completo é apresentado primeiro. Só leitura, não é meta.", dono: "Médico; Coordenador", prazo: "Leitura mensal" },
  { codigo: "V20", grupo: "Dado e atração", titulo: "Consulta de anúncio ficando cara", sintoma: "Custo por consulta realizada subiu 2 semanas seguidas, com agendamento e comparecimento estáveis", acaoDc: "Comparar custo por consulta por canal e mover verba para o que entrega consulta mais barata.", acaoClinica: null, dono: "Gestor de Tráfego", prazo: "Na semana" },
];

export const vazamento = (c: CodigoV) => MAPA_VAZAMENTOS.find((v) => v.codigo === c)!;

export type StatusPasso = "ok" | "alerta" | "sem_dado";
export interface PassoLeitura {
  n: number;
  pergunta: string;
  status: StatusPasso;
  resposta: string;
}

export interface Perda {
  etapa: "agendamento" | "comparecimento" | "conversao";
  rotulo: string;
  atual: number;
  meta: number;
  tratamentos: number;
  reais: number | null;
}

export interface LeituraSemanal {
  semanaPrograma: number | null;
  passos: PassoLeitura[];
  principal: { v: Vazamento; motivo: string; perda?: Perda } | null;
  outros: { v: Vazamento; motivo: string }[];
  perdas: Perda[];
  vermelhosGarantia: string[];
  escalar: string[];
  mensagem: string | null;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const ROTULO_ETAPA = { agendamento: "Agendamento (qualificado → agendou)", comparecimento: "Comparecimento (agendou → veio)", conversao: "Conversão (veio → fechou)" } as const;

export function montarLeitura(args: {
  atual: TrackerAutoBruto; // últimas 4 semanas fechadas
  anterior?: TrackerAutoBruto | null; // as 4 semanas que terminam 7 dias antes (para "2 semanas seguidas")
  plano: LinhaPlano[];
  dia: number | null; // dia do programa
  ticket: number | null; // ticket de referência (cadastro); sem ele, usa receita ÷ fechados com valor
  consultaPaga: boolean;
  score: number | null;
  garantiaAplicaNaPrevia?: boolean | null;
  nomeContato?: string;
}): LeituraSemanal {
  const { atual, plano } = args;
  const l = montarKpisSap(atual);
  const kv = (id: string) => l.kpis.find((k) => k.id === id)!;
  const base = (k: string) => plano.find((p) => p.kpi === k)?.baseline ?? null;
  const meta = (k: string) => plano.find((p) => p.kpi === k)?.meta ?? null;
  const linhas = l.checagens.find((c) => c.id === "linhas")!;
  const diverg = l.checagens.find((c) => c.id === "divergencia")!;
  const resp = kv("resposta");
  const metaResp = meta("resposta") ?? REF_SAP.respostaMin;
  const respVermelha = resp.valor !== null && resp.valor > metaResp;
  const ate5 = atual.resposta_conversas > 0 ? atual.resposta_ate_5min / atual.resposta_conversas : null;

  // Passo 4: KPI vermelho = igual ou pior que a baseline.
  const pior = (id: string, menorMelhor = false) => {
    const v = kv(id).valor;
    const b = base(id);
    if (v === null || b === null) return false;
    return menorMelhor ? v >= b : v <= b;
  };
  const garantiaIds = ["resposta", "comparecimento", args.consultaPaga ? "conversao" : "agendamento"];
  const vermelhos = (["resposta", "agendamento", "comparecimento", "conversao"] as const).filter((id) => pior(id, id === "resposta"));
  const vermelhosGarantia = vermelhos.filter((id) => garantiaIds.includes(id)).map((id) => kv(id).titulo);

  // Passo 5: perda estimada por etapa (meta do plano; sem meta, a referência DC).
  const ticket = args.ticket ?? (atual.fechados_com_valor > 0 ? atual.receita / atual.fechados_com_valor : null);
  const ag = kv("agendamento").valor;
  const co = kv("comparecimento").valor;
  const cv = kv("conversao").valor;
  const alvo = {
    agendamento: meta("agendamento") ?? REF_SAP.agendamento.alvo,
    comparecimento: meta("comparecimento") ?? REF_SAP.comparecimento.alvo,
    conversao: meta("conversao") ?? REF_SAP.conversao.alvo,
  };
  const coEf = co ?? REF_SAP.comparecimento.alvo;
  const cvEf = cv ?? REF_SAP.conversao.alvo;
  const perdas: Perda[] = [];
  if (ag !== null && ag < alvo.agendamento) {
    const t = (alvo.agendamento - ag) * atual.qualificados * coEf * cvEf;
    perdas.push({ etapa: "agendamento", rotulo: ROTULO_ETAPA.agendamento, atual: ag, meta: alvo.agendamento, tratamentos: t, reais: ticket ? t * ticket : null });
  }
  if (co !== null && co < alvo.comparecimento) {
    const t = (alvo.comparecimento - co) * (atual.compareceram + atual.faltaram) * cvEf;
    perdas.push({ etapa: "comparecimento", rotulo: ROTULO_ETAPA.comparecimento, atual: co, meta: alvo.comparecimento, tratamentos: t, reais: ticket ? t * ticket : null });
  }
  if (cv !== null && cv < alvo.conversao) {
    const t = (alvo.conversao - cv) * atual.compareceram;
    perdas.push({ etapa: "conversao", rotulo: ROTULO_ETAPA.conversao, atual: cv, meta: alvo.conversao, tratamentos: t, reais: ticket ? t * ticket : null });
  }
  perdas.sort((a, b) => b.tratamentos - a.tratamentos);
  const maior = perdas[0];

  // Passo 6: tendência das últimas semanas (taxa semanal com menos de 10 casos só serve de tendência).
  const sem = atual.semanas.slice(-3);
  const amostraSemanalPequena = sem.length > 0 && sem.every((s) => s.agendados < 10);

  // Passos 1 a 3 e 7: candidatos pela ordem do 3.6.
  const candidatos: { v: Vazamento; motivo: string; perda?: Perda }[] = [];
  if (linhas.ok === false) candidatos.push({ v: vazamento("V15"), motivo: linhas.texto });
  if (diverg.ok === false) candidatos.push({ v: vazamento("V1"), motivo: diverg.texto });
  if (respVermelha) candidatos.push({ v: vazamento("V4"), motivo: `1ª resposta em ${resp.texto} (meta ${Math.round(metaResp)} min).` });
  else if (resp.valor !== null && ate5 !== null && ate5 < 0.6) candidatos.push({ v: vazamento("V5"), motivo: `Mediana ${resp.texto}, mas só ${pct(ate5)} respondidos em até 5 min.` });
  const ordemPerdas = perdas.map((p) => {
    const motivo = `${p.rotulo}: ${pct(p.atual)} contra meta de ${pct(p.meta)} · cerca de ${p.tratamentos.toFixed(1).replace(".", ",")} tratamentos perdidos${p.reais !== null ? ` (${brl(p.reais)})` : ""} nas últimas 4 semanas.`;
    const v = p.etapa === "agendamento" ? vazamento("V6") : p.etapa === "comparecimento" ? vazamento("V8") : vazamento("V11");
    return { v, motivo, perda: p };
  });
  // V6 só vale com tempo de resposta bom: com resposta vermelha, V4 já cobre.
  for (const c of ordemPerdas) if (!(c.v.codigo === "V6" && respVermelha)) candidatos.push(c);
  if (atual.investido > 0 && atual.leads_plataforma === 0 && atual.leads_crm_meta === 0)
    candidatos.push({ v: vazamento("V18"), motivo: "Há investimento no período, mas nenhum lead de anúncio na plataforma nem no CRM." });

  const principal = candidatos[0] ?? null;
  const outros = candidatos.slice(1).map(({ v, motivo }) => ({ v, motivo }));

  const passos: PassoLeitura[] = [
    { n: 1, pergunta: "O dado é confiável? (linhas completas ≥ 90%)", status: linhas.ok === null ? "sem_dado" : linhas.ok ? "ok" : "alerta", resposta: linhas.texto },
    { n: 2, pergunta: "Plataforma e CRM contam os mesmos leads? (até 20%)", status: diverg.ok === null ? "sem_dado" : diverg.ok ? "ok" : "alerta", resposta: diverg.texto },
    { n: 3, pergunta: "A conversa está segurando o lead? (1ª resposta)", status: resp.valor === null ? "sem_dado" : respVermelha ? "alerta" : "ok", resposta: resp.valor === null ? resp.texto : `${resp.texto} (meta ${Math.round(metaResp)} min)${ate5 !== null ? ` · ${pct(ate5)} em até 5 min` : ""}` },
    {
      n: 4,
      pergunta: "Quais KPIs estão iguais ou piores que a baseline?",
      status: plano.length === 0 ? "sem_dado" : vermelhos.length ? "alerta" : "ok",
      resposta: plano.length === 0 ? "Sem baseline registrada: defina em Metas e garantia." : vermelhos.length ? vermelhos.map((id) => kv(id).titulo).join(", ") : "Nenhum: todos acima da baseline.",
    },
    { n: 5, pergunta: "Onde está a maior perda em tratamentos e em R$?", status: maior ? "alerta" : perdas.length === 0 && (ag ?? co ?? cv) !== null ? "ok" : "sem_dado", resposta: maior ? `${maior.rotulo}: cerca de ${maior.tratamentos.toFixed(1).replace(".", ",")} tratamentos${maior.reais !== null ? ` · ${brl(maior.reais)}` : " (cadastre o ticket para ver em R$)"}` : (ag ?? co ?? cv) !== null ? "Todas as etapas na meta." : "Sem etapas marcadas no CRM para medir." },
    { n: 6, pergunta: "É tendência ou oscilação de uma semana?", status: sem.length < 2 ? "sem_dado" : amostraSemanalPequena ? "alerta" : "ok", resposta: sem.length < 2 ? "Menos de 2 semanas de dado." : amostraSemanalPequena ? "Menos de 10 agendamentos por semana: decida pelas 4 semanas, não pela semana." : "Volume semanal suficiente para ler tendência." },
    { n: 7, pergunta: "Qual vazamento do mapa corresponde ao sintoma?", status: principal ? "alerta" : "ok", resposta: principal ? `${principal.v.codigo} · ${principal.v.titulo}` : "Nenhum vazamento acima do limite." },
    { n: 8, pergunta: "Ação da semana registrada, com dono e prazo?", status: principal ? "alerta" : "ok", resposta: principal ? `Registrar: ${principal.v.dono}, ${principal.v.prazo.toLowerCase()}.` : "Sem ação nova: manter a rotina." },
  ];

  // Escalonamento ao Fundador (08.05, seção 4), com o que o painel consegue ver.
  const escalar: string[] = [];
  const semanaPrograma = args.dia === null ? null : Math.floor(args.dia / 7) + 1;
  if (args.dia !== null && args.dia >= 56 && vermelhosGarantia.length >= 2 && args.anterior) {
    const la = montarKpisSap(args.anterior);
    const vAnt = garantiaIds.filter((id) => {
      const v = la.kpis.find((k) => k.id === id)?.valor ?? null;
      const b = base(id);
      return v !== null && b !== null && (id === "resposta" ? v >= b : v <= b);
    });
    if (vAnt.length >= 2) escalar.push("2 ou mais KPIs da garantia vermelhos por 2 semanas seguidas a partir da S9.");
  }
  if (args.dia !== null && args.dia >= 75 && args.garantiaAplicaNaPrevia) escalar.push("A prévia da garantia indica que ela se aplica, a partir do D75.");
  if (args.dia !== null && args.dia >= 60 && args.score !== null && args.score < 80) escalar.push(`Score de Execução de ${Math.round(args.score)}% no D60 ou depois (abaixo de 80%).`);
  if (principal?.v.codigo === "V18") escalar.push("Anúncio parou de entregar (V18): possível conta restrita.");

  const mensagem = principal
    ? `Bom dia${args.nomeContato ? `, ${args.nomeContato}` : ""}. Leitura da semana${semanaPrograma ? ` S${semanaPrograma}` : ""}: ${principal.perda ? `o maior vazamento está em ${principal.perda.rotulo.split(" (")[0].toLowerCase()}, ${pct(principal.perda.atual)} contra meta de ${pct(principal.perda.meta)}` : `o ponto principal é: ${principal.v.titulo}`}. ${principal.v.acaoDc ? `A nossa ação da semana: ${principal.v.acaoDc.charAt(0).toLowerCase()}${principal.v.acaoDc.slice(1)} ` : ""}${principal.v.acaoClinica ? `A proposta para vocês: ${principal.v.acaoClinica.charAt(0).toLowerCase()}${principal.v.acaoClinica.slice(1)} Prazo: ${principal.v.prazo.toLowerCase()}. ` : ""}Faz sentido?`
    : null;

  return { semanaPrograma, passos, principal, outros, perdas, vermelhosGarantia, escalar, mensagem };
}
