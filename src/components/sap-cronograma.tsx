import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileSignature, PauseCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import {
  getAtrasosSap, getClinicaSap, getMarcosSap, marcarMarcoSap, salvarAtrasoSap, salvarContratoSap, salvarPausaSap,
  type SapCadastro,
} from "@/lib/sap-data";
import { cronogramaComDatas, diaDoPrograma, resumoPausas, somar, type ItemComData, type Pausa, type StatusItem } from "@/lib/sap-cronograma";
import { hojeBrasilia } from "@/lib/status-fonte";

const campo = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const dm = (iso: string | null) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "—");
const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const ESTILO: Record<StatusItem, { cor: string; rotulo: string }> = {
  feito: { cor: "var(--good)", rotulo: "Feito" },
  atrasado: { cor: "var(--crit)", rotulo: "Atrasado" },
  agora: { cor: "var(--accent)", rotulo: "Agora" },
  proximo: { cor: "var(--warn)", rotulo: "Próximos 7 dias" },
  futuro: { cor: "var(--muted)", rotulo: "Mais tarde" },
};
const CATEGORIAS: Record<string, string> = {
  acessos: "Acessos ou dados depois do D5",
  sessao: "Sessão desmarcada (<24 h) ou 2ª remarcação",
  aprovacao: "Aprovação de peça acima de 2 dias úteis",
  treino: "Recepção não liberada para treino",
  gravacao: "Gravação não feita na data",
  verba: "Verba não carregada na data de subida",
  outro: "Outro",
};

/** Cronograma Mestre 00.02 com datas reais, pausa de prazo, atrasos do cliente e situação do contrato. */
export function CronogramaSap({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const hoje = hojeBrasilia();
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  const marcosQ = useQuery({ queryKey: ["sap-marcos", clinica?.id], queryFn: () => getMarcosSap(clinica!.id), enabled: !!clinica });
  const atrasosQ = useQuery({ queryKey: ["sap-atrasos", clinica?.id], queryFn: () => getAtrasosSap(clinica!.id), enabled: !!clinica && isAdmin });
  const pausas = clinica?.pausas ?? [];

  const itens = useMemo(() => {
    if (!clinica?.d0) return [];
    const m = new Map((marcosQ.data ?? []).map((x) => [x.marco, { concluidoEm: x.concluido_em, evidencia: x.evidencia }]));
    return cronogramaComDatas(clinica.d0, pausas, hoje, m);
  }, [clinica, marcosQ.data, pausas, hoje]);

  if (cadQ.isLoading) return <p className="note">Carregando…</p>;
  if (!clinica) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  if (!clinica.d0) return <p className="note">Defina o D0 em Programa → Editar cadastro para ver o cronograma com datas.</p>;

  const r = resumoPausas(clinica.d0, pausas, atrasosQ.data ?? [], hoje);
  const dia = diaDoPrograma(clinica.d0, pausas, hoje);
  const atrasados = itens.filter((i) => i.status === "atrasado");
  const fases = [...new Set(itens.map((i) => i.fase + "|" + i.n))].reduce<string[]>((a, k) => {
    const f = k.split("|")[0];
    return a.includes(f) ? a : [...a, f];
  }, []);

  return (
    <div className="space-y-4">
      <Painel icone={CalendarClock} titulo="Cronograma Mestre D0 a D90 (00.02)" resumo={`Hoje é o D${dia} do programa · D60 ${dmy(r.d60)} · D90 ${dmy(r.d90)}`}
        ajuda={<>Dias corridos a partir do D0. A pausa formal de prazo empurra os itens que começam depois dela e o D90. A data útil só ajuda a marcar reunião; o prazo do contrato continua em dias corridos.</>}>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>Janela da garantia: <strong>{dm(r.janelaGarantia.de)} a {dm(r.janelaGarantia.ate)}</strong></span>
          <span>Feitos: <strong>{itens.filter((i) => i.status === "feito").length} de {itens.length}</strong></span>
          {atrasados.length > 0 && <span style={{ color: "var(--crit)" }}>{atrasados.length} atrasado(s)</span>}
          {r.diasPausados > 0 && <span>Pausa de prazo: <strong>{r.diasPausados} dia(s)</strong></span>}
        </div>
        {r.avisos.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm" style={{ color: "var(--warn)" }}>
            {r.avisos.map((a) => <li key={a}>{a}</li>)}
          </ul>
        )}
      </Painel>

      {fases.map((f) => (
        <section key={f}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>{f}</h3>
          <ol className="space-y-2">
            {itens.filter((i) => i.fase === f).map((i) => <LinhaItem key={i.n} i={i} clinicaId={clinica.id} podeEditar={isAdmin} hoje={hoje} />)}
          </ol>
        </section>
      ))}

      <ContratoSap clinica={clinica} podeEditar={isAdmin} d90={r.d90} />
      {isAdmin && <PausasEAtrasos clinica={clinica} pausas={pausas} atrasos={atrasosQ.data ?? []} hoje={hoje} />}
    </div>
  );
}

