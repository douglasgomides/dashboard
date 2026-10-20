import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Minus } from "lucide-react";
import { Termo } from "@/components/sap-ajuda";
import { diaAtual, faseDoDia, getClinicaSap, getMarcosSap, getPlanoSap, getTrackerAuto } from "@/lib/sap-data";
import { cronogramaComDatas, somar } from "@/lib/sap-cronograma";
import { lerTrackerAuto, montarKpisSap } from "@/lib/sap-auto";
import { DadoIncompleto } from "@/components/sap-kpi";
import { KPIS_PLANO, baselineDoTracker, kpisDaGarantia, type KpiPlano } from "@/lib/sap-metas";
import { fmtKpi } from "@/lib/sap-documentos";
import { SESSOES, trilha } from "@/lib/sap-sessoes";
import { hojeBrasilia } from "@/lib/status-fonte";
import { AcompanhamentoServico } from "@/components/acompanhamento-servico";

const MENOR_MELHOR = new Set<KpiPlano>(["resposta", "custo_consulta"]);
const TERMO: Partial<Record<KpiPlano, string>> = { resposta: "Tempo de 1ª resposta", comparecimento: "Taxa de comparecimento", conversao: "Conversão da consulta", agendamento: "Taxa de agendamento" };
const dmy = (iso: string) => iso.split("-").reverse().join("/");

