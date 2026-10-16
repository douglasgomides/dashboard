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
        { titulo: "Novo por aqui? Leia o Comece aqui", texto: "Em 2 minutos: o que é o programa, a linha do tempo D0 a D90, o que cada papel faz e como fechar uma tarefa.", sub: "/comece" },
        { titulo: "Sua tela é Minhas tarefas", texto: "Só o que é do seu papel nesta clínica, em Atrasadas, Hoje, Esta semana e Depois. Clique numa tarefa: ela mostra por que existe, como fazer, onde fazer e o que conta como pronto.", sub: "" },
        { titulo: "Prove que fez", texto: "Cole o link ou envie o print da evidência e clique em \"Marcar como feito\". O que o sistema detecta sozinho já aparece como \"feito automaticamente\".", sub: "" },
        { titulo: "Dúvida? Use o ?", texto: "O botão ? no topo reabre este tour, o Comece aqui, o glossário e a lista de documentos.", sub: "" },
      ]
    : [
        { titulo: "Bem-vindo ao seu programa", texto: "Aqui você acompanha os 90 dias: o que é da clínica fazer, em que dia estamos e a próxima reunião.", sub: "" },
        { titulo: "O que fazer agora", texto: "Minhas tarefas mostra só o que é da clínica, com prazo. Quando a equipe marcar como feito, sai da lista.", sub: "" },
        { titulo: "Números e metas", texto: "O Painel da clínica mostra os números; Metas e garantia mostra cada número contra o ponto de partida.", sub: "/painel" },
        { titulo: "Dúvida? Use o ?", texto: "O botão ? no topo reabre este tour e explica cada termo.", sub: "" },
      ];
}
