// SAP · Modo sessão: cada reunião do programa numa tela só (antes, durante, depois). O conteúdo segue o roteiro do
// Drive, que continua sendo a fonte; o app aponta para os documentos e registra o que a reunião decide.
// Piloto: Sessão 1 · Diagnóstico (03.04). Lógica pura (teste: scripts/test-sap-sessoes.ts).

export interface DocSessao { codigo: string; nome: string; url: string }
export interface PassoPrazo { chave: string; quando: string; oque: string; quem: string; /** horas depois do fim da sessão (pós) ou antes do início (preparo, negativo) */ horas: number; doc?: string }
export interface CampoRegistro { chave: string; rotulo: string; dica?: string; linhas?: number }
export interface BlocoSessao {
  n: number;
  titulo: string;
  min: number;
  publico: string;
  passos: string[];
  mostrar?: "kpis" | "funil";
  perguntas?: { etapa: string; min: number; mostrar: string; perguntas: string }[];
  frases?: string[];
  alerta?: string;
  registrar?: CampoRegistro[];
}
export interface DefSessao {
  id: string;
  cronoN: number; // item do Cronograma Mestre (00.02)
  titulo: string;
  quando: string;
  duracao: string;
  quem: { papel: string; faz: string }[];
  principio: string;
  entra: string[];
  sai: string[];
  docs: DocSessao[];
  preparo: PassoPrazo[];
  regraPreparo?: string;
  blocos: BlocoSessao[];
  situacoes: { titulo: string; como: string[] }[];
  regras: string[];
  pos: PassoPrazo[];
  /** Registros que viram ações combinadas ao encerrar (uma linha = uma ação). */
  acoesDe?: { chave: string; lado: "clinica" | "dc" };
}

import { SESSAO_B, SESSAO_K } from "@/lib/sessoes/kickoff-baseline";
import { SESSAO_S2, SESSAO_S3 } from "@/lib/sessoes/s2-s3";
import { SESSAO_S4, SESSAO_S5 } from "@/lib/sessoes/s4-s5";
import { SESSAO_D60, SESSAO_D90, SESSAO_S6 } from "@/lib/sessoes/s6-d60-d90";

const doc = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
const planilha = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

