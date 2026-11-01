// Vendas do período numa régua só, para Resultado, Relatório (texto e PDF).
//
// Duas contas possíveis (RPC crm_vendas_periodo):
//   - vendas fechadas no período: evento "ganhou" com data no período (crm_lead_eventos.ocorreu_em);
//   - coorte: dos contatos que ENTRARAM no período, quantos hoje estão ganhos (cresce depois que o período acaba).
// A conta por evento vale quando o histórico de eventos cobre o período inteiro (eventos_desde <= início) ou quando
// todo ganho tem a data de fechamento informada pela própria fonte (Clint won_at, RD closed_at). Sem isso, a tela usa
// a coorte com o rótulo dela, em vez de chamar de "vendas do período".
//
// Venda conta PESSOAS (decisão do dono, 01/11/2026): o número principal é de pessoas que compraram; quem fechou dois
// orçamentos conta uma vez. Logo depois vêm, à parte, as pessoas que já eram pacientes ou já estavam no CRM antes do
// período, e o número de orçamentos (cards) ganhos como informação secundária.
// Coorte honesta (Dr. Sergio: "dos 19 contatos novos, 147 já viraram venda"): a taxa dos contatos novos usa só as
// pessoas novas (crm_pessoas_novas) que viraram venda, nunca mais que as pessoas novas. Se a conta não fechar (RPC
// antiga, ou número acima das pessoas novas), a frase não fala em "dos N".
//
// Ganho sem valor em etapa de agendamento, ou no funil de prospecção, não é venda: a RPC tira da conta e devolve à parte.
//
// Quando a fonte de vendas não informa resultado (card fechado na origem sem ganho nem perda) ou a planilha de
// vendas parou, zero venda não é "a equipe não marcou": o resultado de venda fica como não disponível.
//
// Lógica pura: testável com `npx tsx`.

export interface VendasPeriodoBanco {
  vendas_no_periodo: number;
  vendas_coorte: number;
  perdidos_coorte?: number;
  fechados_sem_resultado: number;
  ultima_venda: string | null;
  eventos_desde: string | null;
  planilha_ultimo: string | null;
  pessoas_novas: number;
  pessoas_novas_com_origem: number;
  por_origem: { origem: string; pessoas: number; vendas: number }[];
  // Campos de 20261102120000 (null quando a RPC ainda é a anterior).
  pessoas_no_periodo?: number | null;
  pessoas_no_periodo_ja_no_crm?: number | null;
  pessoas_coorte?: number | null;
  ganhos_total?: number | null;
  ganhos_com_data_da_fonte?: number | null;
  vendas_coorte_pessoas_novas?: number | null;
  vendas_coorte_ja_pacientes?: number | null;
  pessoas_coorte_ja_pacientes?: number | null;
  ganhos_agendamento_sem_valor?: number | null;
  ganhos_agendamento_sem_valor_coorte?: number | null;
  ganhos_prospeccao_sem_valor?: number | null;
}

export interface LeituraVendas {
  /** Número a mostrar (null quando o resultado de venda não está disponível). */
  numero: number | null;
  /** "evento" = fechadas no período; "coorte" = dos contatos que entraram no período. */
  base: "evento" | "coorte";
  /** Frase curta com o número e a régua, sem travessão. Vazia quando o resultado não está disponível. */
  frase: string;
  /** Rótulo curto do indicador (cartão, KPI do PDF). */
  rotulo: string;
  /** Preenchido quando o resultado de venda não está disponível: o porquê, em português simples. */
  indisponivel: string | null;
  /** Pessoas (do número principal) que já eram pacientes ou já estavam no CRM antes do período. Null quando não se sabe. */
  jaPacientes: number | null;
  /** Orçamentos (cards) ganhos que deram o número; informação secundária. Null quando não se sabe. */
  cardsGanhos: number | null;
  /** true quando o número principal conta pessoas (RPC de 20261102120000). */
  porPessoas: boolean;
  /** Aviso curto sobre a régua, para mostrar perto do número. Vazio quando não se aplica. */
  aviso: string;
}

