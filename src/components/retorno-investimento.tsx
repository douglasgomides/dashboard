import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleDashed, Coins, Info } from "lucide-react";
import { getRoiPeriodo } from "@/lib/client-data";
import { montarRoi } from "@/lib/roi";
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
  return (
    <div
      className="ws-metric rounded-lg border p-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="text-xs font-medium" style={{ color: "var(--ink-2)" }}>
        {rotulo}
      </div>
      <div
        className="ws-metric-value mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: destaque ?? "var(--ink)" }}
      >
        {valor}
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
        <p className="text-sm" style={{ color: "var(--crit)" }}>
          Não consegui calcular o retorno agora. Tente de novo em instantes.
        </p>
      )}

      {q.data &&
        (() => {
          const r = montarRoi(q.data);
          const pendentes = r.itens.filter((i) => !i.feito);
          return (
            <>
              {r.calculavel ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Numero
                    rotulo="Investido em anúncios"
                    valor={fmtBRL(r.investido)}
                  />
                  <Numero
                    rotulo="Receita (vendas ganhas no CRM)"
                    valor={fmtBRL(r.receita)}
                    sub={`${r.ganhos} ${r.ganhos === 1 ? "venda" : "vendas"} no período`}
                  />
                  <Numero
                    rotulo="ROI"
                    valor={`${r.roi! >= 0 ? "+" : ""}${Math.round(r.roi! * 100).toLocaleString("pt-BR")}%`}
                    sub={`cada R$ 1 investido voltou ${fmtBRL(r.retornoPorReal!)}`}
                    destaque={r.roi! >= 0 ? "var(--good)" : "var(--crit)"}
                  />
                  <Numero
                    rotulo="Custo por paciente"
                    valor={fmtBRL(r.custoPorPaciente!)}
                    sub="investido ÷ vendas ganhas"
                  />
                </div>
              ) : (
                <p className="mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
                  {r.motivoSemCalculo ??
                    `Ainda não dá para mostrar quanto voltou do que foi investido. ${pendentes.filter((i) => i.bloqueia).length === 1 ? "Falta 1 item" : `Faltam ${pendentes.filter((i) => i.bloqueia).length} itens`} para o cálculo:`}
                </p>
              )}

              {pendentes.length > 0 && (
                <ul
                  className="mt-3 space-y-2"
                  aria-label="O que falta para o retorno do investimento"
                >
                  {r.itens
                    .filter((i) => !r.calculavel || !i.feito)
                    .map((i) => (
                      <li
                        key={i.id}
                        className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border px-3 py-2"
                        style={{
                          borderColor: "var(--border)",
                          background: i.feito
                            ? "transparent"
                            : "var(--surface-2)",
                        }}
                      >
                        {i.feito ? (
                          <CheckCircle2
                            size={18}
                            aria-label="Feito"
                            className="mt-0.5 shrink-0"
                            style={{ color: "var(--good)" }}
                          />
                        ) : (
                          <CircleDashed
                            size={18}
                            aria-label="Pendente"
                            className="mt-0.5 shrink-0"
                            style={{
                              color: i.bloqueia
                                ? "var(--warn)"
                                : "var(--muted)",
                            }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm"
                            style={{ color: "var(--ink)" }}
                          >
                            Preciso de{" "}
                            <b>
                              {i.preciso.charAt(0).toLowerCase() +
                                i.preciso.slice(1)}
                            </b>{" "}
                            para mostrar <b>{i.paraMostrar}</b>.
                            <span
                              className="ml-2 text-xs font-semibold"
                              style={{
                                color: i.feito
                                  ? "var(--good)"
                                  : i.bloqueia
                                    ? "var(--warn)"
                                    : "var(--muted)",
                              }}
                            >
                              {i.feito ? "Feito" : "Pendente"}
                            </span>
                          </div>
                          {i.detalhe && (
                            <div
                              className="text-xs"
                              style={{ color: "var(--ink-2)" }}
                            >
                              {i.detalhe}
                            </div>
                          )}
                        </div>
                        {!i.feito &&
                          (i.link.soAdmin && !isAdmin ? (
                            <span
                              className="text-xs"
                              style={{ color: "var(--muted)" }}
                            >
                              A equipe Doctor Creator resolve
                            </span>
                          ) : (
                            <Link
                              to={i.link.to}
                              params={{ clientId }}
                              className="whitespace-nowrap text-sm font-semibold"
                              style={{ color: "var(--accent)" }}
                            >
                              {i.link.rotulo} →
                            </Link>
                          ))}
                      </li>
                    ))}
                </ul>
              )}

              <p
                className="mt-3 flex items-start gap-1.5 text-xs"
                style={{ color: "var(--muted)" }}
              >
                <Info size={13} aria-hidden className="mt-0.5 shrink-0" />
                Receita = soma do valor dos cards marcados como ganho no CRM,
                com data no período. ROI = (receita − investido) ÷ investido.
                Conta todas as vendas do período, não só as que vieram de
                anúncio
                {r.itens.find((x) => x.id === "origem")?.feito
                  ? ""
                  : ": para separar, falta a origem do lead"}
                .
              </p>
            </>
          );
        })()}
    </section>
  );
}
