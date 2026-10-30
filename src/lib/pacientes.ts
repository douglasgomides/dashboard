// Tela "Pacientes do período": tipos do que o banco devolve (pacientes_periodo e pacientes_vendas), textos que o
// médico lê e as contas de recompra e follow-up. Tudo em pessoas. Sem telefone: o banco devolve só o primeiro nome.
import { REGRAS_RECOMPRA, FOLLOW_UP, type RegraRecompra } from "@/lib/config/recompra";

export type Responsavel = "comercial" | "equipe_hub" | null;

export interface Numero {
  valor: number | null;
  fonte: string;
  motivo_sem_dado: string | null;
  responsavel: Responsavel;
  [extra: string]: unknown;
}

export interface ItemPessoa {
  id: string;
  pessoa: string;
  nome: string | null;
  canal: "whatsapp" | "instagram" | "outro" | null;
  conversa_id: string | null;
  data: string | null;
  fonte: string | null;
  crm: { funil: string | null; etapa: string | null; resultado: string | null } | null;
  leitura: { etapa: string | null; interesse: string | null } | null;
  // Extras de cada lista.
  canais?: string[] | null;
  tipo?: "comentou" | "story";
  origem?: string;
  origem_fonte?: string | null;
  respondeu?: boolean;
  agendou?: boolean;
  fechou?: boolean;
  fontes?: string[];
  agendou_em?: string;
  compareceu_depois?: boolean;
  fechou_depois?: boolean;
  valor?: number | null;
  funil?: string | null;
  procedimento?: string | null;
}

export interface Lista {
  total: number;
  itens: ItemPessoa[];
}

export const CHAVES_NUMEROS = [
  "mandaram_mensagem",
  "leads_novos",
  "antigos",
  "agendaram",
  "negociacao",
  "compareceram",
  "fecharam",
  "abordados",
] as const;
export type ChaveNumero = (typeof CHAVES_NUMEROS)[number] | "engajaram_instagram";

export interface PacientesPeriodo {
  periodo: { de: string; ate: string };
  cliente_de_teste: boolean;
  tem_crm: boolean;
  tem_conversas: boolean;
  tem_leitura_ia: boolean;
  tem_funil_prospeccao: boolean;
  numeros: Record<ChaveNumero, Numero>;
  listas: Record<ChaveNumero, Lista>;
}

export interface VendaHistorico {
  id: string;
  venda: string;
  nome: string | null;
  data: string;
  valor: number | null;
  funil: string | null;
  procedimento: string | null;
  interesse: string | null;
  conversa_id: string | null;
}

/** Rótulo, legenda curta e o texto do "i" de cada número. Português simples, sem jargão. */
export const TEXTO_NUMERO: Record<ChaveNumero, { rotulo: string; legenda: string; fonte: string }> = {
  mandaram_mensagem: {
    rotulo: "Mandaram mensagem",
    legenda: "pessoas que escreveram no WhatsApp ou no Instagram Direct",
    fonte: "Conversas do WhatsApp e do Instagram Direct com pelo menos uma mensagem escrita pela pessoa no período. Comentário em post, reação e resposta a story não contam aqui.",
  },
  leads_novos: {
    rotulo: "Pessoas novas",
    legenda: "chegaram pela primeira vez à clínica",
    fonte: "CRM da clínica: pessoas cujo primeiro registro na clínica foi no período. Não conta quem já era paciente nem quem a equipe foi buscar (prospecção ativa, que aparece à parte). A origem vem do CRM; sem ela, da leitura da conversa.",
  },
  antigos: {
    rotulo: "Pacientes antigos",
    legenda: "já eram da clínica e voltaram a chamar",
    fonte: "Mandaram mensagem no período e já eram da clínica antes: tinham registro no CRM antes do período, o CRM marca como paciente antigo, ou a leitura da conversa diz que já é paciente.",
  },
  agendaram: {
    rotulo: "Agendaram",
    legenda: "marcaram consulta ou procedimento",
    fonte: "CRM: entraram na etapa de agendamento no período. Conversas: a leitura da conversa do período diz que agendou. Quem aparece nas duas fontes conta uma vez só.",
  },
  negociacao: {
    rotulo: "Em negociação",
    legenda: "conversando sobre valor ou horário",
    fonte: "CRM: atendimento ainda aberto que teve movimento no período e não está em agendamento. Conversas: a leitura diz que a pessoa está em qualificação, recebeu o preço ou está escolhendo horário. Não conta quem já agendou, quem fechou nem atendimento encerrado sem resultado.",
  },
  compareceram: {
    rotulo: "Foram na consulta",
    legenda: "compareceram no período",
    fonte: "CRM: entraram no período na etapa que marca o comparecimento (consulta realizada, atendido, pós-consulta).",
  },
  fecharam: {
    rotulo: "Fecharam",
    legenda: "pessoas que compraram no período",
    fonte: "CRM: vendas marcadas como ganhas no período. O \"ganho\" sem valor no funil de prospecção ativa não é venda: conta como resposta à abordagem.",
  },
  abordados: {
    rotulo: "Abordados pela equipe",
    legenda: "a equipe foi buscar (prospecção ativa)",
    fonte: "CRM: pessoas que entraram no período por um funil de prospecção ativa (como o Social Seller). Mostra quantas responderam, agendaram e fecharam.",
  },
  engajaram_instagram: {
    rotulo: "Interagiram no Instagram",
    legenda: "só comentaram ou reagiram, sem mandar mensagem",
    fonte: "Pessoas que só comentaram em post ou só reagiram, responderam ou compartilharam story. Não são contato comercial ainda, por isso não entram em \"Mandaram mensagem\".",
  },
};

