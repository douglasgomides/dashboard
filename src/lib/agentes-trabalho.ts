import type { IdAgente } from "./agentes-catalogo";
import type { EstadoExecucao } from "./agentes-data";

/** Descreve o trabalho que o motor já faz; não cria novos agentes ou promessas de execução externa. */
export const TRABALHOS_AGENTE: Record<IdAgente, {
  problema: string; ajuda: string; entrega: string; pessoa: string; medir: string;
  limite: string; acao: string; janelaDias: number | null;
}> = {
  recuperacao: {
    problema: "Retomar contatos que não avançaram",
    ajuda: "Encontra conversas com interesse ou aguardando a clínica e prepara uma abordagem para a equipe revisar.",
    entrega: "Casos identificados, motivo da seleção e rascunho individual de mensagem.",
    pessoa: "Atendimento: revisa o histórico, assume o caso com prazo e faz o contato no canal da clínica.",
    medir: "Após vincular a mensagem enviada, confira respostas e avanços registrados no CRM no acompanhamento do caso.",
    limite: "Depende das conversas auditadas. Contatos e agendamentos são realizados pela equipe. Sem cobertura confiável, o acompanhamento pede correção da fonte.",
    acao: "Revisar oportunidades agora", janelaDias: 14,
  },
  anuncios: {
    problema: "Decidir o que revisar nos anúncios",
    ajuda: "Compara os últimos 7 dias com os 7 anteriores e destaca campanhas com custo, frequência ou resultado que merecem revisão.",
    entrega: "Recomendações por campanha, números que sustentam o diagnóstico e alternativas de copy quando disponíveis.",
    pessoa: "Gestor de tráfego: confere o diagnóstico e decide a intervenção. Mudanças na Meta exigem acesso de escrita e aprovação explícita.",
    medir: "Compare o indicador da campanha antes e depois da intervenção, mantendo objetivo e período comparáveis.",
    limite: "Uma recomendação não é uma mudança aplicada. Seguidores estimados são identificados como estimativa; uma campanha sem recomendação não é garantia de bom desempenho.",
    acao: "Analisar anúncios agora", janelaDias: 10,
  },
  conteudo: {
    problema: "Saber o que produzir esta semana",
    ajuda: "Usa a memória aprovada da clínica, os conteúdos anteriores e as dúvidas disponíveis para preparar pautas com roteiro.",
    entrega: "Reels cena a cena ou carrosséis slide a slide, com gancho, legenda, chamada e referências dos dados usados.",
    pessoa: "Social media e médico: revisam o conteúdo, levam ao planejador e organizam gravação ou produção.",
    medir: "Vincule a publicação no planejador e consulte seus resultados. Copiar ou planejar um roteiro não comprova publicação nem desempenho.",
    limite: "A rotina entrega roteiro e texto. A produção de artes e edição de vídeo ficam na Inteligência Criativa; publicação e revisão médica continuam com a equipe.",
    acao: "Preparar roteiros agora", janelaDias: 21,
  },
  campanhas: {
    problema: "Transformar uma meta em campanha",
    ajuda: "Cruza os dados disponíveis da clínica para propor uma campanha com público, canais, abordagem e passos de execução.",
    entrega: "Estratégias com justificativa, texto, plano de execução, prazo sugerido e indicador para acompanhar.",
    pessoa: "Estrategista e clínica: revisam a proposta, aprovam, colocam em andamento e registram o que aconteceu.",
    medir: "Registre o resultado na estratégia e confronte com os indicadores da fonte. O resultado informado pela equipe não é receita automaticamente atribuída.",
    limite: "O agente prepara a estratégia. Não contrata mídia, publica campanhas nem faz contatos externos sozinho.",
    acao: "Preparar estratégias agora", janelaDias: 30,
  },
  brain: {
    problema: "Alinhar os agentes à realidade da clínica",
    ajuda: "Organiza o conhecimento disponível e propõe atualizações para a memória que orienta os outros agentes.",
    entrega: "Propostas de informações de marca, público e operação, com origem para conferência.",
    pessoa: "Equipe Doctor Creator: confere a origem e aprova cada informação no Brand Brain.",
    medir: "Revise os itens propostos e confira se os materiais seguintes usam as informações aprovadas.",
    limite: "Memória proposta não é fato aprovado. Esta revisão é restrita à equipe administrativa.",
    acao: "Revisar memória da clínica", janelaDias: null,
  },
};

export function agenteSelecionado(value: unknown, produto: "hub" | "sap", admin: boolean): IdAgente {
  const id = typeof value === "string" && Object.hasOwn(TRABALHOS_AGENTE, value) ? value as IdAgente : "conteudo";
  return (id === "brain" && !admin) || (produto === "sap" && (id === "brain" || id === "recuperacao")) ? "conteudo" : id;
}

export interface RodadaAgente {
  id: string; estado: EstadoExecucao; criado_em: string; atualizado_em: string;
  resultado: { motivo?: string; mensagens?: number; recomendacoes?: number; pecas?: number; ideias?: number; propostas?: number } | null;
}
export interface TrabalhoAgente {
  pendentes: number; ultimaEntrega: string | null; rodada: RodadaAgente | null;
}

