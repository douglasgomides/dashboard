// Prazos de recompra e retorno por procedimento (tela Pacientes do período). Ponto de partida combinado com a Doctor
// Creator, não regra médica: ajuste aqui. O banco não guarda prazo; a tela aplica a regra sobre o que foi fechado.
// A primeira regra que casar vale, então as mais específicas vêm antes (consulta fica por último).

export interface RegraRecompra {
  id: string;
  /** Nome que o médico lê. */
  rotulo: string;
  /** Casa com o procedimento do CRM, o interesse lido na conversa ou o nome do funil. */
  casa: RegExp;
  /** Dias depois do fechamento em que vale chamar de novo. */
  diasMin: number;
  /** Até quando ainda é a janela normal de volta (igual a diasMin quando é um prazo só). */
  diasMax: number;
  /** O que dizer ao chamar. */
  motivo: string;
}

export const REGRAS_RECOMPRA: RegraRecompra[] = [
  { id: "implante_hormonal", rotulo: "Implante hormonal", casa: /implante\s+hormon|gestrinona|chip\s+da\s+beleza|pellet/i, diasMin: 180, diasMax: 180, motivo: "troca do implante" },
  { id: "toxina", rotulo: "Toxina botulínica", casa: /toxina|botox|botul|dysport|xeomin/i, diasMin: 120, diasMax: 180, motivo: "reaplicação da toxina" },
  { id: "preenchimento", rotulo: "Preenchimento", casa: /preench|hialur/i, diasMin: 270, diasMax: 365, motivo: "manutenção do preenchimento" },
  { id: "bioestimulador", rotulo: "Bioestimulador", casa: /bioestimul|sculptra|radiesse|ellans[eé]?/i, diasMin: 365, diasMax: 365, motivo: "nova sessão de bioestimulador" },
  { id: "tecnologias", rotulo: "Laser e tecnologias", casa: /laser|ultraformer|hifu|radiofrequ|morpheus|lavieen|fotona|luz\s+pulsada|tecnologia/i, diasMin: 30, diasMax: 30, motivo: "próxima sessão" },
  { id: "consulta", rotulo: "Consulta", casa: /consulta|avalia[cç][aã]o/i, diasMin: 30, diasMax: 30, motivo: "retorno da consulta" },
];

/** Janela de quem entra em "Para chamar agora". */
export const FOLLOW_UP = {
  /** Recompra que vence em até tantos dias (ou já venceu). */
  diasAntesDaRecompra: 30,
  /** Quem agendou e, depois de tantos dias, não tem comparecimento nem fechamento. */
  diasAgendouSemRetorno: 7,
} as const;

/** Quantos dias para trás a tela busca vendas para a recompra: o maior prazo, mais uma folga de seis meses. */
export const DIAS_HISTORICO_RECOMPRA = Math.max(...REGRAS_RECOMPRA.map((r) => r.diasMax)) + 180;
