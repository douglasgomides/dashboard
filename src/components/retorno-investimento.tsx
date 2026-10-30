import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed, Coins, Info } from "lucide-react";
import { getRoiPeriodo } from "@/lib/client-data";
import { montarRoi, numerosDisponiveisRoi, situacaoAnuncios, situacaoCrm, NOTA_DEFASAGEM } from "@/lib/roi";
import { SeloConfianca } from "@/components/selo-confianca";
import { InfoDica } from "@/components/visual";
import { fmtBRL } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import { formatRangeLabel } from "@/lib/date-range";

// Bloco "Retorno do investimento" no topo do Resultado: o número que o médico quer ver primeiro.
// Calcula quando há dado; senão mostra o checklist do que falta, com link para resolver.

function Numero({
  rotulo,
  valor,
  sub,
  destaque,
  dica,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  destaque?: string;
  /** Fórmula em português simples, no "i" ao lado do rótulo. */
  dica?: string;
}) {
  const moeda = /^(-?R\$)\s*(.+)$/.exec(valor);
  return (
    <div
      className="ws-metric rounded-lg border p-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-start gap-1 text-xs font-medium" style={{ color: "var(--ink-2)" }}>
        <span>{rotulo}</span>
        {dica && <InfoDica texto={dica} rotulo={`Como calculamos: ${rotulo}`} />}
      </div>
      <div
        className={`ws-metric-value mt-1 text-2xl font-semibold tabular-nums${moeda ? " ws-metric-value--currency" : ""}`}
        style={{ color: destaque ?? "var(--ink)" }}
      >
        {moeda ? <span className="ws-currency"><span>{moeda[1]}</span>{" "}<span>{moeda[2]}</span></span> : valor}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function RetornoInvestimento({
  clientId,
  start,
  end,
}: {
  clientId: string;
  start: string;
  end: string;
}) {
  const { isAdmin } = useAuth();
  const q = useQuery({
    queryKey: ["roi-periodo", clientId, start, end],
    queryFn: () => getRoiPeriodo(clientId, start, end),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const periodo = formatRangeLabel({ start, end });
  const r = q.data ? montarRoi(q.data) : null;
  const numeros = q.data ? numerosDisponiveisRoi(q.data) : null;
  const pendentes = r?.itens.filter((i) => !i.feito) ?? [];

  return (
    <section
      aria-labelledby="roi-titulo"
      className="ws-panel rounded-xl border p-4 sm:p-5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="roi-titulo"
          className="flex items-center gap-2 text-lg font-semibold"
          style={{ color: "var(--ink)" }}
        >
          <Coins size={20} aria-hidden style={{ color: "var(--accent)" }} />{" "}
          Retorno do investimento
        </h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {periodo}
        </span>
      </div>

      {q.isLoading && (
        <div
          className="h-24 animate-pulse rounded-lg"
          style={{ background: "var(--surface-2)" }}
          aria-busy="true"
        />
      )}
      {q.isError && (
        <div role="alert" className="space-y-2 text-sm">
          <p>Não foi possível consultar os números comerciais.</p>
          <button type="button" className="ws-action ws-action--secondary" disabled={q.isFetching} onClick={() => void q.refetch()}>Tentar novamente</button>
        </div>
      )}

      {!q.isPending && !q.isError && !r && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Os números comerciais ainda não estão disponíveis para esta clínica.</p>
      )}
      {r && numeros && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--ink-2)" }}>
            <span>Retorno:</span> <SeloConfianca selo={r.selo} />
            <span className="ml-2">Investimento separado por objetivo:</span> <SeloConfianca selo={r.seloInvestimento} />
          </div>
          {r.calculavel ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
              <Numero rotulo="Investimento em aquisição" valor={fmtBRL(r.investido)} sub="mensagens, leads e conversão" dica="Soma do gasto das campanhas de mensagem, lead ou conversão no período. É a base do retorno." />
              <Numero rotulo="Investimento em crescimento" valor={fmtBRL(r.investidoCrescimento)} sub="seguidores, engajamento e alcance" dica="Soma do gasto das campanhas de seguidores, engajamento, alcance e visita ao perfil. Não entra no retorno, porque não busca venda direta." />
              <Numero rotulo="Receita (vendas ganhas no CRM)" valor={fmtBRL(r.receita)} sub={`${r.ganhos} ${r.ganhos === 1 ? "venda" : "vendas"} no período`} dica="Soma do valor dos cards marcados como ganho no CRM, criados no período. A data de fechamento não é usada porque o CRM costuma fechar cards em lote, na faxina do funil." />
              <Numero rotulo="ROI" valor={`${r.roi! >= 0 ? "+" : ""}${Math.round(r.roi! * 100).toLocaleString("pt-BR")}%`} sub={`cada R$ 1 em aquisição voltou ${fmtBRL(r.retornoPorReal!)}`} destaque={r.roi! >= 0 ? "var(--good)" : "var(--crit)"} dica="(receita menos investimento em aquisição) dividido pelo investimento em aquisição." />
              <Numero rotulo={r.rotuloCusto} valor={fmtBRL(r.custo!)} sub="aquisição ÷ vendas ganhas" dica={`Investimento em aquisição dividido pelo número de vendas ganhas no período.`} />
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm" style={{ color: "var(--ink-2)" }}>{r.motivoSemCalculo}</p>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Numero rotulo="Investimento em aquisição" valor={numeros.investido === null ? "sem dado" : fmtBRL(numeros.investido)} sub={situacaoAnuncios(q.data!)} dica="Soma do gasto das campanhas de mensagem, lead ou conversão no período." />
                <Numero rotulo="Investimento em crescimento" valor={numeros.investidoCrescimento === null ? "sem dado" : fmtBRL(numeros.investidoCrescimento)} sub={numeros.investidoCrescimento === null ? situacaoAnuncios(q.data!) : "seguidores, engajamento e alcance"} dica="Soma do gasto das campanhas de seguidores, engajamento, alcance e visita ao perfil." />
                <Numero rotulo="Leads no CRM" valor={numeros.leads === null ? "sem dado" : numeros.leads.toLocaleString("pt-BR")} sub={situacaoCrm(q.data!) ?? "Novos contatos no período"} />
                <Numero rotulo="Vendas ganhas no CRM" valor={numeros.ganhos === null ? "sem dado" : numeros.ganhos.toLocaleString("pt-BR")} sub={numeros.ganhos === null ? (situacaoCrm(q.data!) ?? "Etapa de venda não marcada no CRM") : situacaoCrm(q.data!) ?? "Fechamentos registrados no período"} />
              </div>
            </>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            <Info size={13} aria-hidden className="mt-0.5 shrink-0" />
            {NOTA_DEFASAGEM}
          </p>
          <details className="roi-details mt-3">
            <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold" style={{ color: "var(--accent)" }}>
              {pendentes.length ? `Conferir ${pendentes.length === 1 ? "1 pendência" : `${pendentes.length} pendências`} e o cálculo` : "Como calculamos estes números"}
            </summary>
            {pendentes.length > 0 && (
              <ul className="space-y-2" aria-label="O que falta para o retorno do investimento">
                {pendentes.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <CircleDashed size={18} aria-label="Pendente" className="mt-0.5 shrink-0" style={{ color: i.bloqueia ? "var(--warn)" : "var(--muted)" }} />
                    <div className="min-w-0 flex-1 text-sm">
                      <b>{i.preciso}</b>
                      <p style={{ color: "var(--ink-2)" }}>Para mostrar {i.paraMostrar}.</p>
                      {i.detalhe && <p className="text-xs" style={{ color: "var(--ink-2)" }}>{i.detalhe}</p>}
                      {i.passos.length > 0 && (
                        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs" style={{ color: "var(--ink-2)" }} aria-label={`Como corrigir: ${i.preciso}`}>
                          {i.passos.map((p) => <li key={p}>{p}</li>)}
                        </ol>
                      )}
                    </div>
                    {i.link.soAdmin && !isAdmin ? (
                      <span className="text-xs" style={{ color: "var(--muted)" }}>A equipe Doctor Creator resolve</span>
                    ) : (
                      <Link to={i.link.to} params={{ clientId }} search={{ preset: "personalizado", from: start, to: end }} className="inline-flex min-h-[44px] items-center text-sm font-semibold" style={{ color: "var(--accent)" }}>{i.link.rotulo} →</Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
              <Info size={13} aria-hidden className="mt-0.5 shrink-0" />
              Receita é a soma do valor dos cards marcados como ganho no CRM, com data no período. ROI é a receita menos o investimento em aquisição, dividido pelo investimento em aquisição. O investimento em crescimento fica de fora. Conta todas as vendas do período, não só as que vieram de anúncio.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
