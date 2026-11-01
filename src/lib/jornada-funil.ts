// Jornada em 7 etapas (alcance → engajamento → comentário/direct → conversa → lead → agendamento → venda).
// Cada etapa diz o número E se ele é confiável: medido, zero de verdade, ou sem como medir (e por quê).
// Etapa sem integração NUNCA vira zero: vira "falta X" com o dado que seria necessário.

import type { Funil as FunilComercial } from "./comercial";
import { agendadosSaoGanhos, avisoAgendadosSaoGanhos, passagem, type BaseFunil } from "./funil-taxa";
import type { Numero, PacientesPeriodo } from "./pacientes";

export interface FunilBanco {
  alcance: number;
  dias_alcance: number;
  interacoes: number;
  dias_interacoes: number;
  comentarios: number;
  comentaristas: number;
  conversas: number;
  leads: number;
  leads_com_etapa: number;
  agendados: number;
  vendas: number;
  receita: number;
  dias_periodo: number;
  fontes: {
    tem_instagram: boolean;
    tem_comentarios: boolean;
    tem_whatsapp: boolean;
    tem_conversas: boolean;
    tem_crm: boolean;
    tem_etapa_agendamento: boolean;
    tem_venda_registrada: boolean;
    crm_provider: string | null;
  };
}

export type EstadoEtapa = "medido" | "zero" | "parcial" | "sem_integracao";
export type IdEtapa = "alcance" | "engajamento" | "comentario" | "conversa" | "lead" | "agendamento" | "venda";

export interface EtapaFunil {
  id: IdEtapa;
  n: number; // 1..7
  nome: string;
  valor: number | null; // null = não dá para medir
  unidade: string;
  estado: EstadoEtapa;
  // Taxa sobre a etapa anterior medida (só quando as duas são medidas e a anterior tem o mínimo de LIMITES.funil).
  taxa: number | null;
  // "N de M" quando a etapa anterior é pequena demais para %.
  fracao: { n: number; m: number } | null;
  explicacao: string | null; // o que falta / por que é zero / limite da leitura
  falta?: { integracao: string; dado: string; onde: string } | null;
  /** A etapa anterior conta outra coisa (outra unidade ou outra população): sem % entre as duas, com o porquê. */
  semPassagem?: string | null;
}

export interface Funil {
  etapas: EtapaFunil[];
  medidas: number;
  maiorQueda: { de: IdEtapa; para: IdEtapa; taxa: number } | null;
  receita: number;
}

const NOME_CRM: Record<string, string> = { kommo: "Kommo", clint: "Clint", rdstation: "RD Station", flwchat: "flwChat", digisac: "Digisac", feegow: "Feegow", ninsaude: "Ninsaúde", planilha: "planilha" };

/** Etapas comerciais que servem de base com mínimo de casos. As de Instagram (alcance, engajamento, comentário) ficam sem mínimo. */
const BASE_DA_ETAPA: Partial<Record<IdEtapa, BaseFunil>> = { conversa: "leads", lead: "leads", agendamento: "agendamentos" };

/** Aviso de tela da mudança de 01/11 (docs/notas-de-versao.md). */
export const AVISO_JORNADA_PESSOAS =
  "Mudou em 01/11: \"Lead no CRM\" e \"Consulta agendada\" contam pessoas, com a mesma regra da tela Pacientes do período. Antes contavam cards do CRM (Dr. Sergio Maia, outubro: 236 cards contra 19 pessoas novas) e o agendamento pela situação de hoje do card.";

const fmtN = (n: number) => n.toLocaleString("pt-BR");

/**
 * @param pacientes números de pacientes_periodo (pessoas). Com eles, "Lead no CRM" e "Consulta agendada" usam a mesma
 *   regra da tela Pacientes do período. null = a leitura falhou: as duas etapas mostram os cards do CRM, com esse nome.
 *   undefined = não pedido (testes antigos): mesmo comportamento de null.
 */
