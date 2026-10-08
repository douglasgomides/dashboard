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

export async function diagnosticarContaAnuncios(contaId: string, token: string): Promise<MotivoAnuncios | null> {
  const conta = contaId.startsWith("act_") ? contaId : `act_${contaId}`;

  const c = await g<{ account_status?: number; disable_reason?: number }>(conta, token, { fields: "account_status,disable_reason" });
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