export function situacaoRodada(r: RodadaAgente | null, admin: boolean): { titulo: string; tom: "neutro" | "atencao"; detalhe: string } {
  if (!admin) return { titulo: "Entregas da clínica", tom: "neutro", detalhe: "A equipe Doctor Creator acompanha as execuções. Aqui você revisa os materiais disponíveis para o seu perfil." };
  if (!r) return { titulo: "Sem execução registrada", tom: "atencao", detalhe: "Confira os dados e o módulo da clínica antes de preparar a primeira entrega." };
  if (r.estado === "falhou") return { titulo: "Execução interrompida", tom: "atencao", detalhe: "A última rodada falhou. As entregas anteriores foram preservadas. Confira o histórico técnico antes de tentar novamente." };
  if (r.estado === "pausada") return { titulo: "Execução pausada", tom: "atencao", detalhe: "A equipe precisa conferir a execução e o limite de uso na Central de Agentes." };
  if (r.estado === "aguardando_aprovacao") return { titulo: "Aguarda aprovação da equipe", tom: "atencao", detalhe: "Há uma etapa que depende de aprovação na Central de Agentes." };
  if (["pendente", "rodando", "aguardando"].includes(r.estado)) return { titulo: r.estado === "pendente" ? "Na fila de preparação" : r.estado === "rodando" ? "Preparando a entrega" : "Aguardando a próxima etapa", tom: "neutro", detalhe: "A execução continua no motor. Não é necessário iniciar outra rodada; o estado é atualizado nesta tela." };
  if (r.estado === "cancelada") return { titulo: "Última execução cancelada", tom: "atencao", detalhe: "O cancelamento não apaga as entregas já registradas." };
  if (r.estado !== "concluida") return { titulo: "Estado da execução não reconhecido", tom: "atencao", detalhe: "Peça à equipe para conferir a execução antes de iniciar outra rodada." };
  const valor = r.resultado?.mensagens ?? r.resultado?.recomendacoes ?? r.resultado?.pecas ?? r.resultado?.ideias ?? r.resultado?.propostas;
  const total = typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : null;
  const motivo = typeof r.resultado?.motivo === "string" ? r.resultado.motivo.slice(0, 1000) : null;
  return { titulo: total === 0 ? "Rodada concluída sem novas entregas" : "Última rodada concluída", tom: "neutro", detalhe: motivo || (total != null ? `${total} entrega${total === 1 ? "" : "s"} registrada${total === 1 ? "" : "s"} nesta rodada. Revise o material antes de executar.` : "Confira abaixo os materiais registrados para a clínica.") };
}

export function rodadaEmCurso(r?: RodadaAgente | null): boolean {
  return !!r && !["concluida", "falhou", "cancelada"].includes(r.estado);
}

/** Última rodada por fluxo (RPC agentes_saude: só datas e estado, sem conteúdo nem erro). */
export interface SaudeRotina { fluxo: string; ultima_ok_em: string | null; ultima_em: string | null; ultimo_estado: string | null }
export type EstadoRotina = "em_dia" | "atrasada" | "falha" | "fila_cheia" | "sem_execucao";

const HORA = 3_600_000;
function haQuanto(iso: string, agora: number): string {
  const dias = Math.floor((agora - Date.parse(iso)) / (24 * HORA));
  return dias <= 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
}

/**
 * Situação real da rotina automática, para todos os perfis: "0 para revisar" só quer dizer "nada a revisar" quando a
 * rotina está em dia. Atrasada = sem rodada concluída por mais de 2 vezes o intervalo (no mínimo intervalo + 24 h).
 */
export function saudeRotina(ag: { intervaloHoras: number; frequencia: string; maxAbertas: number }, s: SaudeRotina | null | undefined, pendentes: number, agora = Date.now()): { estado: EstadoRotina; texto: string; atencao: boolean } {
  const freq = ag.frequencia.toLowerCase();
  if (!s?.ultima_ok_em) {
    return s?.ultimo_estado === "falhou"
      ? { estado: "falha", atencao: true, texto: "A última tentativa não terminou e ainda não há rodada concluída para esta clínica. A equipe Doctor Creator precisa conferir." }
      : { estado: "sem_execucao", atencao: true, texto: `Ainda não há rodada concluída para esta clínica (rotina prevista: ${freq}).` };
  }
  const ha = haQuanto(s.ultima_ok_em, agora);
  const atrasada = agora - Date.parse(s.ultima_ok_em) > Math.max(ag.intervaloHoras * 2, ag.intervaloHoras + 24) * HORA;
  if (atrasada && pendentes >= ag.maxAbertas)
    return { estado: "fila_cheia", atencao: true, texto: `Parada: a fila de revisão está cheia (${pendentes} de ${ag.maxAbertas}). A rotina só volta a preparar depois que as propostas forem decididas. Última rodada concluída ${ha}.` };
  if (s.ultimo_estado === "falhou")
    return { estado: "falha", atencao: true, texto: `A última tentativa${s.ultima_em ? ` (${haQuanto(s.ultima_em, agora)})` : ""} não terminou. Última rodada concluída ${ha}. A equipe Doctor Creator precisa conferir.` };
  if (atrasada) return { estado: "atrasada", atencao: true, texto: `Atrasada: a última rodada concluída foi ${ha}, e a rotina prevista é ${freq}.` };
  return { estado: "em_dia", atencao: false, texto: `Em dia: última rodada concluída ${ha} (${freq}).` };
}
