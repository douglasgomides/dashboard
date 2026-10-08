/**
 * Por que a conta de anúncios não está gerando dado? Pergunta à própria Meta.
 *
 * Existe porque "Anúncios até 04/09" parece falha de sincronização quando quase
 * sempre é outra coisa: erro de pagamento, campanhas desativadas, conta em
 * análise, acesso revogado. Cada motivo vem com DE QUEM é a ação (cliente, Meta
 * ou nosso lado), para o painel não culpar o sync por algo que ele não controla.
 *
 * Só leitura (account_status e effective_status das campanhas). Nunca derruba o sync.
 */
const API = "https://graph.facebook.com/v21.0";

export type DonoMotivo = "cliente" | "meta" | "nos";
export type MotivoAnuncios = { texto: string; dono: DonoMotivo };

type Resp<T> = { ok: true; corpo: T } | { ok: false; status: number; codigo?: number; msg: string };

async function g<T>(caminho: string, token: string, params: Record<string, string>): Promise<Resp<T>> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  try {
    const r = await fetch(`${API}/${caminho}?${qs}`, { signal: AbortSignal.timeout(15_000) });
    const t = await r.text();
    let j: any = null;
    try {
      j = JSON.parse(t);
    } catch {
      /* corpo não-JSON */
    }
    if (!r.ok) return { ok: false, status: r.status, codigo: j?.error?.code, msg: String(j?.error?.message ?? t).slice(0, 200) };
    return { ok: true, corpo: j as T };
  } catch (e) {
    return { ok: false, status: 0, msg: e instanceof Error ? e.message : String(e) };
  }
}

const ACAO_PAGAMENTO = "Atualizar o método de pagamento ou quitar o saldo em Faturamento, no Gerenciador de Anúncios.";

const PARECE_PAGAMENTO = /pagamento|payment|billing|fatura|cobran|cart[aã]o|saldo|funding/i;
const ERRO_TRANSITORIO_DA_META = /temporarily unavailable|"code":\s*(1|2)\b|respondeu 5\d\d|unknown error/i;

