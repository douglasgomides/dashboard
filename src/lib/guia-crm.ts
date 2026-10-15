import { fmtFracao } from "@/lib/metricas";
// Guia de organização do CRM, por cliente: lê as etapas reais do CRM dele, diz o que cada uma
// vira no padrão Doctor Creator, aponta as que a gente não sabe o que querem dizer e monta o
// passo a passo para a equipe da clínica ajustar. Regras fixas e verificáveis (nome da etapa).

export type Papel = "entrada" | "atendimento" | "agendada" | "realizada" | "ganho" | "perdido" | "reativacao" | "pos" | "desconhecida";

export const PADRAO: { papel: Exclude<Papel, "desconhecida" | "reativacao" | "pos">; nome: string; o_que_e: string }[] = [
  { papel: "entrada", nome: "1. Novo lead", o_que_e: "Chegou e ninguém respondeu ainda. Deve ficar vazia no fim do dia." },
  { papel: "atendimento", nome: "2. Em atendimento", o_que_e: "Já houve resposta; a conversa está acontecendo (dúvida, preço, convênio)." },
  { papel: "agendada", nome: "3. Consulta agendada", o_que_e: "Tem data marcada. É o número que mais importa para o painel." },
  { papel: "realizada", nome: "4. Compareceu", o_que_e: "Veio à consulta. Separa quem agendou de quem apareceu (no-show)." },
  { papel: "ganho", nome: "5. Fechou (ganho)", o_que_e: "Virou paciente ou fechou o procedimento. Lançar com o valor." },
  { papel: "perdido", nome: "Perdido (com motivo)", o_que_e: "Desistiu ou parou de responder. Sempre com o motivo escolhido numa lista." },
];

const REGRAS: [Papel, RegExp][] = [
  ["perdido", /(perdid|lost|desqualific|cemit[eé]rio|n[aã]o eleg|cancelad|excluir|parou de interagir|sem resposta|falha na tentativa)/i],
  ["ganho", /(ganh|fechad|fechou|venda realizada|closed - won|\bwon\b|liberado|on going)/i],
  ["reativacao", /(no.?show|n[aã]o compareceu|reagend)/i],
  ["realizada", /(realizad|compareceu|consulta feita|p[oó]s.?consulta|em acompanhamento|protocolo finalizado)/i],
  ["agendada", /(agendad|agendamento|confirmad|reserva|pr[eé].?consulta)/i],
  ["reativacao", /(reativ|resgate|reengaj|recall|follow ?up d\d|nutri[cç][aã]o|longo prazo|leads antigos|base antiga|cad[eê]ncia)/i],
  ["pos", /(p[oó]s.?(venda|procedimento)|fideliza|recorrente|upsell)/i],
  ["entrada", /^\s*\d*\s*[.)-]?\s*(contato inicial|novo lead|novos leads|incoming leads|etapa de leads de entrada|leads? de entrada|entrada|lead|caixa de leads|levantou a m[aã]o|base( \(n[aã]o abordado\))?|n[aã]o abordado|capta[cç][aã]o)/i],
  ["atendimento", /(atendimento|qualifica|negocia|follow|mensagem|conversou|respondeu|contato (iniciado|realizado)|proposta|or[cç]amento|or[cç]ad|interesse|aguard|pendente|decis|triagem|exames|prospec|sondagem)/i],
];

export function papelDaEtapa(nome: string): Papel {
  for (const [p, re] of REGRAS) if (re.test(nome)) return p;
  return "desconhecida";
}

export const ROTULO_PAPEL: Record<Papel, string> = {
  entrada: "Novo lead",
  atendimento: "Em atendimento",
  agendada: "Consulta agendada",
  realizada: "Compareceu",
  ganho: "Fechou (ganho)",
  perdido: "Perdido",
  reativacao: "Reativação / follow-up (funil à parte)",
  pos: "Pós-venda (funil à parte)",
  desconhecida: "Não sabemos o que quer dizer",
};

export interface EtapaCrm {
  pipeline_name: string;
  status_name: string;
  total: number;
}

export interface CamposCrm {
  provider: string | null;
  leads: number; // últimos 90 dias
  comOrigem: number | null;
  perdidos: number;
  perdidosComMotivo: number | null;
  comValorNoGanho: number | null;
  ganhos: number;
  semDono: number | null;
  abertos: number;
  paradosMais90: number | null;
}

export interface PassoGuia {
  id: string;
  titulo: string;
  porque: string;
  como: string[];
  feito: boolean;
}

export interface GuiaCrm {
  etapas: (EtapaCrm & { papel: Papel })[];
  faltam: Papel[]; // papéis do padrão sem nenhuma etapa
  desconhecidas: (EtapaCrm & { papel: Papel })[];
  passos: PassoGuia[];
  textoCliente: string; // pronto para mandar no WhatsApp/e-mail
}

