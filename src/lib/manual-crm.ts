// Manual de organização do CRM: o mesmo conteúdo aparece na tela "Organizar o CRM", no onboarding do
// médico e no PDF para enviar à equipe da clínica. É o que o Hub precisa ler para mostrar o retorno do
// investimento (vendas, valor, origem). Texto fixo e revisado; nada aqui depende de dado do cliente.
import { PADRAO } from "@/lib/guia-crm";

export interface SecaoManual {
  titulo: string;
  intro?: string;
  itens: { titulo: string; texto: string }[];
}

export const ORIGENS_PADRAO = ["Anúncio (Meta)", "Instagram (orgânico)", "Indicação", "Google", "Paciente antigo", "Outro"];
export const MOTIVOS_PERDA_PADRAO = [
  "Preço / não pode pagar agora",
  "Convênio não cobre",
  "Distância / deslocamento",
  "Escolheu outro profissional",
  "Parou de responder",
  "Não era o que procurava",
  "Vai pensar / adiou",
];

export const MANUAL_CRM: SecaoManual[] = [
  {
    titulo: "Por que organizar",
    intro:
      "O painel lê o CRM para responder a pergunta que mais importa: quanto voltou do que foi investido. Ele só consegue isso se cada card disser em que etapa está, de onde veio e quanto foi fechado.",
    itens: [
      { titulo: "Etapa certa", texto: "Mostra onde as pessoas param: no primeiro contato, no agendamento ou na consulta." },
      { titulo: "Valor da venda", texto: "Sem o valor no card fechado, não existe receita nem retorno do investimento." },
      { titulo: "Origem do lead", texto: "Diz quanto do resultado veio dos anúncios, do Instagram ou de indicação." },
    ],
  },
  {
    titulo: "As etapas do funil",
    intro: "Use estas etapas (ou renomeie as suas para que fique claro o que cada uma significa). Uma etapa, um significado.",
    itens: PADRAO.map((e) => ({ titulo: e.nome, texto: e.o_que_e })),
  },
  {
    titulo: "O que preencher em todo card",
    itens: [
      { titulo: "Origem do lead", texto: `Escolha numa lista fechada: ${ORIGENS_PADRAO.join(", ")}. O WhatsApp é o canal, não a origem: pergunte "como nos conheceu?".` },
      { titulo: "Serviço", texto: "Consulta, procedimento ou tratamento de interesse, sempre com o mesmo nome (lista fechada)." },
      { titulo: "Próxima ação com data", texto: "Todo card aberto precisa de um próximo passo com dia: ligar, enviar exame, confirmar consulta." },
      { titulo: "Responsável", texto: "Quem cuida daquele contato. Ajuda a ver quem precisa de apoio." },
      { titulo: "Valor ao fechar", texto: "Ao mover para Fechou (ganho), preencha o valor real fechado." },
      { titulo: "Motivo ao perder", texto: `Ao mover para Perdido, escolha o motivo numa lista: ${MOTIVOS_PERDA_PADRAO.join("; ")}.` },
    ],
  },
  {
    titulo: "Rotina que mantém o CRM legível",
    itens: [
      { titulo: "Todo dia", texto: "Zerar a etapa Novo lead: todo contato do dia recebe resposta e sai dela." },
      { titulo: "Toda semana", texto: "Revisar cards sem movimento há mais de 7 dias: avançar, marcar próxima ação ou mover para perdido com motivo." },
      { titulo: "Todo mês", texto: "Cards parados há mais de 90 dias vão para Perdido (com motivo) ou para um funil de reativação. Estoque antigo não é fila de atendimento." },
      { titulo: "Etiquetas", texto: "Use etiqueta só quando o CRM não tem campo próprio (ex.: origem). Padrão de nome: \"origem: anúncio\", \"origem: indicação\". Etiqueta não substitui etapa." },
    ],
  },
  {
    titulo: "Onde fica cada coisa no seu CRM",
    itens: [
      { titulo: "Kommo", texto: "Etapas: Configurações do funil. Valor: campo Venda do card. Origem e motivo de perda: crie campos do tipo lista em Configurações > Campos." },
      { titulo: "Clint", texto: "Etapas: edição do funil. Valor: campo de valor da negociação. Origem: campo personalizado de lista. Ao perder, use o motivo de perda da Clint." },
      { titulo: "RD Station CRM", texto: "Etapas: Funis de vendas. Valor: produtos/valor da negociação. Origem: Fonte. Motivo de perda: lista de motivos ao marcar como perdida." },
      { titulo: "Planilha", texto: "Uma linha por contato, com colunas: data de entrada, etapa, origem, serviço, responsável, próxima ação, data da próxima ação, valor fechado, motivo de perda." },
    ],
  },
  {
    titulo: "O que o painel mostra quando está organizado",
    itens: [
      { titulo: "Retorno do investimento", texto: "Investido em anúncios, receita das vendas, ROI e custo por paciente, no período escolhido." },
      { titulo: "Onde o funil trava", texto: "Quantos chegam, quantos agendam, quantos comparecem e quantos fecham." },
      { titulo: "O que funciona", texto: "Qual origem e qual serviço trazem mais pacientes, com o motivo das perdas." },
    ],
  },
];

/** Texto corrido do manual (para copiar e colar numa mensagem). */
export function manualComoTexto(): string {
  return MANUAL_CRM.map((s) => [`## ${s.titulo}`, s.intro ?? "", ...s.itens.map((i) => `- ${i.titulo}: ${i.texto}`)].filter(Boolean).join("\n")).join("\n\n");
}