const SESSAO_S1: DefSessao =
  {
    id: "S1",
    cronoN: 9,
    titulo: "Sessão 1 · Diagnóstico",
    quando: "D8 a D10",
    duracao: "Agendar 120 min; o roteiro cabe em 90 a 115 min",
    quem: [
      { papel: "Fundador", faz: "Conduz e faz as perguntas de fundo. Não anota." },
      { papel: "Coordenador de Implementação", faz: "Co-conduz, controla o tempo, puxa o próximo bloco e responde dúvida de processo." },
      { papel: "Analista de Onboarding", faz: "Registra e corrige a planilha ao vivo. Só fala quando o Fundador pede." },
    ],
    principio: "O diagnóstico já foi feito com dados. A sessão serve para a clínica confirmar ou corrigir os números, contar o que os números não mostram e decidir junto. Quem conduz não inventa diagnóstico na hora e não discute número: registra os dois e segue.",
    entra: ["03.03 Raio-X e Baseline D0 preenchido e conferido", "03.01 Análise pré-reunião e lead oculto com síntese", "02.04 Formulário pré-diagnóstico e 02.06 Ficha do Cliente"],
    sai: ["Baseline D0 corrigida e congelada", "Top 3 vazamentos confirmados pela clínica", "Prioridade de ataque decidida", "Paciente atual x desejado (primeira versão)", "3 a 5 KPIs propostos com baseline (metas fechadas na Sessão 2)", "Transcrição para o 03.05 e relatório 03.06 em até 48 h"],
    docs: [
      { codigo: "03.04", nome: "Script da Sessão de Diagnóstico", url: doc("1Zl7Xg2fvpaooYOtMQQgqst1xHJ8an69pvblVz8SoEho") },
      { codigo: "03.03", nome: "Raio-X da Aquisição e Baseline D0", url: planilha("1iJ5Lv4FMNvXxV1g_TJLrFYZy-shGGKRKywVsnOXj5ys") },
      { codigo: "03.01", nome: "Análise Pré-Reunião e Lead Oculto", url: doc("1tWFezd0EwB1Jy2v9MUTPP1dkwXgQfegIYOYdQzp9PuA") },
      { codigo: "03.05", nome: "Prompt do Relatório de Diagnóstico", url: doc("1-Lf3ycYzscpQ_h70ZcwSOVuVR7ijd7QKeR1_wFBnmI4") },
      { codigo: "03.06", nome: "Modelo do Relatório de Diagnóstico", url: doc("10m1Edz4NRm-a2cKQqYQ9I9TomwP6TbljAcOau-JqwBI") },
      { codigo: "03.07", nome: "Plano de Ação e Metas dos 90 Dias", url: doc("1hUNQ7O91eiln6jCfTUIDaMYNthM4Nn8iKT8FvwbHMoY") },
    ],
    preparo: [
      { chave: "prep-pacote", quando: "2 dias antes", oque: "Enviar o pacote de preparação: aba Raio-X do 03.03 (top 3 e gráfico), síntese de 5 linhas do 03.01, frustração, tentativas e meta declarada do 02.04", quem: "Coordenador de Implementação", horas: -48, doc: "03.03" },
      { chave: "prep-leitura", quando: "Véspera", oque: "Fundador lê o pacote e anota: hipótese de prioridade, 3 perguntas que os números não respondem, serviço candidato", quem: "Fundador", horas: -24 },
      { chave: "prep-lembrete", quando: "Véspera", oque: "Lembrete à clínica (02.02): quem precisa estar e por quanto tempo; o trecho financeiro é só com o decisor", quem: "CS e Relacionamento", horas: -24 },
      { chave: "prep-alinhar", quando: "15 min antes", oque: "Alinhar em 5 min (hipótese, ordem dos vazamentos, quem fala de quê). Abrir o 03.03 (aba Raio-X) e o 03.07 em branco. Gravação e transcrição ligadas", quem: "Os três", horas: -0.25 },
    ],
    regraPreparo: "Se o Fundador não leu o pacote até a véspera, o Coordenador remarca com até 24 h de antecedência. A remarcação não move o D0 nem o D90.",
    blocos: [
      {
        n: 1, titulo: "Abertura e expectativa", min: 10, publico: "Decisor, recepção líder, quem apresenta valor, quem cuida de redes",
        passos: [
          "Cada pessoa da clínica diz o nome, a função e onde toca o paciente.",
          "Fundador: \"Hoje eu trago o que os números de vocês mostram. Vocês corrigem o que estiver errado e contam o que o número não conta. No fim a gente decide por onde começa e como vai medir.\"",
          "Fundador: \"Não é aula, não é venda e ninguém está sendo avaliado. Quando um número for ruim, o problema é de processo, não de pessoa.\"",
          "Fundador: \"O contrato tem 90 dias. O sistema fica completo até o dia 60, e de 61 a 90 a gente otimiza com dado real. Hoje é o dia D__.\"",
          "Fundador: \"A sessão é gravada. Em até 48 horas vocês recebem o relatório por escrito.\"",
          "Coordenador mostra o funil completo em 30 segundos: atração, filtro, conversa, agendamento, comparecimento, consulta, follow-up, retorno e indicação.",
        ],
        mostrar: "funil",
      },
      {
        n: 2, titulo: "Investigação etapa por etapa", min: 70, publico: "Mesmo grupo",
        passos: [
          "Para cada etapa, sempre nesta ordem: quantos entram? quantos passam? quem cuida? o que acontece com quem não passa?",
          "Quando a clínica corrige um número, o Analista lança no 03.03 na hora, com a fonte. O Fundador só comenta se a correção mudar o top 3.",
        ],
        mostrar: "kpis",
        perguntas: [
          { etapa: "Atração e anúncios", min: 8, mostrar: "Investimento, impressões, leads, custo por lead; o que roda hoje e o padrão dos concorrentes", perguntas: "Quem decide o que é impulsionado? Alguém olha o que veio de cada anúncio? O médico grava? Quanto aceitaria investir por mês em mídia?" },
          { etapa: "Filtro: lead para qualificado", min: 6, mostrar: "Proporção de qualificados da amostra", perguntas: "Que tipo de contato chega que não é paciente? Alguém separa curioso de interessado? Como?" },
          { etapa: "Conversa: primeiro contato e agendamento", min: 12, mostrar: "Tempo da 1ª resposta, taxa de agendamento de qualificados, nota do lead oculto", perguntas: "Quem responde no almoço, à noite, no sábado? O que respondem quando perguntam preço logo de cara? O que acontece com quem não marca?" },
          { etapa: "Confirmação e comparecimento", min: 8, mostrar: "Taxa de falta, remarcações, dias entre marcar e a consulta", perguntas: "Quem confirma, quando e como? O que acontece com quem falta? Cobra sinal? Tem lista de espera?" },
          { etapa: "Consulta e decisão", min: 10, mostrar: "Conversão da consulta, ticket médio", perguntas: "Todo paciente sai com proposta por escrito? Quem fala o valor? O que o paciente diz quando não fecha?" },
          { etapa: "Follow-up dos \"pensando\"", min: 8, mostrar: "Quantos saem pensando, quantos recebem contato, quantos voltam", perguntas: "Quem liga? Quando? O que é dito? Existe uma lista de quem está pensando?" },
          { etapa: "Retorno e recompra", min: 5, mostrar: "Retornos por 100 pacientes ativos, base ativa", perguntas: "A clínica lembra o paciente do retorno? Quem? Quantos antigos não voltam há mais de 1 ano?" },
          { etapa: "Indicação", min: 5, mostrar: "Indicações por tratamento fechado", perguntas: "Vocês pedem indicação? Quando? O que acontece quando alguém indica?" },
          { etapa: "Margem para perguntas", min: 15, mostrar: "", perguntas: "Se o tempo estourar, cortar daqui, nunca do bloco 5." },
        ],
        frases: [
          "\"De cada 10 que chamam no WhatsApp, quantos vocês acham que marcam? O sistema mostra [X]. Faz sentido para vocês?\"",
          "\"Esse número não está errado nem certo. Ele é o ponto de partida. Em 90 dias a gente compara com ele.\"",
          "\"Me conta a última vez que alguém disse 'vou pensar'. O que aconteceu depois?\"",
        ],
        registrar: [{ chave: "correcoes", rotulo: "Números corrigidos pela clínica (etapa, de → para, fonte)", linhas: 3 }, { chave: "contexto", rotulo: "O que os números não mostram (o que a clínica contou)", linhas: 4 }],
      },
      {
        n: 3, titulo: "Aprofundamento no maior vazamento", min: 15, publico: "Mesmo grupo",
        passos: [
          "Mostrar o top 3 do 03.03 e parar no primeiro.",
          "Mostrar a conta explicada: \"Pela referência inicial da Doctor Creator, a validar, [X%] dos qualificados agendam. Aqui são [Y%]. Isso dá [N] pacientes por mês que não marcam... cerca de R$ [valor] por mês.\"",
          "Deixar a clínica reagir. Ficar em silêncio por alguns segundos. O que o decisor disser vira citação no relatório.",
          "Perguntar: \"Por que vocês acham que isso acontece?\" e \"Se isso fosse resolvido, o que mudaria na rotina de vocês?\"",
          "Se o maior vazamento mudar (número corrigido na hora), o Analista mostra o top 3 recalculado.",
        ],
        alerta: "Nunca prometer que a clínica vai recuperar o valor. \"Esse é o tamanho do problema. A meta a gente define com KPI de processo, que vocês controlam.\"",
        registrar: [{ chave: "top3", rotulo: "Top 3 vazamentos confirmados", linhas: 3 }, { chave: "citacao", rotulo: "Citação do decisor", linhas: 2 }],
      },
      {
        n: 4, titulo: "Paciente atual x paciente desejado", min: 10, publico: "Decisor e sócios (recepção pode ficar, se o decisor quiser)",
        passos: ["Primeira versão. A Sessão 2 aprofunda o perfil e decide o serviço prioritário. Aqui só se registra o ponto de partida."],
        registrar: [
          { chave: "paciente_atual", rotulo: "Paciente atual", dica: "\"Quem é o paciente que mais chega hoje? Idade, o que procura, como chega, quanto investe\"" },
          { chave: "paciente_desejado", rotulo: "Paciente desejado", dica: "\"Quem é o paciente que vocês querem ter mais? O que faz ele fechar?\"" },
          { chave: "fora_do_foco", rotulo: "Paciente fora do foco", dica: "\"Qual paciente vocês não querem atrair?\"" },
          { chave: "servico_candidato", rotulo: "Serviço candidato (decisão final na Sessão 2)", dica: "\"Qual serviço vocês mais querem vender nos próximos 90 dias? Por quê?\"" },
        ],
      },
      {
        n: 5, titulo: "Prioridade de ataque e KPIs", min: 10, publico: "Só decisor e sócios",
        passos: [
          "Protocolo de sala: \"Agora vamos falar de metas e faturamento. Combinamos que essa parte é só com a Dra. Obrigado, equipe.\"",
          "Prioridade: o Fundador propõe por onde começar com o critério dito em voz alta (custo do vazamento x facilidade de corrigir x quanto depende da clínica). A clínica confirma ou traz outro motivo.",
          "KPIs: sempre os 3 da garantia (tempo de 1ª resposta, comparecimento e conversão da consulta, ou agendamento se a consulta não é paga) mais 1 ou 2 ligados ao maior vazamento. Receita atribuída é só acompanhada, nunca meta.",
          "\"Hoje a gente define quais KPIs e de onde eles partem. A meta de cada um vocês assinam na Sessão 2.\"",
          "Garantia em uma frase: \"Se vocês executarem o combinado, com Score de Execução de 80% ou mais no D90, e pelo menos 2 dos 3 KPIs principais não melhorarem, a gente acompanha mais 30 dias sem custo.\"",
        ],
        mostrar: "kpis",
        registrar: [{ chave: "prioridade", rotulo: "Prioridade de ataque e o motivo", linhas: 2 }, { chave: "kpis", rotulo: "KPIs propostos (3 a 5) com a baseline", linhas: 3 }],
      },
      {
        n: 6, titulo: "Próximos passos", min: 5, publico: "Decisor e sócios",
        passos: [
          "Fundador lê em voz alta: prioridade e por quê; KPIs com a baseline; o que a clínica faz nos próximos 14 dias; o que a DC entrega até a Sessão 2.",
          "Coordenador marca a Sessão 2 (D12 a D14) na hora.",
          "\"O relatório chega em até 48 horas no grupo da clínica.\"",
        ],
        registrar: [
          { chave: "acoes_clinica", rotulo: "Ações da clínica nos próximos 14 dias (uma por linha; viram ações combinadas)", linhas: 5 },
          { chave: "entregas_dc", rotulo: "O que a Doctor Creator entrega até a Sessão 2", linhas: 2 },
          { chave: "data_s2", rotulo: "Data marcada da Sessão 2" },
        ],
      },
    ],
    situacoes: [
      { titulo: "Recepção na defensiva", como: ["Separar pessoa de processo: \"O problema é o desenho, não você.\"", "Perguntar a opinião dela antes de mostrar o número.", "Nunca mostrar print do lead oculto com nome de quem atendeu.", "Se persistir: o Coordenador conversa com a recepção 10 min depois, sozinho, para ouvir."] },
      { titulo: "Médico que não quer expor faturamento", como: ["Oferecer não mostrar faturamento total: basta ticket médio e quantos fecham.", "Se nem isso: usar o ticket declarado, marcar (E) e mostrar a perda em número de pacientes."] },
      { titulo: "Clínica que quer resolver tudo na hora", como: ["\"Essa é a pergunta certa. A resposta está na Sessão [3/4/5/6]. Hoje a gente decide por onde começar.\""] },
      { titulo: "Número muito diferente do declarado", como: ["\"Vocês tinham a sensação de [declarado], o sistema mostra [medido]. Os dois ficam no relatório. Para a meta, usa o do sistema.\""] },
      { titulo: "Decisor ausente", como: ["Sem decisor não há prioridade nem KPI. Fazer os blocos 1 a 3 e remarcar 30 min com o decisor em até 2 dias úteis para os blocos 4 e 5. O relatório só sai depois."] },
    ],
    regras: [
      "Número com conta explicada. Sem conta, parece invenção.",
      "Referência sempre como \"referência inicial Doctor Creator, a validar\". Nunca \"o mercado brasileiro faz X%\".",
      "Nada de prometer faturamento. Promete-se processo, prazo, acompanhamento e a garantia condicionada.",
      "Nenhum nome ou dado de paciente na tela ou no relatório.",
    ],
    pos: [
      { chave: "pos-congelar", quando: "Logo após", oque: "Congelar a aba Baseline D0 do 03.03 (colar como valores, data no cabeçalho); salvar gravação e transcrição na pasta do cliente", quem: "Analista de Onboarding", horas: 1, doc: "03.03" },
      { chave: "pos-prompt", quando: "Até 4 h", oque: "Rodar o prompt 03.05 com a transcrição, 03.03, 03.01, 02.04 e 02.06", quem: "Coordenador de Implementação", horas: 4, doc: "03.05" },
      { chave: "pos-revisar", quando: "Até 24 h", oque: "Revisar o rascunho, tratar a lista \"Para conferência do Coordenador\" e preencher o 03.07 com as propostas", quem: "Coordenador de Implementação", horas: 24, doc: "03.07" },
      { chave: "pos-fundador", quando: "Até 36 h", oque: "Revisão final do relatório 03.06", quem: "Fundador", horas: 36, doc: "03.06" },
      { chave: "pos-enviar", quando: "Até 48 h", oque: "Enviar 03.06 e 03.07 (KPIs com metas propostas) ao decisor no grupo, com a mensagem do 02.02", quem: "Coordenador / CS e Relacionamento", horas: 48, doc: "03.06" },
    ],
    acoesDe: { chave: "acoes_clinica", lado: "clinica" },
  };

