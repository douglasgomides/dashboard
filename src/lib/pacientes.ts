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
  produto?: string | null;
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
  /** Outras clínicas ligadas à mesma conta do CRM: os números são da conta inteira. */
  crm_compartilhado_com?: string[];
  /** A regra "CRM por médico" está ligada para este cliente (crm_filtro_cliente): os números já são só deste médico. */
  crm_filtro_ativo?: boolean;
  tem_crm: boolean;
  tem_conversas: boolean;
  tem_leitura_ia: boolean;
  tem_funil_prospeccao: boolean;
  /** false quando o CRM do cliente nunca registrou um ganho (Digisac): "Fecharam" não é medido (20261102250000). */
  crm_registra_venda?: boolean;
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
    fonte: "CRM da clínica: pessoas cujo primeiro registro na clínica foi no período. Não conta quem já era paciente nem quem a equipe foi buscar (prospecção ativa, que aparece à parte). No Kommo, o contato que ainda está na caixa de entrada (Incoming leads, não aceito pela equipe) também não conta até ser aceito; ele aparece à parte como \"aguardando aceite\". A origem vem do CRM; sem ela, da leitura da conversa. A mesma pessoa com dois cadastros no CRM que o Nexo já ligou (mesmo telefone ou mesma pessoa) conta uma vez: por isso o número pode ficar um pouco abaixo de \"Novos contatos no CRM\" da tela Resultados, que conta cada cadastro (HOMS, outubro: 1.280 aqui e 1.287 lá).",
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
    fonte: "CRM: entraram no período na etapa que marca o comparecimento (consulta realizada, atendido, pós-consulta). Quando o CRM não tem essa etapa, ou tem e ninguém passou por ela enquanto houve agendamento ou venda, aparece \"Não medido\" com o que a clínica precisa fazer, em vez de 0.",
  },
  fecharam: {
    rotulo: "Fecharam",
    legenda: "pessoas que compraram no período",
    fonte: "CRM: vendas marcadas como ganhas no período. O \"ganho\" sem valor no funil de prospecção ativa não é venda: conta como resposta à abordagem.",
  },
  abordados: {
    rotulo: "Abordados pela equipe",
    legenda: "a equipe foi buscar (prospecção ativa)",
    fonte: "CRM: pessoas que entraram no período por um funil de prospecção ativa (como o Social Seller). Mostra quantas responderam, agendaram e fecharam. Clínica sem funil de prospecção ativa vê \"Não se aplica\", em vez de 0.",
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
// Com checkout ligado (Doctor Creator: Hubla), "Fecharam" vem das vendas pagas do checkout, e não do CRM.
export const ROTULO_CHECKOUT: Record<string, string> = { hubla: "Hubla", hotmart: "Hotmart", eduzz: "Eduzz", kiwify: "Kiwify" };

export function nomeCheckout(numero: Numero | undefined): string {
  const p = String(numero?.provedor ?? "").split(",").filter(Boolean);
  return p.length ? p.map((x) => ROTULO_CHECKOUT[x] ?? x).join(" e ") : "checkout";
}

export function vemDoCheckout(numero: Numero | undefined): boolean {
  return numero?.fonte === "checkout";
}

/**
 * Legenda do número: "pela Hubla" quando "Fecharam" vem do checkout. Quando nenhuma venda do checkout se liga a uma
 * pessoa (sem telefone), o número conta vendas, e a legenda diz isso (20261102130000).
 */
export function legendaDoNumero(chave: ChaveNumero, numero: Numero | undefined): string {
  const base = TEXTO_NUMERO[chave].legenda;
  if (chave !== "fecharam" || !vemDoCheckout(numero)) return base;
  if (numero?.unidade === "vendas") return `vendas pagas no período, pela ${nomeCheckout(numero)}`;
  return `${base}, pela ${nomeCheckout(numero)}`;
}

/**
 * Aviso curto sobre a cobertura do checkout em "Fecharam": parte do período veio do CRM, o checkout ainda não cobria o
 * período, parou de mandar venda, ou algumas vendas não se ligam a uma pessoa. null quando não há nada a dizer.
 */
export function avisoCheckout(numero: Numero | undefined): string | null {
  if (!numero || numero.valor == null) return null;
  const d = (k: string) => (typeof numero[k] === "string" ? dataBr(numero[k] as string) : null);
  const nome = nomeCheckout(numero);
  const partes: string[] = [];
  if (vemDoCheckout(numero)) {
    if (d("crm_antes_de"))
      partes.push(Number(numero.vendas_crm ?? 0) > 0
        ? `Antes de ${d("crm_antes_de")}, conta pelo CRM: as vendas da ${nome} chegam ao Nexo desde essa data.`
        : `Conta só a partir de ${d("crm_antes_de")}, quando as vendas da ${nome} começam no Nexo; antes disso, o CRM não marca venda.`);
    if (d("crm_depois_de")) partes.push(`Depois de ${d("crm_depois_de")}, conta pelo CRM: a ${nome} não manda venda ao Nexo desde essa data.`);
    const semPessoa = Number(numero.sem_pessoa ?? 0);
    if (numero.unidade !== "vendas" && semPessoa > 0)
      partes.push(`${semPessoa} ${semPessoa === 1 ? "venda sem telefone conta" : "vendas sem telefone contam"} como uma pessoa cada.`);
  } else {
    if (d("checkout_desde")) partes.push(`Conta pelo CRM: as vendas do checkout só chegam ao Nexo desde ${d("checkout_desde")}.`);
    if (d("checkout_parado_desde")) partes.push(`Conta pelo CRM: o checkout não manda venda ao Nexo desde ${d("checkout_parado_desde")}.`);
  }
  return partes.length ? partes.join(" ") : null;
}

/** Texto de ajuda do número, com a fonte certa quando "Fecharam" vem do checkout. */
export function fonteDoNumero(chave: ChaveNumero, numero: Numero | undefined): string {
  if (chave === "fecharam" && vemDoCheckout(numero))
    return `${nomeCheckout(numero)}: vendas pagas (ou em protesto) no período, pelo valor bruto que o comprador pagou. Order bump e combo contam como uma venda só, pelo total da fatura. Renovação de assinatura não é paciente novo e aparece à parte. Reembolso e chargeback não contam como venda e aparecem à parte. Fora do período que o checkout cobre, vale o CRM.`;
  return TEXTO_NUMERO[chave].fonte;
}

/** "1 renovação de assinatura no período (R$ 97,00), fora de Fecharam", ou null quando não houve. */
export function textoRenovacoes(numero: Numero | undefined, formatarValor: (v: number) => string): string | null {
  const r = numero?.renovacoes as { vendas?: number; valor_total?: number } | undefined;
  const n = Number(r?.vendas ?? 0);
  if (!r || n <= 0) return null;
  return `${n} ${n === 1 ? "renovação" : "renovações"} de assinatura no período (${formatarValor(Number(r.valor_total ?? 0))}), fora de Fecharam`;
}

/** "2 reembolsos ou chargebacks no período (R$ 300,00)", ou null quando não houve. */
export function textoReembolsos(numero: Numero | undefined, formatarValor: (v: number) => string): string | null {
  const r = numero?.reembolsos as { vendas?: number; valor_total?: number } | undefined;
  const n = Number(r?.vendas ?? 0);
  if (!r || n <= 0) return null;
  return `${n} ${n === 1 ? "reembolso ou chargeback" : "reembolsos ou chargebacks"} no período (${formatarValor(Number(r.valor_total ?? 0))})`;
}

/**
 * O número conta só parte do período: as conversas começaram a chegar no meio dele (pacientes_periodo devolve
 * 'cobertura_desde'). Devolve o aviso curto, ou null quando o período todo está coberto.
 */
export function coberturaDoNumero(numero: Numero | undefined): string | null {
  const desde = typeof numero?.cobertura_desde === "string" ? numero.cobertura_desde : null;
  if (!desde || numero?.valor == null) return null;
  return `Conta só a partir de ${dataBr(desde)}, quando as conversas começaram a chegar.`;
}

/** Mudança de leitura de 31/10 (docs/notas-de-versao.md): aparece só quando atinge algum número da tela. */
export const AVISO_NAO_MEDIDO =
  "Mudou em 31/10: quando a fonte não mede (as conversas ainda não chegavam ao Nexo, ou não trazem comentários e reações do Instagram), o número aparece como \"Sem dado\" em vez de 0.";

export function avisoNaoMedido(d: Pick<PacientesPeriodo, "numeros">): string | null {
  const nums = Object.values(d.numeros ?? {}) as (Numero | undefined)[];
  const atinge = nums.some((n) => n && (n.medido_desde != null || n.cobertura_desde != null || n.comentarios_instagram != null));
  return atinge ? AVISO_NAO_MEDIDO : null;
}

/** Mudança de 01/11 (docs/notas-de-versao.md): aparece só quando atinge algum número da tela. */
export const AVISO_TELA_HONESTA =
  "Mudou em 01/11: \"Abordados pela equipe\" aparece como \"Não se aplica\" quando a clínica não usa funil de prospecção, e \"Foram na consulta\" como \"Não medido\" quando a etapa de comparecimento não existe ou não é usada. Antes os dois apareciam como 0.";

const motivoComparecimentoSemUso = (agendaram: number, fecharam: number) => {
  const partes = [agendaram > 0 ? `${agendaram} pessoas agendaram` : null, fecharam > 0 ? `${fecharam} fecharam` : null].filter(Boolean);
  return `Nenhum card passou pela etapa de comparecimento no período, enquanto ${partes.join(" e ")}. O mais comum é a etapa não estar sendo usada; por isso o número não é medido.`;
};

/**
 * Mesma regra da migração 20261102140000, aplicada também na tela (vale antes de o banco ter a migração e não muda
 * nada depois): sem funil de prospecção, "Abordados" não se aplica; comparecimento 0 com agendamento ou venda no
 * período é "não medido". Devolve uma cópia; aplicar duas vezes dá o mesmo resultado.
 */
export function ajustarNumeros<T extends Pick<PacientesPeriodo, "numeros"> & Partial<Pick<PacientesPeriodo, "tem_funil_prospeccao" | "crm_registra_venda">>>(d: T): T {
  const numeros = { ...d.numeros };
  const ab = numeros.abordados;
  if (ab && typeof ab.valor === "number" && d.tem_funil_prospeccao === false)
    numeros.abordados = { valor: null, fonte: "crm", motivo_sem_dado: "A clínica não usa funil de prospecção ativa no CRM, então este número não se aplica.", responsavel: null, nao_se_aplica: true };
  const co = numeros.compareceram;
  const ag = Number(numeros.agendaram?.valor ?? 0) || 0;
  const fe = Number(numeros.fecharam?.valor ?? 0) || 0;
  if (co && co.valor === 0 && ag + fe > 0)
    numeros.compareceram = {
      valor: null, fonte: "crm", motivo_sem_dado: motivoComparecimentoSemUso(ag, fe), responsavel: "comercial", nao_medido_por: "etapa_sem_uso",
      o_que_fazer: "Mover o card para a etapa de comparecimento (consulta realizada) quando o paciente for à consulta, antes de marcar como ganho.",
    };
  // CRM que nunca registra ganho (Digisac): 0 em "Fecharam" não é medido (mesma regra da migração 20261102250000).
  const fc = numeros.fecharam;
  if (fc && fc.fonte === "crm" && fc.valor === 0 && d.crm_registra_venda === false)
    numeros.fecharam = {
      valor: null, fonte: "crm", motivo_sem_dado: "O CRM da clínica não registra venda (nenhum card ganho), então não dá para contar quem fechou.",
      responsavel: "equipe_hub", nao_medido_por: "crm_sem_venda",
    };
  return { ...d, numeros };
}

/** Mudança de 02/11 (docs/notas-de-versao.md): aparece só quando atinge algum número da tela. */
export const AVISO_DEFINICOES_0211 =
  "Mudou em 02/11: contato parado na caixa de entrada do Kommo (Incoming leads, ainda não aceito pela equipe) não conta como pessoa nova até ser aceito e aparece à parte como \"aguardando aceite\"; \"Fecharam\" aparece como \"Não medido\" quando o CRM nunca registra venda; e \"Interagiram no Instagram\" aparece como \"Não medido\" quando os comentários pararam de chegar pelas conversas.";

/** "1.196 aguardando aceite na caixa de entrada do Kommo (fora da conta)", ou null. */
export function textoAguardandoAceite(numero: Numero | undefined): string | null {
  const n = Number(numero?.aguardando_aceite ?? 0);
  if (!numero || numero.valor == null || !(n > 0)) return null;
  return `aguardando aceite: ${n.toLocaleString("pt-BR")} na caixa de entrada do Kommo (contam quando a equipe aceitar)`;
}

export function avisoDefinicoes0211(d: Pick<PacientesPeriodo, "numeros">): string | null {
  const n = d.numeros ?? ({} as PacientesPeriodo["numeros"]);
  const atinge = Number(n.leads_novos?.aguardando_aceite ?? 0) > 0
    || n.fecharam?.nao_medido_por === "crm_sem_venda"
    || n.engajaram_instagram?.nao_medido_por === "fonte_parou";
  return atinge ? AVISO_DEFINICOES_0211 : null;
}

/** Rótulo do cartão sem número: "Não se aplica" (não existe na clínica), "Não medido" (existe e não é medido) ou "Sem dado". */
export function textoNaoMedido(n: Numero | undefined): string {
  if (n?.nao_se_aplica) return "Não se aplica";
  if (n?.nao_medido_por || n?.o_que_fazer) return "Não medido";
  return "Sem dado";
}

export function avisoTelaHonesta(d: Pick<PacientesPeriodo, "numeros">): string | null {
  const n = d.numeros ?? ({} as PacientesPeriodo["numeros"]);
  return n.abordados?.nao_se_aplica || n.compareceram?.nao_medido_por ? AVISO_TELA_HONESTA : null;
}

/**
 * Samira, outubro: 36 fecharam e 3 agendaram. As duas regras são diferentes, e a tela precisa dizer isso:
 * "Fecharam" conta quem foi marcado como ganho no período (inclusive quem agendou antes do período e ganhos marcados
 * em lote); "Agendaram" conta só quem entrou na etapa de agendamento no período ou disse na conversa que agendou.
 */
export function avisoAgendouMenosQueFechou(d: Pick<PacientesPeriodo, "numeros">): string | null {
  const ag = d.numeros?.agendaram?.valor, fe = d.numeros?.fecharam?.valor;
  if (ag == null || fe == null || fe <= ag || fe < 5) return null;
  const f = (x: number) => x.toLocaleString("pt-BR");
  return `${f(fe)} pessoas fecharam no período, mas só ${f(ag)} aparecem como agendadas. As regras são diferentes: "Fecharam" conta quem foi marcado como ganho no período (inclusive quem agendou antes dele, e ganhos marcados de uma vez só); "Agendaram" conta quem entrou na etapa de agendamento do CRM no período ou disse na conversa que agendou. Quando a venda é marcada sem o card passar pela etapa de agendamento, os agendados ficam abaixo do real.`;
}

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

/** Aviso de CRM compartilhado: só enquanto o cliente não tem a regra de separação por médico. */
export function avisoCrmCompartilhado(d: Pick<PacientesPeriodo, "crm_compartilhado_com" | "crm_filtro_ativo">): string | null {
  if (d.crm_filtro_ativo) return null;
  const outros = d.crm_compartilhado_com ?? [];
  if (!outros.length) return null;
  return `O CRM desta clínica é o mesmo de ${outros.join(", ")}. Os números abaixo são da conta inteira, não só deste médico. ` +
    `Para separar, a clínica precisa marcar o médico em cada lead (um campo "Médico" no CRM).`;
}

/** Nota quando a regra está ligada: diz de onde vêm os números. */
export function notaCrmPorMedico(d: Pick<PacientesPeriodo, "crm_filtro_ativo">): string | null {
  return d.crm_filtro_ativo
    ? "Números só deste médico: o CRM é dividido com outros médicos, e aqui entram só os cards, conversas e atendimentos dele (regra combinada com a clínica)."
    : null;
}
