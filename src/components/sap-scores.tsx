import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCheck, HeartPulse } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import { hojeBrasilia } from "@/lib/status-fonte";
import { diaAtual, getClinicaSap, getExecucaoSap, getPlanoSap, getSaudeSap, getTrackerAuto, salvarExecucaoSap, salvarSaudeSap } from "@/lib/sap-data";
import { lerTrackerAuto, montarKpisSap } from "@/lib/sap-auto";
import { kpisDaGarantia, somarDias } from "@/lib/sap-metas";
import {
  ACAO_COMPONENTE,
  acaoDaSituacao,
  calcularExecucao,
  FASES,
  ITENS_EXECUCAO,
  notaDaSemana,
  resumoSaude,
  ROTULO_COMPONENTE,
  semaforoKpis,
  STATUS_ITEM,
  statusEfetivo,
  type Componente,
  type CorSaude,
  type ItemRegistro,
  type SemanaSaude,
  type StatusItem,
} from "@/lib/sap-scores";

const pct = (v: number | null) => (v === null ? "·" : `${Math.round(v * 100)}%`);
const dm = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const campo = { borderColor: "var(--border)", background: "var(--surface-2, var(--surface))", color: "var(--text)" } as const;

const COR_STATUS: Record<StatusItem, string> = {
  Cumprido: "var(--good)",
  Parcial: "var(--warn)",
  "Não cumprido": "var(--crit)",
  Pendente: "var(--muted)",
  "Não se aplica": "var(--muted)",
};

export function corDaSaude(c: CorSaude | undefined | null): string {
  if (!c || c === "Sem dado") return "var(--muted)";
  if (c.startsWith("Vermelho")) return "var(--crit)";
  if (c.startsWith("Amarelo")) return "var(--warn)";
  return "var(--good)";
}

// ---------------------------------------------------------------- Score de Execução

