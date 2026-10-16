import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, ChevronRight, FileSignature, PauseCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import {
  getAtrasosSap, getClinicaSap, salvarAtrasoSap, salvarContratoSap, salvarPausaSap,
  type SapCadastro,
} from "@/lib/sap-data";
import { FASES, dataDoDia, diaDoPrograma, faseNoDia, resumoPausas, somar, type Pausa } from "@/lib/sap-cronograma";
import { AlertaPapeis, CardTarefa, LinhaContadores, useTarefas } from "@/components/sap-tarefas";
import { PAPEIS, ehDoPapel, type PapelId, type Tarefa } from "@/lib/sap-tarefas";
import { hojeBrasilia } from "@/lib/status-fonte";

const campo = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const dm = (iso: string | null) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "—");
const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const CATEGORIAS: Record<string, string> = {
  acessos: "Acessos ou dados depois do D5",
  sessao: "Sessão desmarcada (<24 h) ou 2ª remarcação",
  aprovacao: "Aprovação de peça acima de 2 dias úteis",
  treino: "Recepção não liberada para treino",
  gravacao: "Gravação não feita na data",
  verba: "Verba não carregada na data de subida",
  outro: "Outro",
};

/** Cronograma Mestre com datas reais: barra D0 → D90, fases (só a atual e a próxima abertas), faixa Contínuo,
 *  filtros por papel e "só atrasadas". As tarefas e os contadores saem da mesma lib de Minhas tarefas. */
