export const ETAPAS_CRM = [
  { id: "novo", nome: "Novo contato" },
  { id: "atendimento", nome: "Em atendimento" },
  { id: "interesse", nome: "Demonstrou interesse" },
  { id: "agendamento", nome: "Quer agendar" },
  { id: "agendado", nome: "Agendado" },
  { id: "encerrado", nome: "Encerrado" },
] as const;
export type EtapaCrm = typeof ETAPAS_CRM[number]["id"];
export const nomeEtapa = (id: string) => ETAPAS_CRM.find(e => e.id === id)?.nome ?? id;
export interface CardCrm {
  id: string; client_id: string; pessoa_id: string | null; conversa_id: string | null;
  titulo: string; origem: string; etapa: EtapaCrm; responsavel: string;
  proxima_acao: string; prazo: string | null; versao: number; atualizado_em: string;
}
export interface ConfigCrm { ativo: boolean; pode_editar: boolean }
export interface ListaCrm { total: number; atrasadas: number; por_etapa: Partial<Record<EtapaCrm, number>>; filtradas: number; cards: CardCrm[] }
export interface ContatoCrm { id: string; nome: string | null; telefone_final: string | null; origem: string; conversa_id: string | null }
export interface EventoCrm { id: string; autor: string; acao: string; origem: string; motivo: string; antes: CardCrm | null; depois: CardCrm; criado_em: string }
export interface SugestaoCrm { id: string; etapa: EtapaCrm; versao: number; motivo: string; evidencia: string; estado: string; criado_em: string }
export interface DetalheCrm { card: CardCrm; historico: EventoCrm[]; sugestoes: SugestaoCrm[] }
export function prazoVencido(card: Pick<CardCrm,"etapa"|"prazo">, agora = Date.now()) {
 return !["agendado","encerrado"].includes(card.etapa) && !!card.prazo && Date.parse(card.prazo) < agora;
}
export function dataParaInput(iso: string | null) {
 if (!iso) return "";
 const date = new Date(iso);
 return new Date(date.getTime() - date.getTimezoneOffset()*60_000).toISOString().slice(0,16);
}
