// SAP · Glossário: os termos do método em uma frase simples, para quem não é da equipe (médico, recepção).
// Usado no botão "O que significa?" do topo e nos termos sublinhados (componente Termo).

export interface TermoGlossario { termo: string; explica: string }

export const GLOSSARIO: TermoGlossario[] = [
  { termo: "D0", explica: "O dia em que o programa começou (assinatura). Todos os prazos contam a partir dele: D30 é 30 dias depois." },
  { termo: "D90", explica: "O último dia do programa. É quando comparamos o resultado com o ponto de partida." },
  { termo: "Baseline", explica: "O ponto de partida: como os números estavam antes do programa. Tudo é comparado com ele." },
  { termo: "KPI", explica: "Um número que mostra se o processo está melhorando, como o tempo para responder um paciente no WhatsApp." },
  { termo: "Meta", explica: "Onde combinamos chegar em cada KPI até o D90, assinado com a clínica na Sessão 2." },
  { termo: "Tempo de 1ª resposta", explica: "Quanto tempo a clínica leva para responder a primeira mensagem de quem chega pelo WhatsApp." },
  { termo: "Taxa de comparecimento", explica: "De cada 10 consultas marcadas, quantas o paciente realmente veio." },
  { termo: "Conversão da consulta", explica: "De cada 10 pacientes que vieram à consulta, quantos fecharam o tratamento." },
  { termo: "Taxa de agendamento", explica: "De cada 10 pessoas interessadas, quantas marcaram consulta." },
  { termo: "Funil", explica: "O caminho do paciente: viu o anúncio, chamou, marcou, veio, fechou. Medimos onde ele se perde." },
  { termo: "Vazamento", explica: "A etapa do funil onde a clínica mais perde pacientes. É por ela que o programa começa." },
  { termo: "Follow-up", explica: "Voltar a falar com quem disse \"vou pensar\" ou não marcou, no tempo certo e com a mensagem certa." },
  { termo: "Cadência", explica: "A sequência combinada de contatos de follow-up (por exemplo: no dia seguinte, em 3 dias, em 7 dias)." },
  { termo: "Score de Execução", explica: "Quanto do combinado a clínica e a Doctor Creator executaram. Acima de 80% no D90 é condição da garantia." },
  { termo: "Garantia", explica: "Se a clínica executar o combinado (Score de Execução de 80% ou mais) e 2 dos 3 KPIs principais não melhorarem, acompanhamos mais 30 dias sem custo." },
  { termo: "Leitura da semana", explica: "A análise semanal dos números: o que melhorou, onde ainda vaza e uma ação para cada lado." },
  { termo: "Rastreamento", explica: "A configuração que liga cada paciente ao anúncio de onde veio, para saber o que dá resultado." },
  { termo: "Tracker", explica: "O painel que junta, semana a semana, os números do funil da clínica." },
];

export function explicacao(termo: string): string | null {
  const t = termo.trim().toLowerCase();
  return GLOSSARIO.find((g) => g.termo.toLowerCase() === t)?.explica ?? null;
}

// ---------------------------------------------------------------- primeiro acesso guiado

export interface PassoTour { titulo: string; texto: string; sub: string }

/** 4 passos por papel. A clínica vê o essencial; a equipe vê o fluxo de operação. */
export function passosDoTour(isAdmin: boolean): PassoTour[] {
  return isAdmin
    ? [
        { titulo: "Comece pelo \"Esta semana\"", texto: "Tudo o que vence nos próximos 7 dias, por papel. Cada item tem um botão que leva direto para resolver.", sub: "/semana" },
        { titulo: "Reuniões em uma tela", texto: "A trilha mostra as 10 reuniões do programa. Abra a próxima: preparo, roteiro com relógio, notas ao vivo e rascunho por IA no final.", sub: "/sessao" },
        { titulo: "Toda semana: a leitura", texto: "Números da semana, vazamento principal, auditoria de conversas com sugestão da IA e uma ação para cada lado.", sub: "/leitura" },
        { titulo: "Dúvida em algum termo?", texto: "O botão \"O que significa?\" no topo explica D0, baseline, KPI e os outros termos em uma frase.", sub: "" },
      ]
    : [
        { titulo: "Bem-vindo ao seu programa", texto: "Aqui você acompanha os 90 dias: em que dia estamos, os 3 números que importam e a próxima reunião.", sub: "" },
        { titulo: "O que fazer esta semana", texto: "A lista mostra só o que é da clínica, com prazo. Quando a equipe marcar como feito, some da lista.", sub: "/semana" },
        { titulo: "Metas e resultado", texto: "As metas que combinamos e como cada número está em relação ao ponto de partida.", sub: "/metas" },
        { titulo: "Dúvida em algum termo?", texto: "Toque em \"O que significa?\" no topo ou em qualquer palavra sublinhada para ver a explicação.", sub: "" },
      ];
}