export function ScoreExecucao({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  const itensQ = useQuery({ queryKey: ["sap-execucao", clinica?.id], queryFn: () => getExecucaoSap(clinica!.id), enabled: !!clinica });
  const [rascunho, setRascunho] = useState<Map<number, ItemRegistro> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const registros = itensQ.data ?? [];
  const atualMap = useMemo(() => new Map(registros.map((r) => [r.item, r])), [registros]);
  const dados = rascunho ?? atualMap;
  const dia = diaAtual(clinica?.d0 ?? null, clinica?.pausas);
  const res = useMemo(() => calcularExecucao([...dados.values()], dia), [dados, dia]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarExecucaoSap(
        clientId,
        ITENS_EXECUCAO.map((i) => dados.get(i.n) ?? { item: i.n, status: "Pendente" as StatusItem, data_cumpriu: null, evidencia: null, observacao: null }),
      ),
    onSuccess: () => {
      setRascunho(null);
      qc.invalidateQueries({ queryKey: ["sap-execucao"] });
      qc.invalidateQueries({ queryKey: ["sap-cadastro", clientId] });
      qc.invalidateQueries({ queryKey: ["sap-portfolio"] });
    },
    onError: (e) => setErro((e as Error).message),
  });

  if (!clinica) return null;
  const editando = rascunho !== null;
  const mudar = (n: number, patch: Partial<ItemRegistro>) => {
    const base = new Map(rascunho ?? atualMap);
    const atual = base.get(n) ?? { item: n, status: "Pendente" as StatusItem, data_cumpriu: null, evidencia: null, observacao: null };
    base.set(n, { ...atual, ...patch });
    setRascunho(base);
  };
  const corD90 = res.d90 === null ? "var(--muted)" : res.d90 >= 0.8 ? "var(--good)" : "var(--crit)";

  return (
    <Painel
      icone={ClipboardCheck}
      titulo="Score de Execução da clínica"
      resumo="20 itens que dependem da clínica (11.04). 80% ou mais no D90 é a condição A da garantia. Sem evidência, Cumprido e Parcial valem Não cumprido."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs" style={{ color: "var(--text-dim)" }}>Atual (itens já vencidos)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{pct(res.atual)}</div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: `color-mix(in srgb, ${corD90} 40%, var(--border))` }}>
          <div className="text-xs" style={{ color: "var(--text-dim)" }}>No D90 (pendente conta zero)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: corD90 }}>{pct(res.d90)}</div>
        </div>
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs" style={{ color: "var(--text-dim)" }}>Habilita a garantia?</div>
          <div className="mt-1 font-medium">{res.habilita}</div>
        </div>
      </div>
      {(res.semEvidencia > 0 || res.vencidosSemStatus > 0) && (
        <p className="mt-2 flex items-start gap-1.5 text-sm" style={{ color: "var(--crit)" }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
          {[res.semEvidencia ? `${res.semEvidencia} item(ns) marcados como cumpridos sem evidência (contam zero)` : null, res.vencidosSemStatus ? `${res.vencidosSemStatus} item(ns) vencidos ainda sem status` : null].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="mt-4 space-y-4">
        {([1, 2, 3, 4] as const).map((f) => (
          <div key={f}>
            <h4 className="mb-1 text-sm font-semibold">
              Fase {f} · {FASES[f]}{" "}
              <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>{pct(res.porFase.find((x) => x.fase === f)?.pct ?? null)}</span>
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "2rem" }} />
                  <col />
                  <col style={{ width: "7.5rem" }} />
                  <col style={{ width: "12rem" }} />
                  <col style={{ width: "15rem" }} />
                </colgroup>
                <tbody>
                  {ITENS_EXECUCAO.filter((i) => i.fase === f).map((i) => {
                    const r = dados.get(i.n);
                    const bruto = r?.status ?? "Pendente";
                    const efetivo = statusEfetivo(r);
                    const venceu = dia !== null && dia >= i.prazo;
                    return (
                      <tr key={i.n} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                        <td className="w-8 py-2 pr-2 text-xs tabular-nums" style={{ color: "var(--muted)" }}>{i.n}</td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">{i.item}</div>
                          <div className="text-xs" style={{ color: "var(--muted)" }}>
                            {i.categoria} · peso {i.peso} · comprovar: {i.comprovar}
                          </div>
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-xs tabular-nums" style={{ color: venceu && bruto === "Pendente" ? "var(--crit)" : "var(--text-dim)" }}>
                          D{i.prazo}
                          {clinica.d0 ? ` · ${dm(somarDias(clinica.d0, i.prazo))}` : ""}
                        </td>
                        <td className="py-2 pr-3">
                          {editando ? (
                            <select aria-label={`Status do item ${i.n}`} value={bruto} onChange={(e) => mudar(i.n, { status: e.target.value as StatusItem })} className="min-h-[34px] rounded-md border px-2 text-sm" style={campo}>
                              {STATUS_ITEM.map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          ) : (
                            <Selo cor={COR_STATUS[efetivo]}>{bruto !== efetivo ? `${bruto} → sem evidência` : bruto}</Selo>
                          )}
                        </td>
                        <td className="py-2">
                          {editando ? (
                            <input aria-label={`Evidência do item ${i.n}`} value={r?.evidencia ?? ""} onChange={(e) => mudar(i.n, { evidencia: e.target.value })} placeholder="Link do ClickUp, print, ata" className="min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} />
                          ) : r?.evidencia ? (
                            /^https?:\/\//.test(r.evidencia) ? (
                              <a href={r.evidencia} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--accent)" }}>evidência</a>
                            ) : (
                              <span className="text-xs" style={{ color: "var(--text-dim)" }}>{r.evidencia}</span>
                            )
                          ) : null}
                          {r?.observacao && !editando && <div className="text-xs" style={{ color: "var(--muted)" }}>{r.observacao}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {editando ? (
            <>
              <button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending} className="min-h-[40px] rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
                {salvar.isPending ? "Salvando…" : "Salvar Score de Execução"}
              </button>
              <button type="button" onClick={() => setRascunho(null)} className="min-h-[40px] rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setRascunho(new Map(atualMap))} className="min-h-[40px] rounded-lg border px-3 text-sm font-medium" style={{ borderColor: "var(--border)" }}>
              Atualizar itens
            </button>
          )}
          {erro && <span className="text-sm" style={{ color: "var(--crit)" }}>{erro}</span>}
        </div>
      )}
    </Painel>
  );
}

// ---------------------------------------------------------------- Score de Saúde semanal (só equipe)

const vazia = (semana: number): SemanaSaude => ({
  semana,
  tarefas_no_prazo: null,
  sessoes_marcadas: null,
  sessoes_com_decisor: null,
  call_grupo: null,
  decisor_respondeu: null,
  tempo_resposta_h: null,
  kpis_verde: null,
  kpis_vermelho: null,
  sentimento: null,
  o_que_aconteceu: null,
});

export function ScoreSaude({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const hoje = hojeBrasilia();
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  const semQ = useQuery({ queryKey: ["sap-saude", clinica?.id], queryFn: () => getSaudeSap(clinica!.id), enabled: !!clinica && isAdmin });
  const planoQ = useQuery({ queryKey: ["sap-plano", clinica?.id], queryFn: () => getPlanoSap(clinica!.id), enabled: !!clinica && isAdmin });
  const j = { de: somarDias(hoje, -28), ate: somarDias(hoje, -1) };
  const atualQ = useQuery({ queryKey: ["sap-auto", clientId, j.de, j.ate], queryFn: () => getTrackerAuto(clientId, j.de, j.ate), enabled: !!clinica && isAdmin });
  const dia = diaAtual(clinica?.d0 ?? null, clinica?.pausas);
  const semanaAtual = dia === null ? 1 : Math.max(1, Math.floor(dia / 7) + 1);
  const [sel, setSel] = useState<number>(semanaAtual);
  const [f, setF] = useState<SemanaSaude>(vazia(semanaAtual));
  const [erro, setErro] = useState<string | null>(null);

  const semanas = semQ.data ?? [];
  // Abre na semana atual do programa assim que o D0 chega (o cadastro carrega depois do primeiro render).
  const [escolheu, setEscolheu] = useState(false);
  useEffect(() => {
    if (!escolheu) setSel(semanaAtual);
  }, [semanaAtual, escolheu]);
  useEffect(() => {
    setF(semanas.find((s) => s.semana === sel) ?? vazia(sel));
  }, [sel, semQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumo = useMemo(() => resumoSaude(semanas), [semanas]);
  const previa = notaDaSemana(f);
  const acao = acaoDaSituacao(resumo);
  const fracos = resumo.ultima ? (Object.entries(resumo.ultima.componentes) as [Componente, number | null][]).filter(([, v]) => v !== null && v < 5) : [];

  const salvar = useMutation({
    mutationFn: () => salvarSaudeSap(clientId, f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sap-saude"] });
      qc.invalidateQueries({ queryKey: ["sap-portfolio"] });
    },
    onError: (e) => setErro((e as Error).message),
  });

  function kpisDoPainel() {
    const atual = lerTrackerAuto(atualQ.data);
    const plano = planoQ.data ?? [];
    if (!atual || !clinica) return;
    const l = montarKpisSap(atual);
    const ids = kpisDaGarantia(clinica.consulta_paga !== false);
    const s = semaforoKpis(
      ids.map((id) => ({
        valor: l.kpis.find((k) => k.id === id)?.valor ?? null,
        baseline: plano.find((p) => p.kpi === id)?.baseline ?? null,
        meta: plano.find((p) => p.kpi === id)?.meta ?? null,
        menorMelhor: id === "resposta",
      })),
    );
    if (s) setF({ ...f, kpis_verde: s.verde, kpis_vermelho: s.vermelho });
    else setErro("Sem baseline dos KPIs da garantia: defina em Metas e garantia.");
  }

  if (!clinica || !isAdmin) return null;
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const corUlt = corDaSaude(resumo.ultima?.cor);

  return (
    <Painel icone={HeartPulse} titulo="Score de Saúde semanal (só a equipe vê)" resumo="Toda sexta, 15h. Nota de 0 a 10: verde 8 ou mais, amarelo 5 a 7,9, vermelho abaixo de 5. Pesos mudam da implantação (S1–S4) para a operação (S5–S13).">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3" style={{ borderColor: `color-mix(in srgb, ${corUlt} 40%, var(--border))` }}>
          <div className="text-xs" style={{ color: "var(--text-dim)" }}>Última semana{resumo.ultima ? ` (S${resumo.ultima.semana})` : ""}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: corUlt }}>
            {resumo.ultima?.nota === null || !resumo.ultima ? "·" : resumo.ultima.nota.toFixed(1).replace(".", ",")}
          </div>
          <div className="text-xs" style={{ color: corUlt }}>{resumo.ultima?.cor ?? "Sem dado"}</div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs" style={{ color: "var(--text-dim)" }}>Média das últimas 4</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{resumo.media4 === null ? "·" : resumo.media4.toFixed(1).replace(".", ",")}</div>
        </div>
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
          <div className="text-xs" style={{ color: "var(--text-dim)" }}>Sequência no fim</div>
          <div className="mt-1">
            {resumo.vermelhasSeguidas ? `${resumo.vermelhasSeguidas} vermelha(s) seguida(s)` : resumo.amarelasSeguidas ? `${resumo.amarelasSeguidas} amarela(s) seguida(s)` : "sem alerta"}
          </div>
        </div>
      </div>

      {acao && (
        <div className="mt-3 rounded-lg border p-3 text-sm" style={{ borderColor: `color-mix(in srgb, ${corUlt} 40%, var(--border))`, background: `color-mix(in srgb, ${corUlt} 7%, var(--surface))` }}>
          <div className="font-semibold">{acao.situacao}: {acao.significa.toLowerCase()}</div>
          <p className="mt-1">{acao.acao}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            Dono: {acao.dono} · Prazo: {acao.prazo} · Escala para: {acao.escala}
          </p>
          {fracos.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {fracos.map(([k, v]) => (
                <li key={k}>
                  <strong>{ROTULO_COMPONENTE[k]} ({(v ?? 0).toFixed(1).replace(".", ",")})</strong>: {ACAO_COMPONENTE[k].acao} <span style={{ color: "var(--text-dim)" }}>({ACAO_COMPONENTE[k].dono}, {ACAO_COMPONENTE[k].prazo.toLowerCase()})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Formulário da semana */}
      <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-sm font-semibold" htmlFor="semana-saude">Semana</label>
          <select id="semana-saude" value={sel} onChange={(e) => { setEscolheu(true); setSel(Number(e.target.value)); }} className="min-h-[34px] rounded-md border px-2 text-sm" style={campo}>
            {Array.from({ length: Math.max(13, semanaAtual) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                S{n}{n === semanaAtual ? " (atual)" : ""}{semanas.some((s) => s.semana === n) ? " ✓" : ""}
              </option>
            ))}
          </select>
          <span className="text-sm" style={{ color: corDaSaude(previa.cor) }}>
            Nota prevista: {previa.nota === null ? "·" : previa.nota.toFixed(1).replace(".", ",")} · {previa.cor}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Tarefas da clínica no prazo (%)">
            <input inputMode="decimal" value={f.tarefas_no_prazo === null ? "" : String(Math.round(f.tarefas_no_prazo * 100))} onChange={(e) => setF({ ...f, tarefas_no_prazo: num(e.target.value) === null ? null : Math.min(1, Math.max(0, num(e.target.value)! / 100)) })} className="min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} />
          </Campo>
          <Campo rotulo="Sessões e check-ins marcados">
            <input inputMode="numeric" value={f.sessoes_marcadas ?? ""} onChange={(e) => setF({ ...f, sessoes_marcadas: num(e.target.value) })} className="min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} />
          </Campo>
          <Campo rotulo="Com o decisor presente">
            <input inputMode="numeric" value={f.sessoes_com_decisor ?? ""} onChange={(e) => setF({ ...f, sessoes_com_decisor: num(e.target.value) })} className="min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} />
          </Campo>
          <Campo rotulo="Call em grupo">
            <select value={f.call_grupo ?? ""} onChange={(e) => setF({ ...f, call_grupo: (e.target.value || null) as SemanaSaude["call_grupo"] })} className="min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo}>
              <option value="">·</option>
              <option>Sim</option>
              <option>Não</option>
              <option>Sem call</option>
            </select>
          </Campo>
          <Campo rotulo="Decisor respondeu em até 1 dia útil">
            <select value={f.decisor_respondeu ?? ""} onChange={(e) => setF({ ...f, decisor_respondeu: (e.target.value || null) as SemanaSaude["decisor_respondeu"] })} className="min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo}>
              <option value="">·</option>
              <option>Sim</option>
              <option>Parcial</option>
              <option>Não</option>
            </select>
          </Campo>
          <Campo rotulo="Tempo médio da clínica para responder a DC (horas úteis)">
            <input inputMode="decimal" value={f.tempo_resposta_h ?? ""} onChange={(e) => setF({ ...f, tempo_resposta_h: num(e.target.value) })} className="min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} />
          </Campo>
          <Campo rotulo="KPIs da garantia: verdes / vermelhos">
            <div className="flex items-center gap-1.5">
              <input aria-label="KPIs verdes" inputMode="numeric" value={f.kpis_verde ?? ""} onChange={(e) => setF({ ...f, kpis_verde: num(e.target.value) })} className="min-h-[34px] w-14 rounded-md border px-2 text-sm" style={campo} />
              <span>/</span>
              <input aria-label="KPIs vermelhos" inputMode="numeric" value={f.kpis_vermelho ?? ""} onChange={(e) => setF({ ...f, kpis_vermelho: num(e.target.value) })} className="min-h-[34px] w-14 rounded-md border px-2 text-sm" style={campo} />
              <button type="button" onClick={kpisDoPainel} className="text-xs underline" style={{ color: "var(--accent)" }}>do painel</button>
            </div>
          </Campo>
          <Campo rotulo="Sentimento do Coordenador">
            <select value={f.sentimento ?? ""} onChange={(e) => setF({ ...f, sentimento: (e.target.value || null) as SemanaSaude["sentimento"] })} className="min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo}>
              <option value="">·</option>
              <option>Verde</option>
              <option>Amarelo</option>
              <option>Vermelho</option>
            </select>
          </Campo>
          <label className="text-xs sm:col-span-2 lg:col-span-4" style={{ color: "var(--text-dim)" }}>
            O que aconteceu (1 linha)
            <input value={f.o_que_aconteceu ?? ""} onChange={(e) => setF({ ...f, o_que_aconteceu: e.target.value })} className="mt-1 min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending} className="min-h-[40px] rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {salvar.isPending ? "Salvando…" : `Salvar S${sel}`}
          </button>
          {erro && <span className="text-sm" style={{ color: "var(--crit)" }}>{erro}</span>}
        </div>
      </div>

      {resumo.semanas.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--muted)" }}>
                <th className="py-2 pr-3 font-medium">Semana</th>
                {(Object.keys(ROTULO_COMPONENTE) as Componente[]).map((k) => (
                  <th key={k} className="py-2 pr-3 text-right font-medium">{ROTULO_COMPONENTE[k].split(" ")[0]}</th>
                ))}
                <th className="py-2 pr-3 text-right font-medium">Nota</th>
                <th className="py-2 font-medium">Cor</th>
              </tr>
            </thead>
            <tbody>
              {resumo.semanas.map((n) => (
                <tr key={n.semana} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-3">S{n.semana} <span className="text-xs" style={{ color: "var(--muted)" }}>{n.fase}</span></td>
                  {(Object.keys(ROTULO_COMPONENTE) as Componente[]).map((k) => (
                    <td key={k} className="py-1.5 pr-3 text-right tabular-nums">{n.componentes[k] === null ? "·" : n.componentes[k]!.toFixed(1).replace(".", ",")}</td>
                  ))}
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{n.nota === null ? "·" : n.nota.toFixed(1).replace(".", ",")}</td>
                  <td className="py-1.5" style={{ color: corDaSaude(n.cor) }}>{n.cor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Painel>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="text-xs" style={{ color: "var(--text-dim)" }}>
      {rotulo}
      <div className="mt-1">{children}</div>
    </label>
  );
}