// erroInsights: texto do erro que o próprio sync recebeu ao pedir o gasto, se houve.
export async function diagnosticarContaAnuncios(contaId: string, token: string, erroInsights?: string): Promise<MotivoAnuncios | null> {
  const conta = contaId.startsWith("act_") ? contaId : `act_${contaId}`;

  const c = await g<{ account_status?: number; disable_reason?: number; funding_source?: string; funding_source_details?: { display_string?: string } }>(conta, token, {
    fields: "account_status,disable_reason,funding_source,funding_source_details{display_string}",
  });
  if (!c.ok) {
    // 190/200/10 e família: token vencido, revogado ou sem permissão — é acesso, não instabilidade.
    if (c.codigo === 190 || c.codigo === 200 || c.codigo === 10 || c.status === 401 || c.status === 403) {
      return { texto: "A Meta recusou o acesso do dashboard a esta conta de anúncios (autorização vencida ou revogada). O dono da conta precisa autorizar de novo.", dono: "cliente" };
    }
    if (c.status >= 500 || c.codigo === 1 || c.codigo === 2) {
      return { texto: "A Meta está instável e não respondeu sobre esta conta. Tentamos de novo na próxima atualização.", dono: "meta" };
    }
    return null;
  }

  switch (c.corpo.account_status) {
    case 3:
      return { texto: `Erro de pagamento na conta de anúncios: a Meta não conseguiu cobrar e pausou a entrega. ${ACAO_PAGAMENTO}`, dono: "cliente" };
    case 9:
      return { texto: `Conta de anúncios em período de carência por pagamento pendente. ${ACAO_PAGAMENTO}`, dono: "cliente" };
    case 2:
      return { texto: "Conta de anúncios desativada pela Meta. É preciso pedir a revisão no Gerenciador de Negócios.", dono: "cliente" };
    case 7:
      return { texto: "Conta de anúncios em análise de risco pela Meta. Os anúncios ficam parados até a análise terminar.", dono: "meta" };
    case 8:
      return { texto: "Pagamento da conta de anúncios em processamento pela Meta.", dono: "meta" };
    case 100:
    case 101:
      return { texto: "Conta de anúncios encerrada.", dono: "cliente" };
    default:
      break;
  }

  // Conta ativa, mas a Meta falhou ao entregar o gasto: o problema é dela, não do cliente nem do sync.
  if (erroInsights && ERRO_TRANSITORIO_DA_META.test(erroInsights)) {
    return { texto: "A Meta não está entregando os dados de gasto desta conta (erro temporário dela, sem previsão de volta). A conta está ativa; nada a fazer do lado do cliente.", dono: "meta" };
  }

  // Conta ativa: o que dizem as campanhas?
  const camp = await g<{ data?: { effective_status?: string }[] }>(`${conta}/campaigns`, token, { fields: "effective_status", limit: "500" });
  if (!camp.ok) return null;
  const st = (camp.corpo.data ?? []).map((x) => x.effective_status ?? "");
  if (st.length === 0) return { texto: "A conta não tem nenhuma campanha cadastrada.", dono: "cliente" };
  if (st.includes("PENDING_BILLING_INFO")) {
    return { texto: `Campanhas paradas por falta de informação de pagamento. ${ACAO_PAGAMENTO}`, dono: "cliente" };
  }
  const ativas = st.filter((s) => s === "ACTIVE").length;
  if (ativas > 0) {
    // Sem nenhuma forma de pagamento ligada à conta, nada é entregue.
    if (c.corpo.funding_source === undefined && c.corpo.funding_source_details === undefined) {
      /* campo não veio (permissão): não conclui nada */
    } else if (!c.corpo.funding_source && !c.corpo.funding_source_details?.display_string) {
      return { texto: `A conta de anúncios está sem forma de pagamento cadastrada. ${ACAO_PAGAMENTO}`, dono: "cliente" };
    }
    // Problemas apontados pela Meta em campanhas e anúncios (além dos conjuntos): o erro de pagamento costuma aparecer aí.
    const [campIss, adIss] = await Promise.all([
      g<{ data?: { issues_info?: { error_summary?: string; error_message?: string }[] }[] }>(`${conta}/campaigns`, token, { fields: "issues_info", effective_status: JSON.stringify(["ACTIVE", "WITH_ISSUES"]), limit: "100" }),
      g<{ data?: { issues_info?: { error_summary?: string; error_message?: string }[] }[] }>(`${conta}/ads`, token, { fields: "issues_info", effective_status: JSON.stringify(["ACTIVE", "WITH_ISSUES"]), limit: "100" }),
    ]);
    const textos = [campIss, adIss].flatMap((x) => (x.ok ? (x.corpo.data ?? []) : [])).flatMap((a) => (a.issues_info ?? []).map((i) => (i.error_summary || i.error_message || "").trim())).filter(Boolean);
    if (textos.some((t) => PARECE_PAGAMENTO.test(t))) {
      return { texto: `${ativas} campanha${ativas === 1 ? "" : "s"} ligada${ativas === 1 ? "" : "s"}, mas a Meta parou a entrega por erro de pagamento. ${ACAO_PAGAMENTO}`, dono: "cliente" };
    }
    // Campanha ligada e sem entrega: a própria Meta diz o problema nos conjuntos de anúncios (issues_info).
    const conj = await g<{ data?: { issues_info?: { error_summary?: string; error_message?: string }[] }[] }>(`${conta}/adsets`, token, {
      fields: "effective_status,issues_info",
      effective_status: JSON.stringify(["ACTIVE", "WITH_ISSUES"]),
      limit: "100",
    });
    if (conj.ok) {
      const resumos = (conj.corpo.data ?? []).flatMap((a) => (a.issues_info ?? []).map((i) => (i.error_summary || i.error_message || "").trim())).filter(Boolean);
      if (resumos.some((t) => PARECE_PAGAMENTO.test(t))) {
        return { texto: `${ativas} campanha${ativas === 1 ? "" : "s"} ligada${ativas === 1 ? "" : "s"}, mas a Meta parou a entrega por erro de pagamento. ${ACAO_PAGAMENTO}`, dono: "cliente" };
      }
      if (resumos.length > 0 || textos.length > 0) {
        const unico = [...new Set([...resumos, ...textos])].slice(0, 2).join("; ").slice(0, 160);
        return { texto: `${ativas} campanha${ativas === 1 ? "" : "s"} ligada${ativas === 1 ? "" : "s"}, mas sem entrega. A Meta informa: ${unico}.`, dono: "cliente" };
      }
    }
    const comProblema = st.filter((s) => s === "DISAPPROVED" || s === "WITH_ISSUES").length;
    return {
      texto:
        `Há ${ativas} campanha${ativas === 1 ? "" : "s"} ligada${ativas === 1 ? "" : "s"}, mas sem entrega nos últimos dias.` +
        (comProblema > 0 ? ` ${comProblema} com anúncio reprovado ou com problema.` : " Vale conferir orçamento, público e aprovação dos anúncios."),
      dono: "cliente",
    };
  }
  if (st.some((s) => s === "DISAPPROVED" || s === "WITH_ISSUES")) {
    return { texto: "Anúncios reprovados ou com problema no Gerenciador de Anúncios, e nenhuma campanha ativa.", dono: "cliente" };
  }
  return { texto: "Todas as campanhas estão pausadas ou desativadas no Gerenciador de Anúncios. Não é falha de sincronização.", dono: "cliente" };
}