export const ROTULO_RESPONSAVEL: Record<Exclude<Responsavel, null>, string> = {
  comercial: "Quem resolve: a equipe comercial da clínica",
  equipe_hub: "Quem resolve: a equipe Doctor Creator",
};

export const ROTULO_CANAL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram Direct", outro: "Outro canal" };

const ETAPA_LEITURA: Record<string, string> = {
  so_robo: "Só falou com o robô",
  sem_resposta_paciente: "Parou de responder",
  engajou: "Conversando",
  qualificacao: "Tirando dúvidas",
  preco_apresentado: "Recebeu o valor",
  agendamento_em_curso: "Escolhendo horário",
  agendou: "Agendou",
  nao_e_paciente: "Não é paciente",
};

export const ROTULO_ORIGEM: Record<string, string> = {
  anuncio: "Anúncio",
  instagram_organico: "Instagram sem anúncio",
  indicacao: "Indicação",
  google: "Google",
  outras: "Outras origens",
  sem_origem: "Sem origem informada",
};

export const ROTULO_FONTE: Record<string, string> = {
  crm: "CRM",
  conversa: "conversa",
  crm_e_conversa: "CRM e conversa",
  crm_antes: "já estava no CRM",
  crm_origem: "CRM marca como paciente antigo",
  instagram: "Instagram",
};

/** Em que pé está, em uma frase curta: a leitura da conversa quando há, senão a etapa do CRM. */
export function emQuePe(item: ItemPessoa): string | null {
  if (item.crm?.resultado === "won") return "Fechou";
  if (item.crm?.resultado === "lost") return "Desistiu (marcado no CRM)";
  const ia = item.leitura?.etapa ? ETAPA_LEITURA[item.leitura.etapa] : null;
  if (ia) return ia;
  if (item.crm?.resultado === "closed") return "Atendimento encerrado sem resultado";
  return item.crm?.etapa ?? null;
}

/** O que a pessoa pediu ou fechou. */
export function oQue(item: ItemPessoa): string | null {
  return item.procedimento ?? item.leitura?.interesse ?? item.funil ?? null;
}

export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
}

/** Regra de recompra pelo procedimento, pelo interesse lido ou pelo funil (nessa ordem). */
export function regraDaVenda(textos: (string | null | undefined)[], regras: RegraRecompra[] = REGRAS_RECOMPRA): RegraRecompra | null {
  for (const t of textos) {
    if (!t) continue;
    const r = regras.find((x) => x.casa.test(t));
    if (r) return r;
  }
  return null;
}

