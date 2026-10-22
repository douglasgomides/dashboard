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
  titulo: string; origem: string; etapa: EtapaCrm; responsavel: string; responsavel_id?: string | null;
  proxima_acao: string; prazo: string | null; versao: number; atualizado_em: string;
}
export interface MembroCrm { id: string; nome: string }
export interface ConfigCrm { ativo: boolean; pode_editar: boolean; usuario_id?: string; equipe?: MembroCrm[] }
export type RotinaCrm = "todas" | "hoje" | "atrasadas" | "sem_acao";
export interface ListaCrm { total: number; atrasadas: number; hoje?: number; sem_acao?: number; agendados?: number; entrada_total?: number; limite_coluna?: number; por_etapa: Partial<Record<EtapaCrm, number>>; filtradas: number; cards: CardCrm[] }
export interface ContatoCrm { id: string; nome: string | null; telefone_final: string | null; origem: string; conversa_id: string | null; ultima_msg_em?: string | null }
export interface EntradaCrm { total: number; contatos: ContatoCrm[] }
export interface EventoCrm { id: string; autor: string; autor_nome?: string; acao: string; origem: string; motivo: string; antes: CardCrm | null; depois: CardCrm; criado_em: string }
export interface SugestaoCrm { id: string; etapa: EtapaCrm; versao: number; motivo: string; evidencia: string; estado: string; criado_em: string }
export interface DetalheCrm { card: CardCrm; ia_disponivel: boolean; ia_motivo: string | null; historico: EventoCrm[]; sugestoes: SugestaoCrm[] }
export function prazoVencido(card: Pick<CardCrm,"etapa"|"prazo">, agora = Date.now()) {
 return !["agendado","encerrado"].includes(card.etapa) && !!card.prazo && Date.parse(card.prazo) < agora;
}
const partesBrasilia = new Intl.DateTimeFormat("en-CA", {
 timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",
});
export function dataParaInput(iso: string | null) {
 if (!iso) return "";
 const date = new Date(iso);
 if (!Number.isFinite(date.getTime())) return "";
 const p=Object.fromEntries(partesBrasilia.formatToParts(date).map(x=>[x.type,x.value]));
 return `${p.year.padStart(4,"0")}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function inputParaData(valor:string) {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor))throw new Error("Confira a data e o horário da próxima ação.");
 const desejado=Date.parse(valor+"Z");
 if(!Number.isFinite(desejado))throw new Error("Confira a data e o horário da próxima ação.");
 let instante=desejado;
 for(let i=0;i<3;i++) {
  const exibido=Date.parse(dataParaInput(new Date(instante).toISOString())+"Z");
  instante+=desejado-exibido;
 }
 const iso=new Date(instante).toISOString();
 if(dataParaInput(iso)!==valor)throw new Error("Confira a data e o horário da próxima ação.");
 return iso;
}