/** Todas as reuniões do programa, na ordem do Cronograma Mestre (00.02). Roteiros extraídos do Drive (a fonte). */
export const SESSOES: DefSessao[] = [SESSAO_K, SESSAO_B, SESSAO_S1, SESSAO_S2, SESSAO_S3, SESSAO_S4, SESSAO_S5, SESSAO_S6, SESSAO_D60, SESSAO_D90];

export const sessaoPorId = (id: string | undefined) => SESSOES.find((s) => s.id === id) ?? null;
export const sessaoDoItem = (cronoN: number) => SESSOES.find((s) => s.cronoN === cronoN) ?? null;

export const duracaoPlanejada = (s: DefSessao) => s.blocos.reduce((t, b) => t + b.min, 0);

/** Em que bloco a sessão deveria estar, pelo tempo decorrido (min). Depois do último, devolve o último com estouro. */
export function blocoNoTempo(s: DefSessao, decorridoMin: number): { n: number; restante: number; estouro: number } {
  let acc = 0;
  for (const b of s.blocos) {
    acc += b.min;
    if (decorridoMin < acc) return { n: b.n, restante: Math.round(acc - decorridoMin), estouro: 0 };
  }
  return { n: s.blocos[s.blocos.length - 1].n, restante: 0, estouro: Math.round(decorridoMin - acc) };
}

