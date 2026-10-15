import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Flag, ShieldQuestion, Target, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import { fmtBRL } from "@/lib/format";
import { hojeBrasilia } from "@/lib/status-fonte";
import { dataDoDia, diaDoPrograma, type Pausa } from "@/lib/sap-cronograma";
import { getAuditoriasSap, getClinicaSap, getExecucaoSap, getPlanoSap, getTrackerAuto, MARCOS, salvarPlanoSap } from "@/lib/sap-data";
import { lerTrackerAuto, montarKpisSap } from "@/lib/sap-auto";
import {
  avaliarGarantia,
  baselineDoTracker,
  diasEntre,
  janelaBaseline,
  janelaGarantia,
  KPIS_PLANO,
  kpisDaGarantia,
  proporMeta,
  quinzenas,
  somarDias,
  type KpiPlano,
  type LinhaPlano,
  type ResultadoKpi,
} from "@/lib/sap-metas";

const dm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const unidade = (k: KpiPlano) => KPIS_PLANO.find((x) => x.id === k)!.unidade;

function fmtValor(k: KpiPlano, v: number | null): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "·";
  const u = unidade(k);
  if (u === "pct") return `${Math.round(v * 100)}%`;
  if (u === "brl") return fmtBRL(v);
  return v < 1 ? "< 1 min" : `${Math.round(v)} min`;
}
// Na edição, % aparece como número de 0 a 100.
const paraCampo = (k: KpiPlano, v: number | null) => (v === null ? "" : unidade(k) === "pct" ? String(Math.round(v * 1000) / 10) : String(Math.round(v * 100) / 100));
function doCampo(k: KpiPlano, s: string): number | null {
  const n = Number(s.replace(",", "."));
  if (s.trim() === "" || Number.isNaN(n)) return null;
  return unidade(k) === "pct" ? n / 100 : n;
}

const RES: Record<ResultadoKpi, { rotulo: string; cor: string; Icone: typeof CheckCircle2 }> = {
  melhorou: { rotulo: "Melhorou", cor: "var(--good)", Icone: CheckCircle2 },
  nao_melhorou: { rotulo: "Não melhorou", cor: "var(--crit)", Icone: XCircle },
  nao_avaliavel: { rotulo: "Não avaliável", cor: "var(--muted)", Icone: CircleDashed },
  sem_baseline: { rotulo: "Sem baseline", cor: "var(--warn)", Icone: ShieldQuestion },
};

/** Linha do tempo D0–D90 (tela Programa). */
export function LinhaDoTempoSap({ clientId }: { clientId: string }) {
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  if (!cadQ.data) return null;
  return <LinhaDoTempo d0={cadQ.data.d0} hoje={hojeBrasilia()} pausas={cadQ.data.pausas ?? []} />;
}

/** Baseline/metas e garantia da clínica do SAP (tela Metas e garantia). */
export function PlanoSap({ clientId }: { clientId: string }) {
  const hoje = hojeBrasilia();
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  const planoQ = useQuery({ queryKey: ["sap-plano", clinica?.id], queryFn: () => getPlanoSap(clinica!.id), enabled: !!clinica });
  const ultimas4 = { de: somarDias(hoje, -28), ate: somarDias(hoje, -1) };
  const atualQ = useQuery({ queryKey: ["sap-auto", clientId, ultimas4.de, ultimas4.ate], queryFn: () => getTrackerAuto(clientId, ultimas4.de, ultimas4.ate), enabled: !!clinica });
  const jg = clinica?.d0 ? janelaGarantia(clinica.d0, hoje, clinica.pausas ?? []) : null;
  const garQ = useQuery({ queryKey: ["sap-auto", clientId, jg?.de, jg?.ate], queryFn: () => getTrackerAuto(clientId, jg!.de, jg!.ate), enabled: !!jg });

  if (!clinica) return null;
  const plano = planoQ.data ?? [];
  const atual = lerTrackerAuto(atualQ.data);
  const garantiaBruto = lerTrackerAuto(garQ.data);

  return (
    <div className="space-y-4">
      <TabelaPlano clientId={clientId} clinica={clinica} plano={plano} atual={atual} carregando={planoQ.isLoading} hoje={hoje} />
      {clinica.d0 && jg && (
        <CardGarantia
          plano={plano}
          bruto={garantiaBruto}
          carregando={garQ.isLoading}
          janela={jg}
          consultaPaga={clinica.consulta_paga !== false}
          verbaEmDia={clinica.verba_em_dia !== false}
          score={clinica.score_execucao === null ? null : Number(clinica.score_execucao)}
        />
      )}
    </div>
  );
}

