import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleDashed, Coins, Info } from "lucide-react";
import { getRoiPeriodo } from "@/lib/client-data";
import { montarRoi, numerosDisponiveisRoi } from "@/lib/roi";
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
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  destaque?: string;
}) {
  const moeda = /^(-?R\$)\s*(.+)$/.exec(valor);
  return (
    <div
      className="ws-metric rounded-lg border p-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="text-xs font-medium" style={{ color: "var(--ink-2)" }}>
        {rotulo}
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
          {r.calculavel ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Numero rotulo="Investido em anúncios" valor={fmtBRL(r.investido)} />
              <Numero rotulo="Receita (vendas ganhas no CRM)" valor={fmtBRL(r.receita)} sub={`${r.ganhos} ${r.ganhos === 1 ? "venda" : "vendas"} no período`} />
              <Numero rotulo="ROI" valor={`${r.roi! >= 0 ? "+" : ""}${Math.round(r.roi! * 100).toLocaleString("pt-BR")}%`} sub={`cada R$ 1 investido voltou ${fmtBRL(r.retornoPorReal!)}`} destaque={r.roi! >= 0 ? "var(--good)" : "var(--crit)"} />
              <Numero rotulo="Custo por paciente" valor={fmtBRL(r.custoPorPaciente!)} sub="investido ÷ vendas ganhas" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Numero rotulo="Investido em anúncios" valor={numeros.investido === null ? "—" : fmtBRL(numeros.investido)} sub={numeros.investido === null ? "Conta de anúncios não conectada" : "No período selecionado"} />
              <Numero rotulo="Leads no CRM" valor={numeros.leads === null ? "—" : numeros.leads.toLocaleString("pt-BR")} sub={numeros.leads === null ? "Fonte da clínica não conferida" : "Novos contatos no período"} />
              <Numero rotulo="Vendas ganhas no CRM" valor={numeros.ganhos === null ? "—" : numeros.ganhos.toLocaleString("pt-BR")} sub={numeros.ganhos === null ? "Etapas ou fonte não conferidas" : "Fechamentos registrados no período"} />
              <Numero rotulo="ROI" valor="—" sub={r.motivoSemCalculo ?? "Faltam dados para calcular o retorno"} />
            </div>
          )}
          <details className="roi-details mt-3">
            <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold" style={{ color: "var(--accent)" }}>
              {pendentes.length ? `Conferir ${pendentes.length === 1 ? "1 pendência" : `${pendentes.length} pendências`} e o cálculo` : "Como calculamos estes números"}
            </summary>
            {!r.calculavel && <p className="mb-3 text-sm" style={{ color: "var(--ink-2)" }}>{r.motivoSemCalculo ?? "O retorno ainda não pode ser calculado. Os indicadores já medidos continuam disponíveis acima."}</p>}
            {pendentes.length > 0 && (
              <ul className="space-y-2" aria-label="O que falta para o retorno do investimento">
                {pendentes.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <CircleDashed size={18} aria-label="Pendente" className="mt-0.5 shrink-0" style={{ color: i.bloqueia ? "var(--warn)" : "var(--muted)" }} />
                    <div className="min-w-0 flex-1 text-sm">
                      <b>{i.preciso}</b>
                      <p style={{ color: "var(--ink-2)" }}>Para mostrar {i.paraMostrar}.</p>
                      {i.detalhe && <p className="text-xs" style={{ color: "var(--ink-2)" }}>{i.detalhe}</p>}
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
              Receita = soma do valor dos cards marcados como ganho no CRM, com data no período. ROI = (receita − investido) ÷ investido. Conta todas as vendas do período, não só as que vieram de anúncio{r.itens.find((x) => x.id === "origem")?.feito ? "" : ": para separar, falta a origem do lead"}.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