/** Prazo de cada passo do pós-sessão a partir do fim da sessão (ISO), e se está atrasado. */
export function prazosPos(s: DefSessao, fimIso: string, agoraIso: string, feitos: Set<string>) {
  const fim = Date.parse(fimIso);
  const agora = Date.parse(agoraIso);
  return s.pos.map((p) => {
    const prazo = new Date(fim + p.horas * 3_600_000).toISOString();
    return { ...p, prazo, feito: feitos.has(p.chave), atrasado: !feitos.has(p.chave) && agora > Date.parse(prazo) };
  });
}

/** Uma ação por linha não vazia (tira marcadores "-", "•", "1."). */
export function linhasParaAcoes(texto: string | null | undefined): string[] {
  return (texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter((l) => l.length > 2);
}

// ---------------------------------------------------------------- trilha do programa e rascunho por IA

export type EstadoTrilha = "feita" | "atrasada" | "agora" | "proxima" | "futura";
export interface PassoTrilha { s: DefSessao; data: string | null; estado: EstadoTrilha; diasAte: number | null }

/** Cada reunião na ordem do programa, com a data-alvo do cronograma e o estado. "proxima" = a primeira ainda aberta. */
export function trilha(
  sessoes: DefSessao[],
  crono: { n: number; dataAlvo: string; dataIni: string; dataFim: string; status: string }[],
  hoje: string,
): { passos: PassoTrilha[]; proxima: PassoTrilha | null } {
  const porN = new Map(crono.map((c) => [c.n, c]));
  const passos: PassoTrilha[] = [...sessoes]
    .sort((a, b) => (porN.get(a.cronoN)?.dataAlvo ?? "9").localeCompare(porN.get(b.cronoN)?.dataAlvo ?? "9") || a.cronoN - b.cronoN)
    .map((s) => {
      const c = porN.get(s.cronoN);
      if (!c) return { s, data: null, estado: "futura" as EstadoTrilha, diasAte: null };
      const estado: EstadoTrilha = c.status === "feito" ? "feita" : c.status === "atrasado" ? "atrasada" : c.status === "agora" ? "agora" : "futura";
      const diasAte = Math.round((Date.parse(`${c.dataAlvo}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
      return { s, data: c.dataAlvo, estado, diasAte };
    });
  const i = passos.findIndex((p) => p.estado !== "feita");
  if (i >= 0 && passos[i].estado === "futura") passos[i] = { ...passos[i], estado: "proxima" };
  return { passos, proxima: i >= 0 ? passos[i] : null };
}

export interface RascunhoIA {
  resumo?: string; decisoes?: string[]; kpis?: string[]; acoes_clinica?: string[]; acoes_dc?: string[];
  citacoes?: string[]; conferir?: string[]; riscos?: string[]; mensagem?: string; modelo?: string; gerado_em?: string;
}

export function lerRascunho(texto: string | null | undefined): RascunhoIA | null {
  if (!texto) return null;
  try {
    const j = JSON.parse(texto) as RascunhoIA;
    const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);
    return {
      resumo: typeof j.resumo === "string" ? j.resumo : undefined,
      decisoes: lista(j.decisoes), kpis: lista(j.kpis), acoes_clinica: lista(j.acoes_clinica), acoes_dc: lista(j.acoes_dc),
      citacoes: lista(j.citacoes), conferir: lista(j.conferir), riscos: lista(j.riscos),
      mensagem: typeof j.mensagem === "string" ? j.mensagem : undefined,
      modelo: typeof j.modelo === "string" ? j.modelo : undefined, gerado_em: typeof j.gerado_em === "string" ? j.gerado_em : undefined,
    };
  } catch {
    return null;
  }
}

/** Rascunho em texto corrido (para copiar no relatório ou no grupo). */
export function rascunhoEmTexto(r: RascunhoIA, titulo: string): string {
  const sec = (t: string, l?: string[]) => (l && l.length ? `\n${t}\n${l.map((x) => `- ${x}`).join("\n")}\n` : "");
  return [
    `${titulo}\n`,
    r.resumo ? `${r.resumo}\n` : "",
    sec("Decisões", r.decisoes), sec("KPIs", r.kpis), sec("Ações da clínica", r.acoes_clinica), sec("Entregas da Doctor Creator", r.acoes_dc),
  ].join("").trim();
}