export interface Recompra {
  regra: RegraRecompra | null;
  /** Data em que vale chamar de novo; null = sem regra ("definir prazo"). */
  prevista: string | null;
  ate: string | null;
  /** Dias até a data prevista (negativo = já passou). */
  faltam: number | null;
}

export function recompraDe(venda: Pick<VendaHistorico, "data" | "procedimento" | "interesse" | "funil">, regras: RegraRecompra[] = REGRAS_RECOMPRA, hoje?: string): Recompra {
  const regra = regraDaVenda([venda.procedimento, venda.interesse, venda.funil], regras);
  if (!regra) return { regra: null, prevista: null, ate: null, faltam: null };
  const prevista = somaDias(venda.data, regra.diasMin);
  return { regra, prevista, ate: somaDias(venda.data, regra.diasMax), faltam: hoje ? diasEntre(hoje, prevista) : null };
}

export interface ParaChamar {
  id: string;
  nome: string | null;
  conversa_id: string | null;
  tipo: "recompra" | "agendou_sem_retorno";
  /** Frase curta: por que chamar. */
  motivo: string;
  quando: string;
  /** Para ordenar: dias até a data (negativo = atrasado). */
  faltam: number;
}

/**
 * Quem chamar agora: recompra vencendo nos próximos dias (ou vencida) e quem agendou e, depois de alguns dias, não tem
 * comparecimento nem fechamento. Venda mais nova da mesma pessoa com a mesma regra substitui a antiga (já voltou).
 */
export function paraChamarAgora(
  vendas: VendaHistorico[],
  agendaram: ItemPessoa[],
  hoje: string,
  opts: { regras?: RegraRecompra[]; diasAntes?: number; diasSemRetorno?: number } = {},
): ParaChamar[] {
  const regras = opts.regras ?? REGRAS_RECOMPRA;
  const diasAntes = opts.diasAntes ?? FOLLOW_UP.diasAntesDaRecompra;
  const diasSemRetorno = opts.diasSemRetorno ?? FOLLOW_UP.diasAgendouSemRetorno;
  const ultima = new Map<string, { v: VendaHistorico; r: Recompra }>();
  for (const v of vendas) {
    const r = recompraDe(v, regras, hoje);
    if (!r.regra) continue;
    const chave = `${v.id}:${r.regra.id}`;
    const atual = ultima.get(chave);
    if (!atual || atual.v.data < v.data) ultima.set(chave, { v, r });
  }
  const out: ParaChamar[] = [];
  for (const { v, r } of ultima.values()) {
    if (r.faltam === null || r.prevista === null || r.faltam > diasAntes) continue;
    out.push({
      id: `r:${v.venda}`,
      nome: v.nome,
      conversa_id: v.conversa_id,
      tipo: "recompra",
      motivo: `${r.regra!.rotulo} em ${dataBr(v.data)}: ${r.faltam < 0 ? `${r.regra!.motivo} venceu em ${dataBr(r.prevista)}` : `${r.regra!.motivo} a partir de ${dataBr(r.prevista)}`}`,
      quando: r.prevista,
      faltam: r.faltam,
    });
  }
  for (const a of agendaram) {
    if (!a.agendou_em || a.compareceu_depois || a.fechou_depois) continue;
    const passou = diasEntre(a.agendou_em, hoje);
    if (passou < diasSemRetorno) continue;
    out.push({
      id: `a:${a.pessoa}`,
      nome: a.nome,
      conversa_id: a.conversa_id,
      tipo: "agendou_sem_retorno",
      motivo: `Agendou em ${dataBr(a.agendou_em)} e, ${passou} dias depois, não aparece que foi na consulta nem que fechou`,
      quando: a.agendou_em,
      faltam: -passou,
    });
  }
  return out.sort((x, y) => x.faltam - y.faltam);
}

/** Recompra de cada venda do período, para a lista "Fecharam". */
export function rotuloRecompra(r: Recompra): string {
  if (!r.regra || !r.prevista) return "Definir prazo de retorno";
  return r.regra.diasMax > r.regra.diasMin
    ? `Voltar entre ${dataBr(r.prevista)} e ${dataBr(r.ate)}`
    : `Voltar a partir de ${dataBr(r.prevista)}`;
}