export function montarFunil(d: FunilBanco | null | undefined, comercial?: FunilComercial | null, pacientes?: Pick<PacientesPeriodo, "numeros"> | null): Funil {
  const f = d?.fontes;
  const pn = pacientes?.numeros ?? null;
  const crm = f?.crm_provider ? NOME_CRM[f.crm_provider] ?? f.crm_provider : "o CRM";
  const e: Omit<EtapaFunil, "taxa" | "fracao">[] = [];

  // 1. Alcance
  if (!f?.tem_instagram) {
    e.push({ id: "alcance", n: 1, nome: "Alcance", valor: null, unidade: "contas alcançadas", estado: "sem_integracao", explicacao: "Sem Instagram ligado, não há como medir quantas pessoas viram o conteúdo.", falta: { integracao: "Instagram (conta profissional)", dado: "Alcance diário da conta", onde: "Admin > cliente > Conta Instagram" } });
  } else if (!d || d.dias_alcance === 0) {
    e.push({ id: "alcance", n: 1, nome: "Alcance", valor: null, unidade: "contas alcançadas", estado: "parcial", explicacao: "O Instagram está ligado, mas nenhum dia do período trouxe alcance. Veja a Saúde das fontes: costuma ser a conta fora da coleta diária.", falta: { integracao: "Coleta diária do Instagram", dado: "Alcance por dia", onde: "Admin > Saúde das fontes" } });
  } else {
    const parcial = d.dias_alcance < d.dias_periodo * 0.8;
    e.push({ id: "alcance", n: 1, nome: "Alcance", valor: d.alcance, unidade: "alcance somado dos dias", estado: parcial ? "parcial" : "medido", explicacao: `Soma do alcance de cada dia (a mesma pessoa em dois dias conta duas vezes).${parcial ? ` Só ${d.dias_alcance} de ${d.dias_periodo} dias têm dado.` : ""}` });
  }

  // 2. Engajamento
  if (!f?.tem_instagram) {
    e.push({ id: "engajamento", n: 2, nome: "Engajamento", valor: null, unidade: "interações", estado: "sem_integracao", explicacao: "Depende do Instagram ligado.", falta: { integracao: "Instagram (conta profissional)", dado: "Curtidas, comentários, salvamentos e compartilhamentos por dia", onde: "Admin > cliente > Conta Instagram" } });
  } else if (!d || d.dias_interacoes === 0) {
    e.push({ id: "engajamento", n: 2, nome: "Engajamento", valor: null, unidade: "interações", estado: "parcial", explicacao: "Nenhum dia do período trouxe interações da conta.", falta: { integracao: "Coleta diária do Instagram", dado: "Interações por dia", onde: "Admin > Saúde das fontes" } });
  } else {
    e.push({ id: "engajamento", n: 2, nome: "Engajamento", valor: d.interacoes, unidade: "interações", estado: d.interacoes > 0 ? "medido" : "zero", explicacao: "Curtidas, comentários, salvamentos e compartilhamentos somados no período." });
  }

  // 3. Comentário ou direct
  if (!f?.tem_instagram || !f.tem_comentarios) {
    e.push({ id: "comentario", n: 3, nome: "Comentário ou direct", valor: null, unidade: "pessoas que comentaram", estado: "sem_integracao", explicacao: "Os comentários desta conta ainda não são coletados. Directs do Instagram não são lidos pelo painel (a Meta só libera para apps aprovados de mensagens).", falta: { integracao: "Coleta de comentários do Instagram", dado: "Comentários com o @ de quem comentou", onde: "Botão de atualizar no topo do painel (Comentários)" } });
  } else {
    const semAutores = d!.comentarios > 0 && d!.comentaristas === 0;
    e.push({ id: "comentario", n: 3, nome: "Comentário ou direct", valor: semAutores ? null : d!.comentaristas, unidade: "pessoas que comentaram", estado: semAutores || d!.comentaristas > 0 ? "parcial" : "zero", explicacao: semAutores ? `${d!.comentarios.toLocaleString("pt-BR")} comentários disponíveis, mas sem identificação dos autores. A quantidade de pessoas e a conversão desta etapa não podem ser medidas.` : `${d!.comentarios.toLocaleString("pt-BR")} comentários de ${d!.comentaristas.toLocaleString("pt-BR")} pessoas. Directs não entram (a Meta não libera a leitura para o painel), então esta etapa sempre fica abaixo do real.` });
  }

  // 4. Conversa no WhatsApp
  if (!f?.tem_whatsapp) {
    e.push({ id: "conversa", n: 4, nome: "Conversa no WhatsApp", valor: null, unidade: "conversas iniciadas", estado: "sem_integracao", explicacao: "O WhatsApp da clínica não está ligado ao painel, então não dá para saber quantas pessoas chamaram.", falta: { integracao: "WhatsApp pela WTS (Helena)", dado: "Conversas com data e telefone", onde: "Equipe Doctor Creator: cadastrar a empresa da WTS no cliente" } });
  } else if (!f.tem_conversas) {
    e.push({ id: "conversa", n: 4, nome: "Conversa no WhatsApp", valor: null, unidade: "conversas iniciadas", estado: "parcial", explicacao: "O WhatsApp está ligado, mas as mensagens ainda não foram puxadas (só os atendimentos).", falta: { integracao: "Leitura das conversas da WTS", dado: "Mensagens de cada conversa", onde: "Equipe Doctor Creator: ligar a leitura de conversas da WTS" } });
  } else {
    e.push({ id: "conversa", n: 4, nome: "Conversa no WhatsApp", valor: d!.conversas, unidade: "conversas iniciadas", estado: d!.conversas > 0 ? "medido" : "zero", explicacao: d!.conversas > 0 ? "Conversas que começaram no período." : "Nenhuma conversa nova no período, com o WhatsApp ligado." });
  }

  // 5. Lead no CRM
  if (!f?.tem_crm) {
    e.push({ id: "lead", n: 5, nome: "Lead no CRM", valor: null, unidade: "leads novos", estado: "sem_integracao", explicacao: "Sem CRM ligado, não há como saber quem virou oportunidade.", falta: { integracao: "CRM (Kommo, Clint, RD ou planilha)", dado: "Leads com data de entrada e etapa", onde: "Admin > cliente > CRM" } });
  } else if (pn?.leads_novos) {
    const ln: Numero = pn.leads_novos;
    const cards = d ? ` O ${crm} tem ${fmtN(d.leads)} cards criados no período: a mesma pessoa pode ter vários (orçamentos, retornos), e quem já era paciente não entra aqui.` : "";
    if (ln.valor == null) e.push({ id: "lead", n: 5, nome: "Lead no CRM", valor: null, unidade: "pessoas novas", estado: "parcial", explicacao: ln.motivo_sem_dado ?? "Sem dado de pessoas novas no período." });
    else e.push({ id: "lead", n: 5, nome: "Lead no CRM", valor: ln.valor, unidade: "pessoas novas", estado: ln.valor > 0 ? "medido" : "zero", explicacao: `Pessoas que chegaram pela primeira vez à clínica no período (mesma conta de Pacientes do período).${cards}` });
  } else {
    e.push({ id: "lead", n: 5, nome: "Lead no CRM", valor: d!.leads, unidade: "cards criados no CRM", estado: d!.leads > 0 ? "medido" : "zero", explicacao: d!.leads > 0 ? `Cards criados no ${crm} no período, não pessoas: a mesma pessoa pode ter vários cards, e paciente antigo também abre card. A contagem por pessoa (tela Pacientes do período) não respondeu agora.` : `Nenhum card novo no ${crm} no período. Confirme com o cliente se os leads estão sendo lançados.` });
  }

  // 6. Consulta agendada
  if (!f?.tem_crm) {
    e.push({ id: "agendamento", n: 6, nome: "Consulta agendada", valor: null, unidade: "leads com agendamento", estado: "sem_integracao", explicacao: "Depende do CRM.", falta: { integracao: "CRM", dado: "Etapa de agendamento no funil", onde: "Admin > cliente > CRM" } });
  } else if (pn?.agendaram) {
    const ag: Numero = pn.agendaram;
    const fe = pn.fecharam?.valor;
    const menos = ag.valor != null && fe != null && fe > ag.valor ? ` No período, ${fmtN(fe)} pessoas fecharam e só ${fmtN(ag.valor)} aparecem como agendadas: a venda costuma ser marcada sem o card passar pela etapa de agendamento.` : "";
    if (ag.valor == null) e.push({ id: "agendamento", n: 6, nome: "Consulta agendada", valor: null, unidade: "pessoas que agendaram", estado: "parcial", explicacao: ag.motivo_sem_dado ?? "Sem dado de agendamento no período." });
    else e.push({ id: "agendamento", n: 6, nome: "Consulta agendada", valor: ag.valor, unidade: "pessoas que agendaram", estado: ag.valor > 0 ? "medido" : "zero", explicacao: `Mesma regra da tela Pacientes do período: pessoas que entraram na etapa de agendamento do ${crm} no período, ou que disseram na conversa que agendaram. Inclui pacientes antigos.${menos}` });
  } else if (!f.tem_etapa_agendamento) {
    e.push({ id: "agendamento", n: 6, nome: "Consulta agendada", valor: null, unidade: "leads com agendamento", estado: "parcial", explicacao: `O funil do ${crm} não tem etapa com “agendado”, “consulta” ou “confirmado” no nome, então o painel não sabe quem agendou.`, falta: { integracao: `Funil do ${crm}`, dado: "Uma etapa “Consulta agendada” (ou parecida) usada pela equipe", onde: "Comercial > Guia do CRM" } });
  } else if (f.tem_venda_registrada && agendadosSaoGanhos(d!.agendados, d!.vendas)) {
    e.push({ id: "agendamento", n: 6, nome: "Consulta agendada", valor: null, unidade: "leads com agendamento", estado: "parcial", explicacao: avisoAgendadosSaoGanhos(d!.agendados, d!.vendas) });
  } else {
    e.push({ id: "agendamento", n: 6, nome: "Consulta agendada", valor: d!.agendados, unidade: "cards com agendamento", estado: d!.agendados > 0 ? "medido" : "zero", explicacao: `Cards criados no período que hoje estão numa etapa de agendamento (ou compraram), pela situação de hoje no ${crm}. Não é a regra da tela Pacientes do período, que não respondeu agora.${d!.leads > 0 && d!.leads_com_etapa < d!.leads * 0.5 ? " Mais da metade dos leads está sem etapa reconhecida: o número pode estar baixo." : ""}` });
  }

  // 7. Venda
  if (!f?.tem_crm) {
    e.push({ id: "venda", n: 7, nome: "Venda", valor: null, unidade: "vendas", estado: "sem_integracao", explicacao: "Depende do CRM.", falta: { integracao: "CRM", dado: "Lead marcado como ganho, com valor", onde: "Admin > cliente > CRM" } });
  } else if (!f.tem_venda_registrada) {
    e.push({ id: "venda", n: 7, nome: "Venda", valor: null, unidade: "vendas", estado: "parcial", explicacao: `Nenhum lead foi marcado como ganho no ${crm} até hoje. A venda acontece, mas não é registrada.`, falta: { integracao: `Rotina no ${crm}`, dado: "Marcar o lead como ganho (com valor) quando o paciente fecha", onde: "Comercial > Guia do CRM" } });
  } else {
    e.push({ id: "venda", n: 7, nome: "Venda", valor: d!.vendas, unidade: "cards ganhos (criados no período)", estado: d!.vendas > 0 ? "medido" : "zero", explicacao: d!.vendas > 0 ? "Cards criados no período e marcados como ganho. Conta cards, não pessoas: a mesma pessoa pode ter mais de um orçamento ganho." : "Nenhum card do período foi marcado como ganho (ainda)." });
  }

  // Mesmos passos e critérios do diagnóstico comercial; sem diagnóstico, não afirmar venda.
  if (comercial !== undefined) {
    for (const [id, passoId] of [["agendamento", "agendaram"], ["venda", "compraram"]] as const) {
      const etapa = e.find((x) => x.id === id)!;
      if (!f?.tem_crm) continue;
      // Com Pacientes do período, o agendamento já segue a regra única (pessoas): o diagnóstico não substitui.
      if (id === "agendamento" && pn?.agendaram) continue;
      const passo = comercial?.passos.find((x) => x.id === passoId);
      etapa.valor = passo?.valor ?? null;
      etapa.estado = etapa.valor === null || passo?.estimado || !passo?.confiavel ? "parcial" : etapa.valor === 0 ? "zero" : "medido";
      etapa.explicacao = passo?.aviso ?? passo?.explica ?? "Diagnóstico comercial indisponível: não é possível confirmar esta etapa.";
      if (id === "venda") {
        etapa.unidade = "cards ganhos (criados no período)";
        if (etapa.valor != null) etapa.explicacao = `${etapa.explicacao} Conta cards, não pessoas: a mesma pessoa pode ter mais de um orçamento ganho.`;
      }
    }
  }
  // Etapas que contam outra população não viram %: as pessoas que agendaram incluem pacientes antigos (não saem das
  // pessoas novas), e a venda conta cards criados no período, não as pessoas que agendaram.
  if (pn?.agendaram) {
    const ag = e.find((x) => x.id === "agendamento")!;
    ag.semPassagem = "Agendaram inclui pacientes antigos, então não é uma parte das pessoas novas: sem % entre as duas.";
    const v = e.find((x) => x.id === "venda")!;
    v.semPassagem = "A venda conta cards criados no período e o agendamento conta pessoas: sem % entre as duas.";
  }

  // Taxas só entre etapas vizinhas medidas (o funil não é uma fila única: lead de formulário pula a conversa).
  // Com a etapa anterior abaixo do mínimo (30 leads, 20 agendamentos), fica "N de M", sem %.
  const etapas: EtapaFunil[] = e.map((x, i) => {
    const ant = i > 0 ? e[i - 1] : null;
    const ok = !x.semPassagem && ant && ant.valor != null && ant.valor > 0 && x.valor != null && ant.estado !== "sem_integracao" && x.estado !== "sem_integracao";
    if (!ok) return { ...x, taxa: null, fracao: null };
    const base = BASE_DA_ETAPA[ant!.id];
    if (!base) return { ...x, taxa: x.valor! / ant!.valor!, fracao: null };
    const p = passagem(x.valor, ant!.valor, base);
    return { ...x, taxa: p.taxa, fracao: p.fracao };
  });
  // Maior queda: só nas etapas do comercial (conversa→lead→agendamento→venda), onde a taxa tem leitura de negócio.
  const comerciais: IdEtapa[] = ["lead", "agendamento", "venda"];
  const quedas = etapas.filter((x) => comerciais.includes(x.id) && x.taxa != null && x.taxa < 1).sort((a, b) => a.taxa! - b.taxa!);
  const q = quedas[0];
  return {
    etapas,
    medidas: etapas.filter((x) => x.valor != null).length,
    maiorQueda: q ? { de: etapas[q.n - 2].id, para: q.id, taxa: q.taxa! } : null,
    receita: e.find((x) => x.id === "venda")?.valor == null ? 0 : d?.receita ?? 0,
  };
}
