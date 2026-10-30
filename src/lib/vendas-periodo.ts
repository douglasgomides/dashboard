// Vendas do período numa régua só, para Resultado, Relatório (texto e PDF).
//
// Duas contas possíveis (RPC crm_vendas_periodo):
//   - vendas fechadas no período: evento "ganhou" com data no período (crm_lead_eventos.ocorreu_em);
//   - coorte: dos contatos que ENTRARAM no período, quantos hoje estão ganhos (cresce depois que o período acaba).
// A conta por evento só vale quando o histórico de eventos cobre o período inteiro (eventos_desde <= início).
// Sem isso, a tela usa a coorte com o rótulo dela, em vez de chamar de "vendas do período".
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
}

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

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
  };
}

/**
 * @param ganhosResumo ganhos de crm_leads_resumo_periodo (coorte), usado quando a RPC nova não respondeu.
 * @param vendas resposta de crm_vendas_periodo, ou null.
 * @param start início do período (AAAA-MM-DD).
 */
export function lerVendas(ganhosResumo: number, vendas: VendasPeriodoBanco | null, start: string): LeituraVendas {
  const porEvento = !!vendas?.eventos_desde && vendas.eventos_desde <= start;
  const numero = vendas ? (porEvento ? vendas.vendas_no_periodo : vendas.vendas_coorte) : ganhosResumo;
  const base: LeituraVendas["base"] = porEvento ? "evento" : "coorte";

  // Zero venda com fonte que não informa resultado, ou com a planilha de vendas parada antes do período.
  let indisponivel: string | null = null;
  if (numero === 0 && vendas) {
    const motivos: string[] = [];
    if (vendas.fechados_sem_resultado > 0)
      motivos.push(`o CRM fechou ${int(vendas.fechados_sem_resultado)} ${vendas.fechados_sem_resultado === 1 ? "card" : "cards"} sem dizer se virou venda`);
    if (vendas.planilha_ultimo && vendas.planilha_ultimo < start) motivos.push(`a planilha de vendas não é atualizada desde ${dm(vendas.planilha_ultimo)}`);
    if (motivos.length) indisponivel = `Resultado de venda não disponível: ${motivos.join(" e ")}.`;
  }

  const rotulo = base === "evento" ? "Vendas fechadas no período" : "Vendas dos contatos do período";
  let frase = "";
  if (indisponivel == null)
    frase =
      numero === 0
        ? base === "evento"
          ? "nenhuma venda registrada no CRM no período"
          : "nenhum dos contatos que entraram no período está marcado como venda até agora"
        : base === "evento"
          ? `${int(numero)} ${numero === 1 ? "venda fechada" : "vendas fechadas"} no período`
          : `dos contatos que entraram no período, ${int(numero)} ${numero === 1 ? "já virou venda" : "já viraram venda"}`;
  return { numero: indisponivel ? null : numero, base, frase, rotulo, indisponivel };
}