/** Visão da clínica em uma tela: em que dia estamos, os 3 números da garantia contra o ponto de partida e a próxima reunião. */
export function VisaoClinica({ clientId }: { clientId: string }) {
  const hoje = hojeBrasilia();
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const c = cadQ.data ?? null;
  const planoQ = useQuery({ queryKey: ["sap-plano", c?.id], queryFn: () => getPlanoSap(c!.id), enabled: !!c });
  const marcosQ = useQuery({ queryKey: ["sap-marcos", c?.id], queryFn: () => getMarcosSap(c!.id), enabled: !!c });
  const de = somar(hoje, -28);
  const ate = somar(hoje, -1);
  const autoQ = useQuery({ queryKey: ["sap-auto", clientId, de, ate], queryFn: () => getTrackerAuto(clientId, de, ate), enabled: !!c });

  const { atual, leitura } = useMemo(() => {
    const t = lerTrackerAuto(autoQ.data);
    return { atual: t ? baselineDoTracker(t, 28) : [], leitura: t ? montarKpisSap(t) : null };
  }, [autoQ.data]);
  const proxima = useMemo(() => {
    if (!c?.d0) return null;
    const feitos = new Map((marcosQ.data ?? []).map((m) => [m.marco, { concluidoEm: m.concluido_em, evidencia: m.evidencia }]));
    return trilha(SESSOES, cronogramaComDatas(c.d0, c.pausas ?? [], hoje, feitos), hoje).proxima;
  }, [c, marcosQ.data, hoje]);

  if (cadQ.isLoading) return <p className="note">Carregando…</p>;
  if (cadQ.isError) return <div role="alert" className="space-y-2"><p>Não foi possível consultar o programa da clínica.</p><button type="button" className="btn" onClick={() => void cadQ.refetch()}>Tentar novamente</button></div>;
  if (!c) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  const dia = diaAtual(c.d0, c.pausas);
  const pct = dia === null ? 0 : Math.max(0, Math.min(100, Math.round((dia / 90) * 100)));
  const kpis = kpisDaGarantia(c.consulta_paga !== false);
  const maxVolume = Math.max(1, ...(leitura?.funil.map(etapa => etapa.valor) ?? []));

  return (
    <section aria-label="Resumo do programa" className="sap-clinic-summary space-y-4">
      <header className="sap-results-heading"><div><p className="sap-eyebrow">Resultados da clínica</p><h2>Números das últimas 4 semanas</h2><p>{dmy(de)} a {dmy(ate)} · compare o resultado atual com o ponto de partida e a meta.</p></div><Link to="/sap/$clientId/leitura" params={{ clientId }} className="ws-action ws-action--secondary">Ver leitura da semana</Link></header>
      {(autoQ.isError || planoQ.isError) && <div role="alert" className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--warn)" }}><p>{autoQ.isError ? "Não foi possível carregar os números atuais." : "Os números atuais estão disponíveis, mas o ponto de partida não pôde ser consultado."}</p><button type="button" className="btn mt-2" onClick={() => { void autoQ.refetch(); void planoQ.refetch(); }}>Tentar novamente</button></div>}
      {!autoQ.isError && <div className="sap-clinic-kpis grid gap-3 sm:grid-cols-3" aria-busy={autoQ.isPending}>
        {kpis.map((k) => {
          const rot = KPIS_PLANO.find((x) => x.id === k)?.rotulo ?? k;
          const base = (planoQ.data ?? []).find((p) => p.kpi === k);
          const agora = atual.find((p) => p.kpi === k)?.baseline ?? null;
          const b = base?.baseline ?? null;
          const melhorou = b !== null && agora !== null ? (MENOR_MELHOR.has(k) ? agora < b : agora > b) : null;
          const igual = b !== null && agora !== null && Math.abs(agora - b) < 1e-9;
          const Icone = igual ? Minus : melhorou ? (MENOR_MELHOR.has(k) ? ArrowDownRight : ArrowUpRight) : MENOR_MELHOR.has(k) ? ArrowUpRight : ArrowDownRight;
          const cor = igual || melhorou === null ? "var(--text-dim)" : melhorou ? "var(--good)" : "var(--crit)";
          const inc = leitura?.kpis.find((x) => x.id === k)?.incompleto;
          const partida = planoQ.isError ? "indisponível" : b !== null ? fmtKpi(k, b) : inc ? "não medido (dado incompleto)" : "ainda não medido";
          return (
            <div key={k} className="sap-clinic-kpi rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>{TERMO[k] ? <Termo t={TERMO[k]!}>{rot}</Termo> : rot}</div>
              {inc ? <DadoIncompleto inc={inc} clientId={clientId} compacto /> : (
                <div className="sap-clinic-kpi-value mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums">{autoQ.isPending ? "Carregando…" : agora === null ? <span className="text-base font-normal" style={{ color: "var(--muted)" }}>sem dado no período</span> : fmtKpi(k, agora)}</span>
                  {melhorou !== null && <Icone size={18} aria-label={igual ? "igual" : melhorou ? "melhorou" : "piorou"} style={{ color: cor }} />}
                </div>
              )}
              <div className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                Últimas 4 semanas · <Termo t="Baseline">ponto de partida</Termo>: {partida}{base?.meta != null ? <> · <Termo t="Meta">meta</Termo>: {fmtKpi(k, base.meta)}</> : null}
              </div>
            </div>
          );
        })}
      </div>}

      {leitura && leitura.pendencias.length === 0 && leitura.funil.some(etapa => etapa.valor > 0) && (
        <section className="sap-clinic-funnel" aria-labelledby="sap-funnel-title">
          <div><p className="sap-eyebrow">Da procura à decisão</p><h2 id="sap-funnel-title">O caminho dos seus pacientes</h2><p>Volumes registrados nas últimas 4 semanas · etapas do CRM</p></div>
          <ol>{leitura.funil.map(etapa => <li key={etapa.id}><span>{etapa.id === "leads" ? "Interessados" : etapa.id === "compareceram" ? "Consultas realizadas" : etapa.rotulo}</span><strong>{etapa.valor.toLocaleString("pt-BR")}</strong><div aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, etapa.valor / maxVolume * 100))}%` }} /></div></li>)}</ol>
        </section>
      )}

      <AcompanhamentoServico clientId={clientId} produto="sap" />

      <div className="sap-clinic-phase rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {dia === null ? (
          <p className="text-sm">O programa ainda não tem data de início. A equipe Doctor Creator define o <Termo t="D0" /> no primeiro contato.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="sap-clinic-phase-label text-xs font-semibold uppercase tracking-wide" style={{ color: "#C49A5C" }}>{dia > 90 ? "Programa concluído" : dia < 0 ? "Começa em breve" : faseDoDia(dia)}</div>
                <div className="sap-clinic-phase-day mt-0.5 text-2xl font-semibold tabular-nums">{dia < 0 ? `Começa em ${-dia} dia(s)` : dia > 90 ? "Acompanhamento" : <>Dia {dia} <span className="text-base font-normal" style={{ color: "var(--text-dim)" }}>de 90</span></>}</div>
              </div>
              <div className="sap-clinic-phase-dates text-xs" style={{ color: "var(--text-dim)" }}>Início (<Termo t="D0" />): {dmy(c.d0!)} · fim (<Termo t="D90" />): {dmy(somar(c.d0!, 90))}</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }} role="progressbar" aria-valuemin={0} aria-valuemax={90} aria-valuenow={Math.max(0, Math.min(90, dia))} aria-label="Dias decorridos do programa">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#C49A5C" }} />
            </div>
          </>
        )}
        <div className="sap-phase-actions"><Link to="/sap/$clientId" params={{ clientId }} className="ws-action ws-action--primary">Ver minhas tarefas</Link><Link to="/sap/$clientId/cronograma" params={{ clientId }} className="ws-action ws-action--secondary">Consultar cronograma</Link></div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[240px] flex-1 items-start gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <CalendarDays size={20} aria-hidden style={{ color: "#C49A5C" }} />
          <div className="text-sm">
            <div className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>Próxima reunião</div>
            {proxima ? (
              <>
                <div className="font-semibold">{proxima.s.titulo}</div>
                <div className="text-xs" style={{ color: proxima.estado === "atrasada" ? "var(--crit)" : "var(--text-dim)" }}>
                  {proxima.data ? `Previsão: ${dmy(proxima.data)}` : "Data a combinar"}{proxima.diasAte !== null && proxima.diasAte >= 0 ? (proxima.diasAte === 0 ? " · hoje" : ` · em ${proxima.diasAte} dia(s)`) : proxima.estado === "atrasada" ? " · a remarcar com a equipe" : ""}
                </div>
              </>
            ) : <div className="font-semibold">{c.d0 ? "Todas as reuniões foram feitas" : "Definida após o início"}</div>}
          </div>
        </div>
        <Link to="/sap/$clientId/documentos" params={{ clientId }} search={{ doc: "plano" } as never} className="flex min-w-[200px] flex-1 items-center justify-between rounded-2xl border p-4 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          Plano de ação e relatório <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