export const AVISO_VENDA_POR_PESSOA = "Venda conta pessoas: quem fechou mais de um orçamento no período conta uma vez.";

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const opt = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export function normalizarVendas(raw: unknown): VendasPeriodoBanco | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    vendas_no_periodo: n(r.vendas_no_periodo),
    vendas_coorte: n(r.vendas_coorte),
    perdidos_coorte: n(r.perdidos_coorte),
    fechados_sem_resultado: n(r.fechados_sem_resultado),
    ultima_venda: typeof r.ultima_venda === "string" ? r.ultima_venda.slice(0, 10) : null,
    eventos_desde: typeof r.eventos_desde === "string" ? r.eventos_desde.slice(0, 10) : null,
    planilha_ultimo: typeof r.planilha_ultimo === "string" ? r.planilha_ultimo.slice(0, 10) : null,
    pessoas_novas: n(r.pessoas_novas),
    pessoas_novas_com_origem: n(r.pessoas_novas_com_origem),
    por_origem: Array.isArray(r.por_origem)
      ? (r.por_origem as Record<string, unknown>[]).map((o) => ({ origem: String(o.origem ?? "Não informado"), pessoas: n(o.pessoas), vendas: n(o.vendas) }))
      : [],
    pessoas_no_periodo: opt(r.pessoas_no_periodo),
    pessoas_no_periodo_ja_no_crm: opt(r.pessoas_no_periodo_ja_no_crm),
    pessoas_coorte: opt(r.pessoas_coorte),
    ganhos_total: opt(r.ganhos_total),
    ganhos_com_data_da_fonte: opt(r.ganhos_com_data_da_fonte),
    vendas_coorte_pessoas_novas: opt(r.vendas_coorte_pessoas_novas),
    vendas_coorte_ja_pacientes: opt(r.vendas_coorte_ja_pacientes),
    pessoas_coorte_ja_pacientes: opt(r.pessoas_coorte_ja_pacientes),
    ganhos_agendamento_sem_valor: opt(r.ganhos_agendamento_sem_valor),
    ganhos_agendamento_sem_valor_coorte: opt(r.ganhos_agendamento_sem_valor_coorte),
    ganhos_prospeccao_sem_valor: opt(r.ganhos_prospeccao_sem_valor),
  };
}

/** Todo ganho do cliente tem a data de fechamento informada pela fonte (Clint won_at, RD closed_at)? */
export function datasDaFonteCompletas(v: VendasPeriodoBanco | null): boolean {
  const total = v?.ganhos_total ?? null;
  const comData = v?.ganhos_com_data_da_fonte ?? null;
  return total != null && comData != null && total > 0 && comData === total;
}

/**
 * @param ganhosResumo ganhos de crm_leads_resumo_periodo (coorte), usado quando a RPC nova não respondeu.
 * @param vendas resposta de crm_vendas_periodo, ou null.
 * @param start início do período (AAAA-MM-DD).
 */