export function CronogramaSap({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const hoje = hojeBrasilia();
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  const atrasosQ = useQuery({ queryKey: ["sap-atrasos", clinica?.id], queryFn: () => getAtrasosSap(clinica!.id), enabled: !!clinica && isAdmin });
  const { lista, isLoading } = useTarefas(clientId);
  const [papel, setPapel] = useState<PapelId | "todos">("todos");
  const [soAtrasadas, setSoAtrasadas] = useState(false);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const pausas = clinica?.pausas ?? [];

  if (cadQ.isLoading || isLoading) return <p className="note">Carregando…</p>;
  if (!clinica) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  if (!clinica.d0) return <p className="note">Defina o D0 em Painel da clínica → Editar cadastro para ver o cronograma com datas.</p>;
  const c = lista[0];
  const tarefas = c?.tarefas ?? [];
  const r = resumoPausas(clinica.d0, pausas, atrasosQ.data ?? [], hoje);
  const dia = diaDoPrograma(clinica.d0, pausas, hoje);
  const atual = faseNoDia(dia);
  const iAtual = FASES.findIndex((f) => f.nome === atual);
  const filtradas = tarefas.filter((t) => (papel === "todos" || ehDoPapel(t, papel)) && (!soAtrasadas || t.situacao === "atrasada"));
  const filtrando = papel !== "todos" || soAtrasadas;
  const fasesVis = [...FASES.map((f) => f.nome), "Contínuo"];

  return (
    <div className="space-y-4">
      <Painel icone={CalendarClock} titulo="Cronograma do programa" resumo={`Hoje é o D${dia} · fase ${atual ?? "—"} · D60 ${dmy(r.d60)} · D90 ${dmy(r.d90)}`}
        ajuda={<>Dias corridos a partir do D0. Cada item mostra uma data só: quando o dia cai em fim de semana ou feriado, vale o dia útil anterior. A pausa formal de prazo empurra os itens que começam depois dela e o D90.</>}>
        <BarraFases d0={clinica.d0} pausas={pausas} hoje={hoje} dia={dia} tarefas={tarefas} />
        <div className="mt-3"><LinhaContadores tarefas={tarefas} /></div>
        <div className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>Janela da garantia: <strong>{dm(r.janelaGarantia.de)} a {dm(r.janelaGarantia.ate)}</strong>{r.diasPausados > 0 ? ` · pausa de prazo: ${r.diasPausados} dia(s)` : ""}</div>
        {r.avisos.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm" style={{ color: "var(--warn)" }}>
            {r.avisos.map((a) => <li key={a}>{a}</li>)}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm"><span className="mr-2" style={{ color: "var(--text-dim)" }}>Papel</span>
            <select value={papel} onChange={(x) => setPapel(x.target.value as PapelId | "todos")} className="min-h-[38px] rounded-lg border px-2 text-sm" style={campo}>
              <option value="todos">Todos</option>
              {PAPEIS.filter((p) => p.execucao).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          <label className="inline-flex min-h-[38px] items-center gap-2 text-sm"><input type="checkbox" checked={soAtrasadas} onChange={(x) => setSoAtrasadas(x.target.checked)} /> Só atrasadas</label>
        </div>
      </Painel>

      {c && <AlertaPapeis entrada={c.entrada} clientId={clientId} />}

      {fasesVis.map((f, fi) => {
        const daFase = filtradas.filter((t) => t.fase === f);
        if (!daFase.length) return null;
        const todas = tarefas.filter((t) => t.fase === f);
        const pont = todas.filter((t) => t.status !== "nao_se_aplica");
        const feitas = pont.filter((t) => t.status === "auto" || t.status === "manual").length;
        const concluida = f !== "Contínuo" && pont.length > 0 && feitas === pont.length;
        const futura = f !== "Contínuo" && fi > iAtual + 1;
        const padraoAberta = filtrando || f === "Contínuo" || ((fi === iAtual || fi === iAtual + 1) && !concluida) || daFase.some((t) => t.situacao === "atrasada");
        const aberta = abertas[f] ?? padraoAberta;
        const cor = concluida ? "var(--good)" : futura ? "var(--muted)" : "var(--text)";
        return (
          <section key={f} className={f === "Contínuo" ? "rounded-xl border p-3" : undefined} style={f === "Contínuo" ? { borderColor: "var(--border)", background: "color-mix(in srgb, var(--accent) 4%, var(--surface))" } : undefined}>
            <button type="button" onClick={() => setAbertas({ ...abertas, [f]: !aberta })} aria-expanded={aberta}
              className="mb-2 flex w-full flex-wrap items-center gap-2 text-left text-sm font-semibold uppercase tracking-wide" style={{ color: cor }}>
              {aberta ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
              {concluida ? "✓ " : ""}{f === "Contínuo" ? "Contínuo (rotinas de toda semana)" : `${fi + 1}. ${f}`}
              <span className="text-xs font-normal normal-case tracking-normal" style={{ color: "var(--text-dim)" }}>
                {f === "Contínuo" ? `${todas.length} rotinas` : concluida ? `${feitas} de ${pont.length}` : futura ? `${todas.length} tarefa(s)` : `${feitas} de ${pont.length} feitas`}
                {f === atual ? " · fase atual" : ""}
              </span>
            </button>
            {aberta && (
              <ul className="space-y-2">
                {daFase.map((t) => <CardTarefa key={t.n} t={t} clientId={clientId} clinicaId={clinica.id} hoje={hoje} />)}
              </ul>
            )}
          </section>
        );
      })}
      {filtrando && !filtradas.length && <p className="text-sm" style={{ color: "var(--good)" }}>Nenhuma tarefa com esse filtro.</p>}

      <ContratoSap clinica={clinica} podeEditar={isAdmin} d90={r.d90} />
      {isAdmin && <PausasEAtrasos clinica={clinica} pausas={pausas} atrasos={atrasosQ.data ?? []} hoje={hoje} />}
    </div>
  );
}

/** Barra D0 → D90 com as fases, o marcador de hoje, o D60, a janela da garantia (D62–D89) e o D90. No celular, lista. */
function BarraFases({ d0, pausas, hoje, dia, tarefas }: { d0: string; pausas: Pausa[]; hoje: string; dia: number; tarefas: Tarefa[] }) {
  const fases = FASES.filter((f) => f.de < 91);
  const pct = (d: number) => `${(Math.min(Math.max(d, 0), 91) / 91) * 100}%`;
  const atual = faseNoDia(dia);
  const conta = (nome: string) => {
    const p = tarefas.filter((t) => t.fase === nome && t.status !== "nao_se_aplica");
    return { feitas: p.filter((t) => t.status === "auto" || t.status === "manual").length, total: p.length };
  };
  const data = (d: number) => dm(dataDoDia(d0, pausas, d, hoje));
  return (
    <>
      <div className="mt-3 hidden sm:block" aria-label="Linha do tempo do programa">
        <div className="relative h-9 overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
          {fases.map((f, i) => {
            const k = conta(f.nome);
            const feita = k.total > 0 && k.feitas === k.total;
            const passada = f.ate <= dia;
            return (
              <div key={f.nome} className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-r px-0.5 text-[10px] font-medium leading-tight"
                title={`${f.nome} · D${f.de}–D${f.ate - 1} · ${k.feitas} de ${k.total} feitas`}
                style={{ left: pct(f.de), width: `calc(${pct(f.ate)} - ${pct(f.de)})`, borderColor: "var(--border)",
                  background: f.nome === atual ? "color-mix(in srgb, var(--accent) 22%, var(--surface))" : feita ? "color-mix(in srgb, var(--good) 16%, var(--surface))" : passada ? "color-mix(in srgb, var(--crit) 10%, var(--surface))" : i % 2 ? "var(--surface)" : "color-mix(in srgb, var(--muted) 6%, var(--surface))" }}>
                <span className="truncate">{f.nome}</span>
              </div>
            );
          })}
          <div className="absolute inset-y-0 border-x-2 border-dashed" title="Janela da garantia (D62 a D89)" style={{ left: pct(62), width: `calc(${pct(90)} - ${pct(62)})`, borderColor: "var(--good)" }} />
          <div className="absolute inset-y-0 w-0.5" title={`Hoje · D${dia}`} style={{ left: pct(dia), background: "var(--crit)" }} />
        </div>
        <div className="relative mt-1 h-4 text-[10px]" style={{ color: "var(--text-dim)" }}>
          {[{ d: 0, t: "D0" }, { d: 60, t: "D60" }, { d: 62, t: "garantia" }, { d: 90, t: "D90" }].map((m) => (
            <span key={m.t} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(m.d) }}>{m.t}</span>
          ))}
          <span className="absolute -translate-x-1/2 whitespace-nowrap font-semibold" style={{ left: pct(dia), color: "var(--crit)", top: 12 }}>hoje</span>
        </div>
      </div>
      <ol className="mt-3 space-y-1 text-sm sm:hidden" aria-label="Linha do tempo do programa">
        {fases.map((f) => {
          const k = conta(f.nome);
          const feita = k.total > 0 && k.feitas === k.total;
          return (
            <li key={f.nome} className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1"
              style={{ background: f.nome === atual ? "color-mix(in srgb, var(--accent) 15%, var(--surface))" : undefined }}>
              <span>{feita ? "✓ " : ""}<strong>{f.nome}</strong>{f.nome === atual ? " · hoje" : ""}</span>
              <span className="text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>D{f.de} · {data(f.de)} · {k.feitas}/{k.total}</span>
            </li>
          );
        })}
        <li className="px-2 text-xs" style={{ color: "var(--text-dim)" }}>D60 {data(60)} · garantia D62–D89 ({data(62)} a {data(89)}) · D90 {data(90)}</li>
      </ol>
    </>
  );
}

const GARANTIA: Record<string, string> = { nao_avaliada: "Ainda não avaliada", aplicada: "Aplicada (+30 dias, D91 a D120)", nao_se_aplica: "Não se aplica" };
const POS: Record<string, string> = { manutencao: "Manutenção", encerrado: "Encerrado", cancelado: "Cancelado" };

function ContratoSap({ clinica, podeEditar, d90 }: { clinica: SapCadastro; podeEditar: boolean; d90: string }) {
  const qc = useQueryClient();
  const [ed, setEd] = useState<null | { aceiteEm: string; aceitePor: string; ajustes: string; garantiaStatus: string; garantiaInicio: string; posContrato: string }>(null);
  const salvar = useMutation({
    mutationFn: () => salvarContratoSap(clinica.id, {
      aceiteEm: ed!.aceiteEm || null, aceitePor: ed!.aceitePor, ajustes: ed!.ajustes,
      garantiaStatus: (ed!.garantiaStatus || null) as SapCadastro["garantia_status"], garantiaInicio: ed!.garantiaInicio || null,
      posContrato: (ed!.posContrato || null) as SapCadastro["pos_contrato"],
    }),
    onSuccess: () => { setEd(null); qc.invalidateQueries({ queryKey: ["sap-cadastro"] }); },
  });
  const fimGarantia = clinica.garantia_inicio ? somar(clinica.garantia_inicio, 29) : null;
  return (
    <Painel icone={FileSignature} titulo="Metas assinadas, garantia e pós-contrato" resumo="A prova do aceite (03.07) e o que aconteceu depois do D90 (01.02)"
      ajuda={<>As metas do D90 são assinadas pelo decisor na Sessão 2. A garantia é aplicada uma única vez por contrato: +30 dias de acompanhamento sem custo, do D91 ao D120.</>}>
      {!ed ? (
        <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          <div>Aceite das metas: <strong>{clinica.aceite_metas_em ? `${dmy(clinica.aceite_metas_em)}${clinica.aceite_metas_por ? ` por ${clinica.aceite_metas_por}` : ""}` : "não registrado"}</strong></div>
          <div>Garantia: <strong>{GARANTIA[clinica.garantia_status ?? "nao_avaliada"]}</strong>{clinica.garantia_status === "aplicada" && clinica.garantia_inicio ? ` · ${dm(clinica.garantia_inicio)} a ${dm(fimGarantia)}` : ""}</div>
          <div>Depois do D90 ({dmy(d90)}): <strong>{clinica.pos_contrato ? POS[clinica.pos_contrato] : "—"}</strong></div>
          {clinica.ajustes_acordados && <div className="sm:col-span-2">Ajustes acordados: {clinica.ajustes_acordados}</div>}
          {!clinica.aceite_metas_em && <div className="sm:col-span-2"><Selo cor="var(--warn)">Sem aceite registrado, a garantia não tem prova do que foi combinado</Selo></div>}
          {podeEditar && (
            <button type="button" className="mt-1 justify-self-start text-sm font-semibold underline" style={{ color: "var(--accent)" }}
              onClick={() => setEd({ aceiteEm: clinica.aceite_metas_em ?? "", aceitePor: clinica.aceite_metas_por ?? "", ajustes: clinica.ajustes_acordados ?? "", garantiaStatus: clinica.garantia_status ?? "", garantiaInicio: clinica.garantia_inicio ?? "", posContrato: clinica.pos_contrato ?? "" })}>
              Editar
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <label className="text-xs">Data do aceite das metas<input type="date" value={ed.aceiteEm} onChange={(x) => setEd({ ...ed, aceiteEm: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <label className="text-xs">Quem assinou (decisor)<input value={ed.aceitePor} onChange={(x) => setEd({ ...ed, aceitePor: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <label className="text-xs sm:col-span-2">Ajustes acordados<input value={ed.ajustes} onChange={(x) => setEd({ ...ed, ajustes: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <label className="text-xs">Garantia
            <select value={ed.garantiaStatus} onChange={(x) => setEd({ ...ed, garantiaStatus: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo}>
              <option value="">Ainda não avaliada</option><option value="aplicada">Aplicada</option><option value="nao_se_aplica">Não se aplica</option>
            </select>
          </label>
          <label className="text-xs">Início dos 30 dias extras<input type="date" value={ed.garantiaInicio} onChange={(x) => setEd({ ...ed, garantiaInicio: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <label className="text-xs">Depois do D90
            <select value={ed.posContrato} onChange={(x) => setEd({ ...ed, posContrato: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo}>
              <option value="">—</option><option value="manutencao">Manutenção</option><option value="encerrado">Encerrado</option><option value="cancelado">Cancelado</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate()} className="min-h-[34px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>Salvar</button>
            <button type="button" onClick={() => setEd(null)} className="min-h-[34px] px-2 text-sm" style={{ color: "var(--text-dim)" }}>Cancelar</button>
          </div>
          {salvar.isError && <span className="text-xs sm:col-span-2" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</span>}
        </div>
      )}
    </Painel>
  );
}

function PausasEAtrasos({ clinica, pausas, atrasos, hoje }: { clinica: SapCadastro; pausas: Pausa[]; atrasos: { id: string; data: string; dias_uteis: number; categoria: string; descricao: string | null }[]; hoje: string }) {
  const qc = useQueryClient();
  const [np, setNp] = useState({ tipo: "atraso_cliente" as Pausa["tipo"], inicio: hoje, fim: "", motivo: "" });
  const [na, setNa] = useState({ data: hoje, dias: "1", categoria: "acessos", descricao: "" });
  const ok = () => { qc.invalidateQueries({ queryKey: ["sap-cadastro"] }); qc.invalidateQueries({ queryKey: ["sap-atrasos", clinica.id] }); };
  const pausa = useMutation({ mutationFn: (v: { p: Parameters<typeof salvarPausaSap>[1]; remover?: boolean }) => salvarPausaSap(clinica.id, v.p, v.remover), onSuccess: ok });
  const atraso = useMutation({ mutationFn: (v: { a: Parameters<typeof salvarAtrasoSap>[1]; remover?: boolean }) => salvarAtrasoSap(clinica.id, v.a, v.remover), onSuccess: ok });
  const total = atrasos.reduce((a, x) => a + x.dias_uteis, 0);
  return (
    <Painel icone={PauseCircle} titulo="Atrasos do cliente e pausa de prazo (01.02 §5)" resumo={`Atrasos somados: ${total} dia(s) útil(eis). Até 5 não pausa; acima disso, pausa o que passar de 5.`}
      ajuda={<>Atraso da Doctor Creator não pausa o prazo. A pausa a pedido da clínica vale uma vez, até 15 dias corridos, com 5 dias úteis de aviso. Pausa máxima: 30 dias. Comunique por escrito no início e no fim da pausa.</>}>
      <h4 className="mt-2 text-sm font-semibold">Atrasos registrados</h4>
      {!atrasos.length ? <p className="note" style={{ margin: 0 }}>Nenhum atraso registrado.</p> : (
        <ul className="mt-1 space-y-1 text-sm">
          {atrasos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-2">
              <span className="tabular-nums">{dm(a.data)}</span> · <strong>{a.dias_uteis} dia(s) útil(eis)</strong> · {CATEGORIAS[a.categoria] ?? a.categoria}{a.descricao ? ` · ${a.descricao}` : ""}
              <button type="button" className="text-xs underline" style={{ color: "var(--text-dim)" }} onClick={() => atraso.mutate({ a: { id: a.id, data: a.data, dias: a.dias_uteis, categoria: a.categoria, descricao: a.descricao ?? "" }, remover: true })}>remover</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs">Data<input type="date" value={na.data} onChange={(x) => setNa({ ...na, data: x.target.value })} className="mt-0.5 block min-h-[34px] rounded-md border px-2 text-sm" style={campo} /></label>
        <label className="text-xs">Dias úteis<input inputMode="numeric" value={na.dias} onChange={(x) => setNa({ ...na, dias: x.target.value.replace(/\D/g, "") })} className="mt-0.5 block min-h-[34px] w-16 rounded-md border px-2 text-sm" style={campo} /></label>
        <label className="text-xs">O que atrasou
          <select value={na.categoria} onChange={(x) => setNa({ ...na, categoria: x.target.value })} className="mt-0.5 block min-h-[34px] rounded-md border px-2 text-sm" style={campo}>
            {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="min-w-[160px] flex-1 text-xs">Detalhe<input value={na.descricao} onChange={(x) => setNa({ ...na, descricao: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
        <button type="button" disabled={atraso.isPending || !Number(na.dias)} onClick={() => atraso.mutate({ a: { data: na.data, dias: Number(na.dias), categoria: na.categoria, descricao: na.descricao } })} className="min-h-[34px] rounded-lg border px-3 text-sm font-semibold disabled:opacity-60" style={{ borderColor: "var(--border)" }}>Registrar atraso</button>
      </div>

      <h4 className="mt-4 text-sm font-semibold">Pausas de prazo</h4>
      {!pausas.length ? <p className="note" style={{ margin: 0 }}>Nenhuma pausa. O prazo corre normalmente.</p> : (
        <ul className="mt-1 space-y-1 text-sm">
          {pausas.map((p) => (
            <li key={p.id ?? p.inicio} className="flex flex-wrap items-baseline gap-2">
              {p.tipo === "pedido_clinica" ? "A pedido da clínica" : "Atraso do cliente"} · {dm(p.inicio)} a {p.fim ? dm(p.fim) : <strong>em aberto</strong>}{p.motivo ? ` · ${p.motivo}` : ""}
              {!p.fim && p.id && <button type="button" className="text-xs underline" style={{ color: "var(--accent)" }} onClick={() => pausa.mutate({ p: { id: p.id, tipo: p.tipo, inicio: p.inicio, fim: hoje, motivo: p.motivo ?? "" } })}>encerrar hoje</button>}
              {p.id && <button type="button" className="text-xs underline" style={{ color: "var(--text-dim)" }} onClick={() => pausa.mutate({ p: { id: p.id, tipo: p.tipo, inicio: p.inicio, fim: p.fim, motivo: p.motivo ?? "" }, remover: true })}>remover</button>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs">Tipo
          <select value={np.tipo} onChange={(x) => setNp({ ...np, tipo: x.target.value as Pausa["tipo"] })} className="mt-0.5 block min-h-[34px] rounded-md border px-2 text-sm" style={campo}>
            <option value="atraso_cliente">Atraso do cliente</option><option value="pedido_clinica">A pedido da clínica</option>
          </select>
        </label>
        <label className="text-xs">Início<input type="date" value={np.inicio} onChange={(x) => setNp({ ...np, inicio: x.target.value })} className="mt-0.5 block min-h-[34px] rounded-md border px-2 text-sm" style={campo} /></label>
        <label className="text-xs">Fim (vazio = em aberto)<input type="date" value={np.fim} onChange={(x) => setNp({ ...np, fim: x.target.value })} className="mt-0.5 block min-h-[34px] rounded-md border px-2 text-sm" style={campo} /></label>
        <label className="min-w-[160px] flex-1 text-xs">Motivo<input value={np.motivo} onChange={(x) => setNp({ ...np, motivo: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
        <button type="button" disabled={pausa.isPending || !np.inicio || (!!np.fim && np.fim < np.inicio)} onClick={() => pausa.mutate({ p: { tipo: np.tipo, inicio: np.inicio, fim: np.fim || null, motivo: np.motivo } })} className="min-h-[34px] rounded-lg border px-3 text-sm font-semibold disabled:opacity-60" style={{ borderColor: "var(--border)" }}>Registrar pausa</button>
      </div>
      {(pausa.isError || atraso.isError) && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{((pausa.error ?? atraso.error) as Error).message}</p>}
    </Painel>
  );
}