function LinhaDoTempo({ d0, hoje, pausas }: { d0: string | null; hoje: string; pausas: Pausa[] }) {
  if (!d0) {
    return (
      <Painel icone={Flag} titulo="Linha do tempo D0 a D90" resumo="Defina o D0 no cadastro para ver os marcos, as quinzenas e a janela da garantia.">
        <span />
      </Painel>
    );
  }
  const dia = diaDoPrograma(d0, pausas, hoje);
  const dataDe = (n: number) => dataDoDia(d0, pausas, n, hoje);
  const pos = (d: number) => `${Math.min(100, Math.max(0, (d / 90) * 100))}%`;
  const qs = quinzenas(d0);
  const concluido = dia > 90;
  return (
    <Painel icone={Flag} titulo={concluido ? "Programa concluído · acompanhamento" : "Linha do tempo D0 a D90"} resumo={`D0 ${dm(d0)} · D60 ${dm(dataDe(60))} · D90 ${dm(dataDe(90))}${pausas.length ? " (com pausa de prazo)" : ""}`}>
      {concluido && (
        <p className="mb-2 rounded-lg p-3 text-sm" style={{ background: "var(--accent-soft)" }}>
          Os 90 dias terminaram em {dm(dataDe(90))}. Agora é acompanhamento: as metas e a leitura da semana continuam, sempre comparando com o D0.
        </p>
      )}
      <div className="relative mx-2 mb-10 mt-8 h-2 rounded-full" style={{ background: "var(--surface-2, var(--border))" }}>
        {/* janela da garantia */}
        <div className="absolute top-0 h-2 rounded-full" style={{ left: pos(62), width: `${(27 / 90) * 100}%`, background: "color-mix(in srgb, var(--warn) 45%, transparent)" }} title="Janela da garantia (D62 a D89)" />
        {/* progresso */}
        <div className="absolute top-0 h-2 rounded-full" style={{ left: 0, width: pos(dia), background: "var(--accent)" }} />
        {MARCOS.map((m) => (
          <div key={m.n} className="absolute -top-1" style={{ left: pos(m.dia) }}>
            <div className="h-4 w-0.5 -translate-x-1/2" style={{ background: m.dia <= dia ? "var(--accent)" : "var(--muted)" }} title={`D${m.dia} · ${m.nome}`} />
          </div>
        ))}
        {dia >= 0 && dia <= 90 && (
          <div className="absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ left: pos(dia), background: "var(--accent)" }}>
            hoje · D{dia}
          </div>
        )}
        <div className="absolute top-4 text-[11px]" style={{ left: pos(62), color: "var(--warn)" }}>
          garantia D62–D89
        </div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {qs.map((q) => {
          const atual = hoje >= q.de && hoje <= q.ate;
          const passou = hoje > q.ate;
          return (
            <li key={q.id} className="rounded-lg border p-2.5 text-sm" style={{ borderColor: atual ? "var(--accent)" : "var(--border)", opacity: passou ? 0.65 : 1 }}>
              <div className="flex items-center justify-between gap-2">
                <strong>{q.id}</strong>
                <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                  {dm(q.de)} a {dm(q.ate)}
                </span>
              </div>
              {q.marco && <div className="text-xs" style={{ color: "var(--text-dim)" }}>{q.marco}</div>}
              {atual && <Selo cor="var(--accent)">quinzena atual</Selo>}
            </li>
          );
        })}
      </ol>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs" style={{ color: "var(--text-dim)" }}>Todos os marcos</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {MARCOS.map((m) => (
            <li key={m.n} style={{ color: m.dia < dia ? "var(--muted)" : "var(--text)" }}>
              <span className="tabular-nums">D{m.dia}</span> · {dm(dataDe(m.dia))} · {m.nome}
            </li>
          ))}
        </ul>
      </details>
    </Painel>
  );
}