export function lerVendas(ganhosResumo: number, vendas: VendasPeriodoBanco | null, start: string): LeituraVendas {
  const porEvento = !!vendas && ((!!vendas.eventos_desde && vendas.eventos_desde <= start) || datasDaFonteCompletas(vendas));
  const base: LeituraVendas["base"] = porEvento ? "evento" : "coorte";
  const pessoas = vendas ? ((porEvento ? vendas.pessoas_no_periodo : vendas.pessoas_coorte) ?? null) : null;
  const porPessoas = pessoas != null;
  const cards = vendas ? (porEvento ? vendas.vendas_no_periodo : vendas.vendas_coorte) : null;
  const jaPacientes = vendas ? ((porEvento ? vendas.pessoas_no_periodo_ja_no_crm : vendas.pessoas_coorte_ja_pacientes) ?? null) : null;
  const novas = vendas?.pessoas_novas ?? 0;
  const novasCompraram = vendas?.vendas_coorte_pessoas_novas ?? null;
  // Sem os campos novos (RPC anterior), os cards; aí a frase da coorte não fala em "dos contatos" se passar das pessoas novas.
  const numero = vendas ? (pessoas ?? cards ?? 0) : ganhosResumo;

  // Zero venda com fonte que não informa resultado, ou com a planilha de vendas parada antes do período.
  let indisponivel: string | null = null;
  if (numero === 0 && vendas) {
    const motivos: string[] = [];
    if (vendas.fechados_sem_resultado > 0)
      motivos.push(`o CRM fechou ${int(vendas.fechados_sem_resultado)} ${vendas.fechados_sem_resultado === 1 ? "card" : "cards"} sem dizer se virou venda`);
    if (vendas.planilha_ultimo && vendas.planilha_ultimo < start) motivos.push(`a planilha de vendas não é atualizada desde ${dm(vendas.planilha_ultimo)}`);
    if (motivos.length) indisponivel = `Resultado de venda não disponível: ${motivos.join(" e ")}.`;
  }

  const rotulo = porPessoas
    ? base === "evento" ? "Pessoas que compraram no período" : "Pessoas que compraram (contatos do período)"
    : base === "evento" ? "Vendas fechadas no período" : "Vendas dos contatos do período";
  const pes = (x: number) => `${int(x)} ${x === 1 ? "pessoa" : "pessoas"}`;
  let frase = "";
  if (indisponivel == null) {
    if (porPessoas) {
      frase =
        numero === 0
          ? base === "evento" ? "ninguém comprou no período, segundo o CRM" : "ninguém com card criado no período comprou até agora"
          : base === "evento"
            ? `${pes(numero)} ${numero === 1 ? "comprou" : "compraram"} no período`
            : `${pes(numero)} com card criado no período já ${numero === 1 ? "comprou" : "compraram"}`;
      if (numero > 0 && jaPacientes != null && jaPacientes > 0)
        frase += `; ${int(jaPacientes)} ${jaPacientes === 1 ? "já era paciente ou já estava" : "já eram pacientes ou já estavam"} no CRM antes do período`;
      if (base === "coorte" && novasCompraram != null && novas > 0 && novasCompraram <= novas)
        frase += `; dos ${int(novas)} ${novas === 1 ? "contato novo" : "contatos novos"}, ${int(novasCompraram)} ${novasCompraram === 1 ? "virou venda" : "viraram venda"}`;
      if (cards != null && cards > 0 && cards !== numero)
        frase += `; ${int(cards)} ${cards === 1 ? "orçamento ganho" : "orçamentos ganhos"} no CRM`;
    } else if (base === "evento") {
      frase = numero === 0 ? "nenhuma venda registrada no CRM no período" : `${int(numero)} ${numero === 1 ? "venda fechada" : "vendas fechadas"} no período`;
    } else if (!vendas || numero <= novas) {
      frase =
        numero === 0
          ? "nenhum dos contatos que entraram no período está marcado como venda até agora"
          : `dos contatos que entraram no período, ${int(numero)} ${numero === 1 ? "já virou venda" : "já viraram venda"}`;
    } else {
      // Mais ganhos que pessoas novas: são cards (orçamentos), parte de quem já era paciente. Sem taxa sobre os novos.
      frase = `${int(numero)} ${numero === 1 ? "card criado" : "cards criados"} no período ${numero === 1 ? "está ganho" : "estão ganhos"}, incluindo quem já era paciente`;
    }
    const semValor = (porEvento ? vendas?.ganhos_agendamento_sem_valor : vendas?.ganhos_agendamento_sem_valor_coorte) ?? 0;
    if (semValor > 0)
      frase += `; ${int(semValor)} ${semValor === 1 ? "ganho sem valor em etapa de agendamento não conta" : "ganhos sem valor em etapa de agendamento não contam"} como venda`;
  }
  return {
    numero: indisponivel ? null : numero,
    base,
    frase,
    rotulo,
    indisponivel,
    jaPacientes,
    cardsGanhos: cards,
    porPessoas,
    aviso: porPessoas && indisponivel == null ? AVISO_VENDA_POR_PESSOA : "",
  };
}