const pct = (a: number | null, b: number) => (a == null || b <= 0 ? null : a / b);

// Onde fica cada coisa em cada CRM (descrição genérica: os menus mudam de versão).
const ONDE: Record<string, { etapas: string; campo: string; motivo: string; valor: string }> = {
  kommo: {
    etapas: "No Kommo, abra Leads, clique em ⚙︎/“Configurar funil” no topo do funil e renomeie, crie ou arraste as etapas.",
    campo: "Em Configurações → Campos personalizados → aba Leads, crie um campo do tipo Lista.",
    motivo: "No Kommo, ao mover para “Venda perdida” o sistema pode pedir o motivo: ative/edite a lista de motivos de perda nas configurações do funil.",
    valor: "Preencha o campo Venda/Orçamento (valor) do lead antes de mover para “Venda ganha”.",
  },
  clint: {
    etapas: "Na Clint, abra o funil, entre nas configurações do funil e renomeie/crie as etapas.",
    campo: "Nas configurações de campos personalizados da Clint, crie um campo de seleção (lista).",
    motivo: "Ao marcar o negócio como perdido, escolha o status/motivo de perda; cadastre a lista de motivos nas configurações.",
    valor: "Preencha o valor do negócio antes de marcar como ganho.",
  },
  rdstation: {
    etapas: "No RD Station CRM, vá em Configurações → Funis de vendas e edite as etapas.",
    campo: "Em Configurações → Campos personalizados (negociação), crie um campo de seleção.",
    motivo: "Em Configurações → Motivos de perda, cadastre a lista; o RD pede o motivo ao marcar como perdida.",
    valor: "Preencha o valor/produto da negociação antes de marcar como vendida.",
  },
  flwchat: {
    etapas: "No flwChat, abra o painel (kanban) e edite as etapas do painel.",
    campo: "Crie um campo personalizado de lista nas configurações do painel.",
    motivo: "Use uma etapa “Perdido” e um campo de lista “Motivo da perda”, preenchido sempre que mover para lá.",
    valor: "Preencha o valor (monetário) do card ao fechar.",
  },
  digisac: {
    etapas: "No Digisac, use os quadros Kanban, um para cada médico, com as mesmas etapas nos dois.",
    campo: "Use as etiquetas de médico, de origem (com [Origem] no nome) e de status, em todo contato novo.",
    motivo: "Peça ao suporte do Digisac para cadastrar os assuntos de fechamento e escolha um ao encerrar o atendimento.",
    valor: "O Digisac não guarda valor por contato. O valor entra pelo registro da consulta.",
  },
};
const ONDE_PADRAO = {
  etapas: "Nas configurações do funil do seu CRM, renomeie/crie as etapas.",
  campo: "Nas configurações de campos personalizados, crie um campo do tipo lista.",
  motivo: "Crie uma lista de motivos de perda e use sempre ao marcar como perdido.",
  valor: "Preencha o valor ao marcar como ganho.",
};

