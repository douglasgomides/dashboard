export interface FonteOperacao {
  fonte: string; sucesso_em: string | null; dados_ate: string | null; erro_posterior: boolean; atual: boolean;
}
export interface SaudeOperacao { apto: boolean; limite_horas: number; fontes: FonteOperacao[] }
export interface EventoOperacao { tipo: string; fonte: string; id: string; em: string }
export interface TrabalhoRecuperacao {
  id: string; client_id: string; sugestao_id: string; conversa_id: string; responsavel_id: string; responsavel_nome: string;
  prazo: string; estado: "pronta" | "aguardando_resposta" | "bloqueada" | "escalada" | "resolvida" | "cancelada";
  motivo: string | null; mensagem_id: string | null; aprovado_em: string; criado_em: string; atualizado_em: string;
  observacao: { eventos_crm?: EventoOperacao[]; resposta?: { id: string; em: string; fonte: string } | null;
    contato_vinculado?: { id: string; externo_id: string; em: string; fonte: string } | null };
  sugestao?: { mensagem: string | null; titulo: string | null } | null;
  conversa?: { pessoa: { nome: string | null } | null } | null;
}
export const NOME_OPERACAO: Record<TrabalhoRecuperacao["estado"], string> = {
  pronta: "Contato a realizar", aguardando_resposta: "Aguardando resposta", bloqueada: "Fonte precisa de atenção",
  escalada: "Revisão da equipe", resolvida: "Caso avançou", cancelada: "Acompanhamento encerrado",
};
export const NOME_EVENTO: Record<string, string> = {
  agendado: "Agendamento registrado", compareceu: "Comparecimento registrado", fechou: "Venda registrada", perdeu: "Perda registrada",
};
export function resumoOperacao(itens: TrabalhoRecuperacao[]) {
  return {
    emCurso: itens.filter(t => ["pronta", "aguardando_resposta"].includes(t.estado)).length,
    atencao: itens.filter(t => ["bloqueada", "escalada"].includes(t.estado)).length,
    contatos: itens.filter(t => t.mensagem_id !== null).length,
    respostas: itens.filter(t => !!t.observacao.resposta).length,
    agendamentos: itens.filter(t => t.observacao.eventos_crm?.some(e => e.tipo === "agendado")).length,
  };
}
