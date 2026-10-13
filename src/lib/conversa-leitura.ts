// Leitura de cada conversa do WhatsApp em linguagem simples, a partir de leitura_conversas (banco).
// Regras fixas, sem IA. A IA (resumo) é uma camada opcional por cima, pedida conversa a conversa.
//
// Referência de tempo de resposta: leads respondidos na primeira hora têm ~7x mais chance de
// qualificação do que os respondidos depois (Oldroyd, McElheran e Elkington, "The Short Life of
// Online Sales Leads", Harvard Business Review, 2011). Por isso 1 hora é a linha de "demorou".

export interface LeituraConversaBanco {
  conversa_id: string;
  msgs_paciente: number;
  msgs_clinica: number;
  msgs_automaticas: number;
  primeira_resposta_seg: number | null;
  mediana_resposta_comercial_seg: number | null;
  maior_espera_seg: number | null;
  esperas_longas: number;
  vezes_paciente: number;
  ultima_de: "clinica" | "paciente" | "paciente_encerrou" | null;
  ultima_msg_em: string | null;
  aguardando_seg: number | null;
  atendente: string | null;
  lead_etapa: string | null;
  lead_resultado: string | null;
}

export type Situacao = "sem_resposta" | "demorou" | "ok" | "so_robo" | "sem_dado";

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  sem_resposta: "Paciente sem resposta",
  demorou: "Resposta demorou",
  ok: "Respondido",
  so_robo: "Só o robô respondeu",
  sem_dado: "Sem mensagem do paciente",
};

export const TOM_SITUACAO: Record<Situacao, "ruim" | "atencao" | "bom" | "neutro"> = {
  sem_resposta: "ruim",
  so_robo: "ruim",
  demorou: "atencao",
  ok: "bom",
  sem_dado: "neutro",
};

const HORA = 3600;

export function duracao(seg: number | null | undefined): string {
  if (seg == null) return "—";
  if (seg < 60) return `${Math.max(1, Math.round(seg))} s`;
  if (seg < HORA) return `${Math.round(seg / 60)} min`;
  if (seg < 48 * HORA) {
    const h = Math.floor(seg / HORA);
    const m = Math.round((seg % HORA) / 60);
    return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  }
  return `${Math.round(seg / 86400)} dias`;
}

export function situacaoDa(l: LeituraConversaBanco): Situacao {
  if (!l.msgs_paciente) return "sem_dado";
  if (l.ultima_de === "paciente") return l.msgs_clinica === 0 && l.msgs_automaticas > 0 ? "so_robo" : "sem_resposta";
  if ((l.primeira_resposta_seg ?? 0) > HORA || l.esperas_longas > 0) return "demorou";
  return "ok";
}

/** Frases curtas e verificáveis sobre a conversa (o que os números mostram). */
export function frasesDa(l: LeituraConversaBanco): string[] {
  const f: string[] = [];
  const s = situacaoDa(l);
  if (s === "so_robo") f.push(`O paciente escreveu e só recebeu mensagem automática. Ninguém da equipe respondeu (há ${duracao(l.aguardando_seg)}).`);
  else if (s === "sem_resposta") f.push(`A última mensagem é do paciente e está sem resposta há ${duracao(l.aguardando_seg)}.`);
  else if (l.ultima_de === "paciente_encerrou") f.push("O paciente encerrou a conversa (agradeceu ou confirmou).");
  if (l.primeira_resposta_seg != null) f.push(`Primeira resposta de uma pessoa da equipe: ${duracao(l.primeira_resposta_seg)}${l.primeira_resposta_seg > HORA ? " (acima de 1 hora)" : ""}.`);
  if (l.esperas_longas > 0) f.push(`${l.esperas_longas === 1 ? "Uma vez" : `${l.esperas_longas} vezes`} o paciente esperou mais de 1 hora; a maior espera foi de ${duracao(l.maior_espera_seg)}.`);
  if (l.msgs_automaticas > 0) f.push(`${l.msgs_automaticas} mensagens automáticas (robô/menu), fora da conta de tempo de resposta.`);
  if (l.atendente) f.push(`Atendido por ${l.atendente}.`);
  if (l.lead_etapa || l.lead_resultado)
    f.push(`No CRM: ${l.lead_resultado === "won" ? "ganho" : l.lead_resultado === "lost" ? "perdido" : `etapa “${l.lead_etapa ?? "sem etapa"}”`}.`);
  else f.push("Não está ligado a nenhum lead do CRM (telefone não bate com nenhum lead).");
  return f;
}

export interface ResumoAtendimento {
  conversas: number;
  comPaciente: number;
  semResposta: number; // inclui só robô
  soRobo: number;
  demorou: number;
  medianaPrimeiraResposta: number | null;
  medianaComercial: number | null;
  semLead: number;
  porAtendente: { nome: string; conversas: number; mediana: number | null; semResposta: number }[];
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export function resumirAtendimento(ls: LeituraConversaBanco[]): ResumoAtendimento {
  const com = ls.filter((l) => l.msgs_paciente > 0);
  const sit = com.map(situacaoDa);
  const atend = new Map<string, LeituraConversaBanco[]>();
  for (const l of com) if (l.atendente) atend.set(l.atendente, [...(atend.get(l.atendente) ?? []), l]);
  return {
    conversas: ls.length,
    comPaciente: com.length,
    semResposta: sit.filter((s) => s === "sem_resposta" || s === "so_robo").length,
    soRobo: sit.filter((s) => s === "so_robo").length,
    demorou: sit.filter((s) => s === "demorou").length,
    medianaPrimeiraResposta: mediana(com.map((l) => l.primeira_resposta_seg).filter((x): x is number => x != null)),
    medianaComercial: mediana(com.map((l) => l.mediana_resposta_comercial_seg).filter((x): x is number => x != null)),
    semLead: com.filter((l) => !l.lead_etapa && !l.lead_resultado).length,
    porAtendente: [...atend.entries()]
      .map(([nome, xs]) => ({
        nome,
        conversas: xs.length,
        mediana: mediana(xs.map((l) => l.mediana_resposta_comercial_seg ?? l.primeira_resposta_seg).filter((x): x is number => x != null)),
        semResposta: xs.filter((l) => l.ultima_de === "paciente").length,
      }))
      .sort((a, b) => b.conversas - a.conversas),
  };
}

// Resumo por IA (api/_lib/resumo-conversa.ts, via /api/sync/manual alvo "resumo_conversa"). Campos opcionais: a IA pode omitir.
export interface ResumoIA {
  motivo?: string | null;
  resumo?: string | null;
  interesse?: string | null;
  objecoes?: string[] | null;
  situacao?: string | null;
  atendimento?: { nota?: string | null; pontos_fortes?: string[] | null; pontos_a_melhorar?: string[] | null } | null;
  proximo_passo?: string | null;
  alerta?: string | null;
}

export const ROTULO_SITUACAO_IA: Record<string, string> = {
  agendou: "Agendou",
  em_negociacao: "Em negociação",
  aguardando_clinica: "Esperando a clínica",
  aguardando_paciente: "Esperando o paciente",
  desistiu: "Desistiu",
  so_informacao: "Só pediu informação",
  outro: "Outro",
};