export function montarGuiaCrm(etapasBrutas: EtapaCrm[], c: CamposCrm): GuiaCrm {
  const etapas = etapasBrutas.map((e) => ({ ...e, papel: papelDaEtapa(e.status_name) }));
  const tem = new Set(etapas.map((e) => e.papel));
  const faltam = PADRAO.map((p) => p.papel).filter((p) => !tem.has(p));
  const desconhecidas = etapas.filter((e) => e.papel === "desconhecida").sort((a, b) => b.total - a.total);
  const onde = ONDE[c.provider ?? ""] ?? ONDE_PADRAO;
  const passos: PassoGuia[] = [];

  passos.push({
    id: "etapas",
    titulo: "Deixar o funil principal com as etapas padrão",
    porque:
      faltam.length || desconhecidas.length
        ? `Hoje ${faltam.length ? `faltam etapas para: ${faltam.map((p) => ROTULO_PAPEL[p]).join(", ")}` : "todas as etapas do padrão existem"}${desconhecidas.length ? `; e ${desconhecidas.length} etapa(s) não dá para saber o que significam (${desconhecidas.slice(0, 4).map((e) => `“${e.status_name}”`).join(", ")}${desconhecidas.length > 4 ? "…" : ""})` : ""}. Sem isso o painel não consegue dizer quantos agendaram e quantos vieram.`
        : "As etapas do padrão existem. Só manter os nomes.",
    como: [
      onde.etapas,
      `Use exatamente estes nomes, nesta ordem: ${PADRAO.slice(0, 5).map((p) => p.nome).join(" → ")}.`,
      "Etapas de follow-up, reativação de base antiga ou pós-venda: mover para um FUNIL SEPARADO, não no funil principal.",
      desconhecidas.length ? `Para cada etapa abaixo, dizer o que significa ou renomear para uma do padrão: ${desconhecidas.map((e) => `“${e.status_name}” (${e.pipeline_name})`).join("; ")}.` : "",
    ].filter(Boolean),
    feito: faltam.length === 0 && desconhecidas.length === 0,
  });

  const pOrigem = pct(c.comOrigem, c.leads);
  passos.push({
    id: "origem",
    titulo: "Registrar de onde veio cada lead",
    porque: pOrigem == null ? "Não conseguimos ler a origem dos leads deste CRM." : `Só ${fmtFracao(pOrigem)} dos leads dos últimos 90 dias têm a origem preenchida. Sem isso não dá para saber se o Instagram ou o anúncio traz paciente.`,
    como: [
      `${onde.campo} Nome: “Origem do lead”. Opções: Instagram (orgânico), Anúncio Meta, Google, Indicação, Site, Paciente antigo, Outro.`,
      "Tornar o campo obrigatório para sair da etapa “Novo lead”.",
      "Se o lead vem de anúncio de formulário ou WhatsApp, ligar a integração que grava a campanha (UTM / ID da campanha) no lead; a equipe Doctor Creator ajuda a configurar.",
    ],
    feito: pOrigem != null && pOrigem >= 0.8,
  });

  const pMotivo = pct(c.perdidosComMotivo, c.perdidos);
  passos.push({
    id: "motivo",
    titulo: "Marcar perdido sempre com o motivo",
    porque:
      c.perdidos === 0
        ? "Nenhum lead foi marcado como perdido nos últimos 90 dias: os que desistiram ficam “abertos” para sempre e distorcem todas as taxas."
        : pMotivo == null
          ? `${c.perdidos} perdidos nos últimos 90 dias; não conseguimos ler o motivo deles.`
          : `Só ${fmtFracao(pMotivo)} dos ${c.perdidos} perdidos têm motivo. Sem motivo, não dá para saber se perde por preço, demora ou convênio.`,
    como: [onde.motivo, "Lista de motivos: Preço, Não respondeu, Convênio/particular, Distância, Horário, Já fez em outro lugar, Só queria informação, Outro."],
    feito: c.perdidos > 0 && pMotivo != null && pMotivo >= 0.8,
  });

  const pValor = pct(c.comValorNoGanho, c.ganhos);
  passos.push({
    id: "ganho",
    titulo: "Fechar como ganho, com valor",
    porque:
      c.ganhos === 0
        ? "Nenhum lead foi marcado como ganho nos últimos 90 dias. O painel não consegue mostrar quanto o marketing trouxe de faturamento."
        : pValor == null || pValor >= 0.8
          ? "Ganhos estão sendo registrados."
          : `Só ${fmtFracao(pValor)} dos ganhos têm valor preenchido.`,
    como: [onde.valor, "Mover para ganho no dia em que o paciente fechar (consulta paga ou procedimento contratado)."],
    feito: c.ganhos > 0 && (pValor == null || pValor >= 0.8),
  });

  const pParados = pct(c.paradosMais90, c.abertos);
  passos.push({
    id: "limpeza",
    titulo: "Limpar os leads parados",
    porque:
      pParados == null
        ? "Sem dado de movimentação dos leads."
        : `${fmtFracao(pParados)} dos leads em aberto estão parados há mais de 90 dias. Eles inflam a base e escondem a fila real.`,
    como: [
      "Filtrar os leads em aberto sem movimentação há 90+ dias.",
      "Mover para “Perdido” com o motivo “Não respondeu” ou para um funil “Reativação”, fora do funil principal.",
      "Rotina toda sexta: revisar os abertos há mais de 30 dias.",
    ],
    feito: pParados != null && pParados < 0.3,
  });

  if (c.semDono != null) {
    const pDono = pct(c.semDono, c.abertos);
    passos.push({
      id: "dono",
      titulo: "Todo lead com um responsável",
      porque: pDono == null ? "" : `${fmtFracao(pDono)} dos leads em aberto estão sem responsável.`,
      como: ["Distribuir os leads sem responsável e ativar a distribuição automática para novos leads, se o CRM tiver."],
      feito: pDono != null && pDono < 0.1,
    });
  }

  const pendentes = passos.filter((p) => !p.feito);
  const textoCliente = [
    "Olá! Para o painel da Doctor Creator mostrar quantos pacientes o marketing está trazendo, precisamos de alguns ajustes no CRM. São rápidos:",
    "",
    ...pendentes.map((p, i) => [`*${i + 1}. ${p.titulo}*`, p.porque, ...p.como.map((c) => `• ${c}`), ""].join("\n")),
    "Qualquer dúvida, a gente faz junto numa chamada de 20 minutos.",
  ].join("\n");

  return { etapas, faltam, desconhecidas, passos, textoCliente };
}