type Cadastro = NonNullable<Awaited<ReturnType<typeof getClinicaSap>>>;

function TabelaPlano({ clientId, clinica, plano, atual, carregando, hoje }: { clientId: string; clinica: Cadastro; plano: LinhaPlano[]; atual: ReturnType<typeof lerTrackerAuto>; carregando: boolean; hoje: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Record<KpiPlano, { baseline: string; meta: string; garantia: boolean; origem: LinhaPlano["origem"]; amostra: number | null }> | null>(null);
  const [cond, setCond] = useState({ consultaPaga: true, verbaEmDia: true, score: "" });
  const execQ = useQuery({ queryKey: ["sap-execucao", clinica.id], queryFn: () => getExecucaoSap(clinica.id) });
  const temItensExecucao = (execQ.data ?? []).length > 0;
  // "Pensando" em cadência não está no CRM: vem da auditoria semanal de conversas (06.09).
  const audQ = useQuery({ queryKey: ["sap-auditoria", clinica.id], queryFn: () => getAuditoriasSap(clinica.id) });
  const pensandoAud = audQ.data?.find((a) => a.pensando_cadencia !== null)?.pensando_cadencia ?? null;
  const [janelaMedida, setJanelaMedida] = useState<{ de: string; ate: string } | null>(null);
  const [medindo, setMedindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const leituraAtual = useMemo(() => (atual ? montarKpisSap(atual) : null), [atual]);
  const valorAtual = (k: KpiPlano): number | null => {
    if (!leituraAtual || !atual) return null;
    if (k === "receita_mensal") return (atual.receita * 30) / 28;
    if (k === "pensando_cadencia") return pensandoAud === null ? null : Number(pensandoAud);
    return leituraAtual.kpis.find((x) => x.id === k)?.valor ?? null;
  };
  const linha = (k: KpiPlano) => plano.find((p) => p.kpi === k);

  function abrirEdicao() {
    const r = {} as NonNullable<typeof rascunho>;
    for (const k of KPIS_PLANO) {
      const l = linha(k.id);
      r[k.id] = { baseline: paraCampo(k.id, l?.baseline ?? null), meta: paraCampo(k.id, l?.meta ?? null), garantia: l?.conta_garantia ?? false, origem: l?.origem ?? null, amostra: l?.amostra ?? null };
    }
    setRascunho(r);
    setCond({ consultaPaga: clinica.consulta_paga !== false, verbaEmDia: clinica.verba_em_dia !== false, score: clinica.score_execucao === null ? "" : String(clinica.score_execucao) });
    setJanelaMedida(clinica.baseline_de && clinica.baseline_ate ? { de: clinica.baseline_de, ate: clinica.baseline_ate } : null);
    setEditando(true);
  }

  async function medirBaseline() {
    if (!rascunho) return;
    setMedindo(true);
    setErro(null);
    try {
      const j = janelaBaseline(clinica.d0, hoje);
      const bruto = lerTrackerAuto(await getTrackerAuto(clientId, j.de, j.ate));
      if (!bruto) throw new Error("sem dados do CRM");
      const medidas = baselineDoTracker(bruto, diasEntre(j.de, j.ate) + 1);
      const r = { ...rascunho };
      for (const m of medidas) if (m.baseline !== null) r[m.kpi] = { ...r[m.kpi], baseline: paraCampo(m.kpi, m.baseline), origem: m.origem, amostra: m.amostra };
      setRascunho(r);
      setJanelaMedida(j);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setMedindo(false);
    }
  }

  function proporMetas() {
    if (!rascunho) return;
    const r = { ...rascunho };
    for (const k of KPIS_PLANO) {
      const p = proporMeta(k.id, doCampo(k.id, r[k.id].baseline), cond.consultaPaga);
      r[k.id] = { ...r[k.id], meta: paraCampo(k.id, p.meta), garantia: p.conta_garantia };
    }
    setRascunho(r);
  }

  const salvar = useMutation({
    mutationFn: () =>
      salvarPlanoSap(
        clientId,
        KPIS_PLANO.map((k) => ({
          kpi: k.id,
          baseline: doCampo(k.id, rascunho![k.id].baseline),
          origem: rascunho![k.id].origem ?? (rascunho![k.id].baseline ? "estimado" : null),
          amostra: rascunho![k.id].amostra,
          meta: k.id === "receita_mensal" ? null : doCampo(k.id, rascunho![k.id].meta),
          conta_garantia: rascunho![k.id].garantia,
        })),
        { consultaPaga: cond.consultaPaga, verbaEmDia: cond.verbaEmDia, score: cond.score.trim() === "" ? null : Number(cond.score.replace(",", ".")), baselineDe: janelaMedida?.de ?? null, baselineAte: janelaMedida?.ate ?? null },
      ),
    onSuccess: () => {
      setEditando(false);
      qc.invalidateQueries({ queryKey: ["sap-plano"] });
      qc.invalidateQueries({ queryKey: ["sap-cadastro", clientId] });
    },
    onError: (e) => setErro((e as Error).message),
  });

  const principais = kpisDaGarantia(clinica.consulta_paga !== false);
  const semPlano = plano.length === 0;
  const campoCls = "min-h-[34px] w-24 rounded-md border px-2 text-right text-sm tabular-nums";
  const campoSty = { borderColor: "var(--border)", background: "var(--surface-2, var(--surface))", color: "var(--text)" } as const;

  return (
    <Painel
      icone={Target}
      titulo="Baseline D0 e metas D90"
      resumo={
        clinica.baseline_de && clinica.baseline_ate
          ? `Baseline medida de ${dm(clinica.baseline_de)} a ${dm(clinica.baseline_ate)}. "Agora" = últimas 4 semanas fechadas.`
          : "Regras do 03.07: 3 a 5 KPIs de processo e taxa, nunca de faturamento. \"Agora\" = últimas 4 semanas fechadas."
      }
    >
      {carregando ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>Carregando…</p>
      ) : (
        <>
          {semPlano && !editando && (
            <p className="mb-3 text-sm" style={{ color: "var(--text-dim)" }}>
              Ainda sem baseline e metas. {isAdmin ? "Clique em \"Definir baseline e metas\": o painel mede a baseline no CRM e propõe as metas pela regra do 03.07." : "A equipe Doctor Creator define na Sessão 2."}
            </p>
          )}
          {editando && rascunho && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={medirBaseline} disabled={medindo} className="min-h-[38px] rounded-lg border px-3 text-sm font-medium disabled:opacity-60" style={{ borderColor: "var(--border)" }}>
                {medindo ? "Medindo…" : (() => { const j = janelaBaseline(clinica.d0, hoje); return `Medir baseline no CRM (${dm(j.de)} a ${dm(j.ate)})`; })()}
              </button>
              <button type="button" onClick={proporMetas} className="min-h-[38px] rounded-lg border px-3 text-sm font-medium" style={{ borderColor: "var(--border)" }}>
                Propor metas (regra do 03.07)
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
                  <th className="py-2 pr-3 font-medium">KPI</th>
                  <th className="py-2 pr-3 text-right font-medium">Baseline D0</th>
                  <th className="py-2 pr-3 text-right font-medium">Meta D90</th>
                  <th className="py-2 pr-3 text-right font-medium">Agora</th>
                  <th className="py-2 pr-3 text-right font-medium">Desde o D0</th>
                  <th className="py-2 font-medium">Garantia</th>
                </tr>
              </thead>
              <tbody>
                {KPIS_PLANO.map((k) => {
                  const l = linha(k.id);
                  const agora = valorAtual(k.id);
                  const r = rascunho?.[k.id];
                  const nota = editando && r ? proporMeta(k.id, doCampo(k.id, r.baseline), cond.consultaPaga).nota : null;
                  const naMeta = l?.meta !== null && l?.meta !== undefined && agora !== null ? (unidade(k.id) === "min" || k.id === "custo_consulta" ? agora <= l.meta : agora >= l.meta) : null;
                  return (
                    <tr key={k.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{k.rotulo}</div>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>{k.definicao}</div>
                        {nota && <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-dim)" }}>{nota}</div>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {editando && r ? (
                          <input aria-label={`Baseline de ${k.rotulo}`} value={r.baseline} onChange={(e) => setRascunho({ ...rascunho!, [k.id]: { ...r, baseline: e.target.value, origem: "estimado" } })} className={campoCls} style={campoSty} placeholder={unidade(k.id) === "pct" ? "%" : unidade(k.id)} />
                        ) : (
                          <>
                            {fmtValor(k.id, l?.baseline ?? null)}
                            {l?.origem === "estimado" && <div className="text-[11px]" style={{ color: "var(--warn)" }}>(E) estimado</div>}
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {k.id === "receita_mensal" ? (
                          <span className="text-xs" style={{ color: "var(--muted)" }}>não é meta</span>
                        ) : editando && r ? (
                          <input aria-label={`Meta D90 de ${k.rotulo}`} value={r.meta} onChange={(e) => setRascunho({ ...rascunho!, [k.id]: { ...r, meta: e.target.value } })} className={campoCls} style={campoSty} placeholder={k.id === "custo_consulta" ? "D45" : ""} />
                        ) : k.id === "custo_consulta" && (l?.meta ?? null) === null ? (
                          <span className="text-xs" style={{ color: "var(--muted)" }}>a definir no D45</span>
                        ) : (
                          fmtValor(k.id, l?.meta ?? null)
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {k.id === "pensando_cadencia" && agora === null ? (
                          <span className="text-xs" style={{ color: "var(--muted)" }}>lance a auditoria da semana</span>
                        ) : (
                          <span style={{ color: naMeta === null ? "var(--text)" : naMeta ? "var(--good)" : "var(--crit)" }}>{fmtValor(k.id, agora)}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right text-xs tabular-nums">
                        <Evolucao k={k.id} base={l?.baseline ?? null} agora={agora} />
                      </td>
                      <td className="py-2">
                        {editando && r ? (
                          <input type="checkbox" aria-label={`${k.rotulo} conta para a garantia`} checked={r.garantia} disabled={!principais.includes(k.id)} onChange={(e) => setRascunho({ ...rascunho!, [k.id]: { ...r, garantia: e.target.checked } })} />
                        ) : l?.conta_garantia ? (
                          <Selo cor="var(--accent)">conta</Selo>
                        ) : principais.includes(k.id) && l ? (
                          <span className="text-xs" style={{ color: "var(--muted)" }}>fora (acordo)</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {editando && (
            <div className="mt-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={cond.consultaPaga} onChange={(e) => setCond({ ...cond, consultaPaga: e.target.checked })} className="mt-1" />
                <span>A clínica cobra consulta<br /><span className="text-xs" style={{ color: "var(--muted)" }}>Sem consulta paga, a garantia usa agendamento no lugar da conversão.</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={cond.verbaEmDia} onChange={(e) => setCond({ ...cond, verbaEmDia: e.target.checked })} className="mt-1" />
                <span>Verba combinada em dia<br /><span className="text-xs" style={{ color: "var(--muted)" }}>Com a verba reduzida, KPI sem amostra fica "não avaliável".</span></span>
              </label>
              <label className="text-sm">
                Score de Execução (%)
                <input inputMode="decimal" value={cond.score} disabled={temItensExecucao} onChange={(e) => setCond({ ...cond, score: e.target.value })} placeholder="Ex.: 85" className="mt-1 min-h-[34px] w-full rounded-md border px-2 text-sm disabled:opacity-70" style={campoSty} />
                <span className="text-xs" style={{ color: "var(--muted)" }}>{temItensExecucao ? "Calculado pelos 20 itens em Execução e saúde." : "Preencha os itens em Execução e saúde para calcular sozinho."}</span>
              </label>
            </div>
          )}

          {isAdmin && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {editando ? (
                <>
                  <button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending} className="min-h-[40px] rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
                    {salvar.isPending ? "Salvando…" : "Salvar baseline e metas"}
                  </button>
                  <button type="button" onClick={() => setEditando(false)} className="min-h-[40px] rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" onClick={abrirEdicao} className="min-h-[40px] rounded-lg border px-3 text-sm font-medium" style={{ borderColor: "var(--border)" }}>
                  {semPlano ? "Definir baseline e metas" : "Editar baseline e metas"}
                </button>
              )}
              {erro && <span className="text-sm" style={{ color: "var(--crit)" }}>{erro}</span>}
            </div>
          )}
        </>
      )}
    </Painel>
  );
}

function CardGarantia({
  plano,
  bruto,
  carregando,
  janela,
  consultaPaga,
  verbaEmDia,
  score,
}: {
  plano: LinhaPlano[];
  bruto: ReturnType<typeof lerTrackerAuto>;
  carregando: boolean;
  janela: { de: string; ate: string; previa: boolean };
  consultaPaga: boolean;
  verbaEmDia: boolean;
  score: number | null;
}) {
  const g = useMemo(() => (bruto ? avaliarGarantia({ plano, atual: bruto, consultaPaga, verbaEmDia, score }) : null), [bruto, plano, consultaPaga, verbaEmDia, score]);
  const cor = g?.aplica === true ? "var(--crit)" : g?.aplica === false ? "var(--good)" : "var(--warn)";
  return (
    <Painel
      icone={ShieldQuestion}
      titulo={janela.previa ? "Garantia · prévia" : "Garantia · resultado final (D62 a D89)"}
      resumo={`${janela.previa ? "Prévia com as últimas 4 semanas" : "Janela oficial D62 a D89"} (${dm(janela.de)} a ${dm(janela.ate)}). Regra do 01.02: Score de Execução ≥ 80% e 2 dos 3 KPIs principais sem melhora → +30 dias sem custo.`}
    >
      {carregando || !g ? (
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>{carregando ? "Calculando…" : "Sem dados do CRM na janela."}</p>
      ) : (
        <>
          <div className="mb-3 rounded-lg p-3 text-sm font-medium" style={{ background: `color-mix(in srgb, ${cor} 10%, var(--surface))`, border: `1px solid color-mix(in srgb, ${cor} 40%, var(--border))` }}>
            {g.texto}
          </div>
          <ul className="space-y-2">
            {g.kpis.map((k) => {
              const r = RES[k.resultado];
              const def = KPIS_PLANO.find((x) => x.id === k.kpi)!;
              const base = plano.find((p) => p.kpi === k.kpi)?.baseline ?? null;
              return (
                <li key={k.kpi} className="flex gap-2.5 text-sm">
                  <r.Icone size={17} className="mt-0.5 shrink-0" style={{ color: r.cor }} aria-hidden />
                  <div>
                    <span className="font-medium">{def.rotulo}</span>{" "}
                    <span className="text-xs font-semibold" style={{ color: r.cor }}>{r.rotulo}</span>
                    <div className="text-xs" style={{ color: "var(--text-dim)" }}>
                      Baseline {fmtValor(k.kpi, base)} → agora {fmtValor(k.kpi, k.atual)}. {k.motivo}
                    </div>
                  </div>
                </li>
              );
            })}
            {g.kpis.length === 0 && <li className="text-sm" style={{ color: "var(--text-dim)" }}>Nenhum KPI marcado para a garantia. Defina no plano acima.</li>}
          </ul>
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            Amostra mínima: 30 qualificados (agendamento), 20 agendamentos (comparecimento), 15 consultas (conversão). Não é devolução de dinheiro, não cobre verba nem promete faturamento.
          </p>
        </>
      )}
    </Painel>
  );
}

// Variação contra a baseline D0, na direção certa de cada KPI (tempo e custo: menor é melhor).
function Evolucao({ k, base, agora }: { k: KpiPlano; base: number | null; agora: number | null }) {
  if (base === null || agora === null) return <span style={{ color: "var(--muted)" }}>·</span>;
  const u = unidade(k);
  const menorMelhor = u === "min" || k === "custo_consulta";
  const melhor = menorMelhor ? agora < base : agora > base;
  const igual = Math.abs(agora - base) < (u === "pct" ? 0.005 : 0.5);
  const txt = u === "pct" ? `${agora - base >= 0 ? "+" : ""}${Math.round((agora - base) * 100)} p.p.` : base > 0 ? `${agora - base >= 0 ? "+" : ""}${Math.round(((agora - base) / base) * 100)}%` : "·";
  return <span style={{ color: igual ? "var(--muted)" : melhor ? "var(--good)" : "var(--crit)" }}>{txt}</span>;
}