function LinhaItem({ i, clinicaId, podeEditar, hoje }: { i: ItemComData; clinicaId: string; podeEditar: boolean; hoje: string }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(i.concluidoEm ?? hoje);
  const [evid, setEvid] = useState(i.evidencia ?? "");
  const salvar = useMutation({
    mutationFn: (feito: boolean) => marcarMarcoSap(clinicaId, i.n, feito ? data : null, feito ? evid : ""),
    onSuccess: () => { setAberto(false); qc.invalidateQueries({ queryKey: ["sap-marcos", clinicaId] }); },
  });
  const e = ESTILO[i.status];
  const janela = i.ini === i.fim ? `D${i.ini}` : `D${i.ini}–D${i.fim}`;
  return (
    <li className="rounded-xl border p-3" style={{ borderColor: i.status === "atrasado" ? "color-mix(in srgb, var(--crit) 45%, var(--border))" : "var(--border)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>{i.n}.</span>
        <span className="font-semibold">{i.nome}</span>
        <span className="text-xs font-semibold" style={{ color: e.cor }}>{e.rotulo}</span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>· {i.tipo}{i.clinica ? " · clínica participa" : ""}</span>
      </div>
      <div className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
        {janela} · {i.ini === i.fim ? dm(i.dataIni) : `${dm(i.dataIni)} a ${dm(i.dataFim)}`}
        {i.tipo !== "Recorrente" && <> · alvo {dm(i.dataAlvo)}{i.dataUtil !== i.dataAlvo ? ` (útil: ${dm(i.dataUtil)})` : ""}</>} · {i.dono}
      </div>
      <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>Pronto quando: {i.pronto}</div>
      {i.concluidoEm && (
        <div className="mt-1 text-xs" style={{ color: "var(--good)" }}>
          Feito em {dmy(i.concluidoEm)}{i.evidencia ? <> · evidência: {/^https?:\/\//.test(i.evidencia) ? <a href={i.evidencia} target="_blank" rel="noreferrer" className="underline">abrir</a> : i.evidencia}</> : " · sem evidência"}
        </div>
      )}
      {podeEditar && !aberto && (
        <button type="button" onClick={() => setAberto(true)} className="mt-2 text-sm font-semibold underline" style={{ color: "var(--accent)" }}>
          {i.concluidoEm ? "Editar" : "Marcar como feito"}
        </button>
      )}
      {podeEditar && aberto && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs">Data<input type="date" value={data} onChange={(x) => setData(x.target.value)} className="mt-0.5 block min-h-[34px] rounded-md border px-2 text-sm" style={campo} /></label>
          <label className="min-w-[220px] flex-1 text-xs">Evidência (link do ClickUp, ata, print)<input value={evid} onChange={(x) => setEvid(x.target.value)} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <button type="button" disabled={salvar.isPending || !data} onClick={() => salvar.mutate(true)} className="min-h-[34px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>Salvar</button>
          {i.concluidoEm && <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate(false)} className="min-h-[34px] rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}>Desmarcar</button>}
          <button type="button" onClick={() => setAberto(false)} className="min-h-[34px] px-2 text-sm" style={{ color: "var(--text-dim)" }}>Cancelar</button>
          {salvar.isError && <span className="w-full text-xs" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</span>}
        </div>
      )}
    </li>
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
