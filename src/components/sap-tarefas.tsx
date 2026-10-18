import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Circle, CircleSlash, Cpu, ExternalLink, Paperclip, UserRoundCheck } from "lucide-react";
import { SapWeekOverview } from "@/components/sap-week-overview";
import { diaAtual } from "@/lib/sap-data";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import { TextoComCodigos } from "@/components/sap-docs";
import {
  enviarEvidenciaSap, getEntradasTarefas, getPessoasEquipe, linkEvidenciaSap, marcarTarefaSap, registrarDeteccaoSap, salvarPapelPessoa,
} from "@/lib/sap-data";
import {
  NOME_PAPEL, PAPEIS, SEM_EVIDENCIA, alertasFundador, contarTarefas, deteccoes, ehDoPapel, montarTarefas, papeisSemPessoa, porUrgencia, rotuloPrazo,
  type AlertaFundador, type EntradaTarefas, type PapelId, type Situacao, type Tarefa,
} from "@/lib/sap-tarefas";
import { REGRA_DIA_UTIL } from "@/lib/sap-cronograma";
import { hojeBrasilia } from "@/lib/status-fonte";

const campo = { borderColor: "var(--border)", background: "var(--surface)" } as const;
export const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

// ---------------------------------------------------------------- dados (um hook só para todas as telas)

export interface ClinicaTarefas { entrada: EntradaTarefas; tarefas: Tarefa[]; alertas: AlertaFundador[] }

function montar(entradas: Omit<EntradaTarefas, "hoje">[], hoje: string): ClinicaTarefas[] {
  return entradas.map((e0) => {
    const entrada = { ...e0, hoje };
    return { entrada, tarefas: montarTarefas(entrada), alertas: alertasFundador(entrada) };
  });
}

/** Tarefas de uma clínica (clientId) ou de todas as que o usuário vê. A equipe guarda a 1ª data de cada detecção. */
export function useTarefas(clientId?: string) {
  const { isAdmin } = useAuth();
  const hoje = hojeBrasilia();
  const q = useQuery({ queryKey: ["sap-tarefas", clientId ?? "todas", isAdmin], queryFn: () => getEntradasTarefas(clientId, isAdmin) });
  const lista = useMemo(() => (q.data ? montar(q.data, hoje) : []), [q.data, hoje]);
  const gravado = useRef<string>("");
  useEffect(() => {
    if (!isAdmin || !lista.length) return;
    for (const c of lista) {
      const d = deteccoes(c.tarefas, c.entrada);
      const ja = new Map(c.entrada.status.map((s) => [s.marco, s.detectado_em]));
      const precisa = d.detectados.some((n) => !ja.get(n)) || d.avaliados.some((n) => !d.detectados.includes(n) && ja.get(n));
      const chave = `${c.entrada.clinica.id}:${d.detectados.join(",")}`;
      if (precisa && !gravado.current.includes(chave)) {
        gravado.current += `|${chave}`;
        registrarDeteccaoSap(c.entrada.clinica.id, d.detectados, d.avaliados).catch(() => undefined);
      }
    }
  }, [lista, isAdmin]);
  return { ...q, lista, hoje };
}

export const invalidarTarefas = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["sap-tarefas"] });
  qc.invalidateQueries({ queryKey: ["sap-marcos"] });
};

// ---------------------------------------------------------------- card

const STATUS: Record<Tarefa["status"], { rotulo: string; cor: string; I: typeof Circle }> = {
  a_fazer: { rotulo: "A fazer", cor: "var(--accent)", I: Circle },
  auto: { rotulo: "Feito automaticamente", cor: "var(--good)", I: Cpu },
  manual: { rotulo: "Feito", cor: "var(--good)", I: CheckCircle2 },
  nao_se_aplica: { rotulo: "Não se aplica", cor: "var(--muted)", I: CircleSlash },
};
const COR_SITUACAO: Record<Situacao, string> = { atrasada: "var(--crit)", hoje: "var(--warn)", semana: "var(--accent)", depois: "var(--muted)", feita: "var(--good)" };

function rotuloPrazoCard(t: Tarefa, hoje: string): string {
  if (t.status !== "a_fazer") return t.recorrente ? "feita esta semana" : `feita ${dm(t.feitoEm)}`;
  if (t.recorrente && t.situacao === "depois") return "fora da janela";
  return rotuloPrazo(t.prazo, hoje);
}

/** Card de tarefa: fechado numa linha; aberto vira o manual (por quê, como, onde, pronto quando, evidência). */
export function CardTarefa({ t, clientId, clinicaId, hoje, nomeClinica, abertoInicial = false }: {
  t: Tarefa; clientId: string; clinicaId: string; hoje: string; nomeClinica?: string; abertoInicial?: boolean;
}) {
  const { isAdmin } = useAuth();
  const [aberto, setAberto] = useState(abertoInicial);
  const st = STATUS[t.status];
  const papel = `${NOME_PAPEL[t.papel]}${t.pessoa ? ` · ${t.pessoa}` : " · sem pessoa"}`;
  return (
    <li className="sap-task-card rounded-xl border" data-situation={t.situacao} style={{ borderColor: t.situacao === "atrasada" ? "color-mix(in srgb, var(--crit) 45%, var(--border))" : "var(--border)", background: "var(--surface)" }}>
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto}
        className="sap-task-toggle flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left">
        {aberto ? <ChevronDown size={16} aria-hidden className="shrink-0" /> : <ChevronRight size={16} aria-hidden className="shrink-0" />}
        <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>{t.codigo}</span>
        <span className="min-w-0 flex-1 font-medium" style={{ overflowWrap: "anywhere" }}>{nomeClinica ? <span style={{ color: "var(--text-dim)" }}>{nomeClinica} · </span> : null}{t.nome}</span>
        <span className="text-xs font-semibold" style={{ color: COR_SITUACAO[t.situacao] }} title={t.prazo !== t.prazoCalendario ? REGRA_DIA_UTIL : undefined}>
          {rotuloPrazoCard(t, hoje)}{t.status === "a_fazer" && !(t.recorrente && t.situacao === "depois") ? ` · ${dm(t.prazo)}` : ""}
        </span>
        <span className="text-xs" style={{ color: t.pessoa ? "var(--text-dim)" : "var(--warn)" }}>{papel}</span>
        <Selo cor={st.cor}><st.I size={12} aria-hidden className="mr-0.5 inline" />{st.rotulo}</Selo>
      </button>
      {aberto && <CorpoTarefa t={t} clientId={clientId} clinicaId={clinicaId} hoje={hoje} podeEditar={isAdmin} />}
    </li>
  );
}

function BotaoOnde({ t, clientId }: { t: Tarefa; clientId: string }) {
  const o = t.manual.onde;
  const cls = "inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white";
  if (o.doc) return <a href={o.doc} target="_blank" rel="noreferrer" className={cls} style={{ background: "var(--accent)" }}>{o.rotulo} <ExternalLink size={14} aria-hidden /></a>;
  if (o.hub) return <Link to="/admin/$clientId" params={{ clientId }} className={cls} style={{ background: "var(--accent)" }}>{o.rotulo} →</Link>;
  const tela = o.tela === "/tarefas" || !o.tela ? "" : o.tela;
  return (
    <Link to={`/sap/$clientId${tela}` as never} params={{ clientId } as never} search={(o.busca ?? undefined) as never} className={cls} style={{ background: "var(--accent)" }}>
      {o.rotulo} →
    </Link>
  );
}

function LinkEvidencia({ valor }: { valor: string }) {
  const [erro, setErro] = useState(false);
  if (!valor.startsWith("arquivo:") && !/^https?:\/\//.test(valor)) return <span>{valor}</span>;
  return (
    <button type="button" className="underline" onClick={async () => {
      const url = await linkEvidenciaSap(valor);
      if (url) window.open(url, "_blank", "noopener"); else setErro(true);
    }}>{valor.startsWith("arquivo:") ? "Abrir anexo" : "Abrir evidência"}{erro ? " (acesso indisponível)" : ""}</button>
  );
}

function CorpoTarefa({ t, clientId, clinicaId, hoje, podeEditar }: { t: Tarefa; clientId: string; clinicaId: string; hoje: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [evid, setEvid] = useState("");
  const [data, setData] = useState(hoje);
  const [motivo, setMotivo] = useState("");
  const [modo, setModo] = useState<null | "desfazer" | "nao_se_aplica">(null);
  const [enviando, setEnviando] = useState(false);
  const semEvid = SEM_EVIDENCIA.has(t.n) || !!t.manual.semEvidencia;
  const acao = useMutation({
    mutationFn: (a: "feito" | "nao_se_aplica" | "desfazer") => marcarTarefaSap(clinicaId, t.n, a, { data, evidencia: evid, motivo, semana: t.recorrente ? t.semana : null }),
    onSuccess: () => { setModo(null); setMotivo(""); setEvid(""); invalidarTarefas(qc); },
  });
  const subsAbertas = t.subtarefas.filter((s) => !s.feito);
  return (
    <div className="space-y-3 border-t px-3 pb-3 pt-2 text-sm" style={{ borderColor: "var(--border)" }}>
      <div><strong>Objetivo da entrega: </strong><span style={{ color: "var(--text-dim)" }}><TextoComCodigos texto={t.manual.porque} /></span></div>
      <div>
        <strong>Como fazer:</strong>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5" style={{ color: "var(--text-dim)" }}>{t.manual.como.map((p) => <li key={p}><TextoComCodigos texto={p} /></li>)}</ol>
      </div>
      <div className="flex flex-wrap items-center gap-2"><strong>Onde fazer:</strong> <BotaoOnde t={t} clientId={clientId} /></div>
      <div><strong>Critério de conclusão: </strong><span style={{ color: "var(--text-dim)" }}><TextoComCodigos texto={t.item.pronto} /></span></div>
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        Janela {t.janela} · prazo {dm(t.prazo)}{t.prazo !== t.prazoCalendario ? <> (o dia {dm(t.prazoCalendario)} não é útil: <span title={REGRA_DIA_UTIL} className="underline decoration-dotted">regra</span>)</> : null} · {t.item.tipo}{t.item.clinica ? " · a clínica participa" : ""}
      </div>

      {t.subtarefas.length > 0 && (
        <div>
          <strong>Subtarefas ({t.subtarefas.filter((s) => s.feito).length} de {t.subtarefas.length})</strong>
          <ul className="mt-1 space-y-1">
            {[...subsAbertas, ...t.subtarefas.filter((s) => s.feito)].map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
                {s.feito ? <CheckCircle2 size={14} aria-label="feito" style={{ color: "var(--good)" }} /> : <Circle size={14} aria-label="a fazer" style={{ color: s.prazo && s.prazo < hoje ? "var(--crit)" : "var(--muted)" }} />}
                <span style={{ color: s.feito ? "var(--muted)" : undefined }}>{s.nome}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {NOME_PAPEL[s.papel]}{s.prazo && !s.feito ? ` · ${rotuloPrazo(s.prazo, hoje)}` : ""}{s.detalhe ? ` · ${s.detalhe}` : ""}
                </span>
                {!s.feito && s.tela !== undefined && (
                  s.tela === "" && podeEditar
                    ? <Link to="/admin/$clientId" params={{ clientId }} className="text-xs font-semibold underline" style={{ color: "var(--accent)" }}>resolver</Link>
                    : s.tela ? <Link to={`/sap/$clientId${s.tela}` as never} params={{ clientId } as never} className="text-xs font-semibold underline" style={{ color: "var(--accent)" }}>resolver</Link> : null
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {t.status === "auto" && (
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--good)" }}>
          <Cpu size={14} aria-hidden /> <strong>Conclusão identificada nos registros</strong> em {dm(t.feitoEm)}. A tarefa volta a ficar pendente se o registro que a comprova deixar de existir.
        </div>
      )}
      {(t.status === "manual" || t.status === "nao_se_aplica") && (
        <div className="text-xs" style={{ color: t.status === "manual" ? "var(--good)" : "var(--text-dim)" }}>
          <UserRoundCheck size={14} aria-hidden className="mr-1 inline" />
          {t.status === "manual" ? "Marcado como feito" : "Marcado como não se aplica"} {t.recorrente ? "nesta semana " : ""}em {dm(t.feitoEm)}{t.feitoPor ? ` por ${t.feitoPor}` : ""}
          {t.evidencia ? <> · evidência: <LinkEvidencia valor={t.evidencia} /></> : t.status === "manual" ? " · sem evidência" : ""}
          {t.observacao ? ` · ${t.observacao}` : ""}
        </div>
      )}
      {t.desfeito && t.status === "a_fazer" && (
        <div className="text-xs" style={{ color: "var(--warn)" }}>Desfeito em {dm(t.desfeito.em)}{t.desfeito.motivo ? `: ${t.desfeito.motivo}` : ""}.</div>
      )}

      {podeEditar && t.status === "a_fazer" && modo === null && (
        <div className="space-y-2 rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[200px] flex-1 text-xs">Evidência {semEvid ? "(opcional neste item)" : "(link, imagem ou PDF)"}
              <input value={evid} onChange={(x) => setEvid(x.target.value)} placeholder="Link do documento, material ou registro da entrega" className="mt-0.5 block min-h-[38px] w-full rounded-md border px-2 text-sm" style={campo} />
            </label>
            <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}>
              <Paperclip size={14} aria-hidden /> {enviando ? "Anexando…" : "Anexar evidência"}
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" disabled={enviando} onChange={async (x) => {
                const f = x.target.files?.[0];
                if (!f) return;
                setEnviando(true);
                try { setEvid(await enviarEvidenciaSap(clinicaId, t.n, f)); } catch (err) { alert((err as Error).message); } finally { setEnviando(false); }
              }} />
            </label>
            <label className="text-xs">Data de conclusão<input type="date" value={data} onChange={(x) => setData(x.target.value)} className="mt-0.5 block min-h-[38px] rounded-md border px-2 text-sm" style={campo} /></label>
          </div>
          {evid.startsWith("arquivo:") && <div className="text-xs" style={{ color: "var(--good)" }}>Evidência anexada. Confirme abaixo para concluir a tarefa.</div>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={acao.isPending || (!semEvid && !evid.trim())} onClick={() => acao.mutate("feito")}
              className="min-h-[38px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--good)" }}
              title={!semEvid && !evid.trim() ? "Adicione um link ou anexe uma evidência para concluir esta tarefa" : undefined}>
              Marcar como feito{t.recorrente ? " nesta semana" : ""}
            </button>
            {!t.recorrente && <button type="button" onClick={() => setModo("nao_se_aplica")} className="min-h-[38px] rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}>Não se aplica</button>}
          </div>
        </div>
      )}
      {podeEditar && (t.status === "manual" || t.status === "nao_se_aplica") && modo === null && (
        <button type="button" onClick={() => setModo("desfazer")} className="text-sm font-semibold underline" style={{ color: "var(--text-dim)" }}>Desfazer</button>
      )}
      {podeEditar && modo && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-xs">{modo === "desfazer" ? "Motivo para desfazer" : "Por que não se aplica nesta clínica"}
            <input value={motivo} onChange={(x) => setMotivo(x.target.value)} className="mt-0.5 block min-h-[38px] w-full rounded-md border px-2 text-sm" style={campo} />
          </label>
          <button type="button" disabled={acao.isPending || !motivo.trim()} onClick={() => acao.mutate(modo)} className="min-h-[38px] rounded-lg border px-3 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--border)" }}>Confirmar</button>
          <button type="button" onClick={() => setModo(null)} className="min-h-[38px] px-2 text-sm" style={{ color: "var(--text-dim)" }}>Cancelar</button>
        </div>
      )}
      {acao.isError && <p className="text-xs" style={{ color: "var(--crit)" }}>{(acao.error as Error).message}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- lista agrupada (Atrasadas, Hoje, Esta semana, Depois)

const GRUPOS: { id: Situacao; titulo: string; recolhido?: boolean }[] = [
  { id: "atrasada", titulo: "Atrasadas" },
  { id: "hoje", titulo: "Hoje" },
  { id: "semana", titulo: "Esta semana" },
  { id: "depois", titulo: "Próximas etapas", recolhido: true },
  { id: "feita", titulo: "Concluídas", recolhido: true },
];

export function ListaAgrupada({ itens, hoje, vazio, grupos = GRUPOS.map((g) => g.id) }: {
  itens: { t: Tarefa; clientId: string; clinicaId: string; nomeClinica?: string }[]; hoje: string; vazio: string; grupos?: Situacao[];
}) {
  const [abertos, setAbertos] = useState<Set<Situacao>>(new Set());
  const vis = GRUPOS.filter((g) => grupos.includes(g.id));
  if (!itens.some((i) => grupos.includes(i.t.situacao))) return <p className="text-sm" style={{ color: "var(--good)" }}>{vazio}</p>;
  return (
    <div className="space-y-4">
      {vis.map((g) => {
        const lista = itens.filter((i) => i.t.situacao === g.id).sort((a, b) => porUrgencia(a.t, b.t));
        if (!lista.length) return null;
        const recolhido = g.recolhido && !abertos.has(g.id);
        return (
          <section key={g.id}>
            <button type="button" onClick={() => { const n = new Set(abertos); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); setAbertos(n); }}
              disabled={!g.recolhido} aria-expanded={!recolhido}
              className="mb-2 flex items-center gap-1 text-sm font-semibold uppercase tracking-wide" style={{ color: COR_SITUACAO[g.id] }}>
              {g.recolhido ? (recolhido ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />) : null}
              {g.titulo} ({lista.length})
            </button>
            {!recolhido && (
              <ul className="space-y-2">
                {lista.map((i) => <CardTarefa key={`${i.clinicaId}-${i.t.n}`} t={i.t} clientId={i.clientId} clinicaId={i.clinicaId} hoje={hoje} nomeClinica={i.nomeClinica} />)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- filtro por pessoa/papel

export type Filtro = "minhas" | "todas" | PapelId;

/** Papéis do usuário logado nesta clínica (pela atribuição em Quem é quem). */
export function papeisDoUsuario(entrada: EntradaTarefas, userId: string | undefined): PapelId[] {
  if (!userId) return [];
  return (Object.entries(entrada.papeis) as [PapelId, { userId: string | null } | undefined][]).filter(([, p]) => !!userId && p?.userId === userId).map(([k]) => k);
}

export function filtrar(c: ClinicaTarefas, filtro: Filtro, userId: string | undefined, isAdmin: boolean): Tarefa[] {
  if (filtro === "todas") return c.tarefas;
  if (filtro === "minhas") {
    const meus = isAdmin ? papeisDoUsuario(c.entrada, userId) : (["clinica"] as PapelId[]);
    return c.tarefas.filter((t) => meus.some((p) => ehDoPapel(t, p)));
  }
  return c.tarefas.filter((t) => ehDoPapel(t, filtro));
}

export function SeletorFiltro({ valor, onChange, contagem }: { valor: Filtro; onChange: (f: Filtro) => void; contagem?: (f: Filtro) => number }) {
  const opcoes: Filtro[] = ["minhas", "todas", ...PAPEIS.filter((p) => p.execucao).map((p) => p.id)];
  return (
    <label className="text-sm">
      <span className="mr-2" style={{ color: "var(--text-dim)" }}>Ver</span>
      <select value={valor} onChange={(x) => onChange(x.target.value as Filtro)} className="min-h-[38px] rounded-lg border px-2 text-sm" style={campo}>
        {opcoes.map((o) => (
          <option key={o} value={o}>{o === "minhas" ? "Minhas tarefas" : o === "todas" ? "Todas" : NOME_PAPEL[o]}{contagem ? ` (${contagem(o)})` : ""}</option>
        ))}
      </select>
    </label>
  );
}

/** Linha de contadores, igual em todas as telas (sai de contarTarefas). */
export function LinhaContadores({ tarefas, prefixo }: { tarefas: Tarefa[]; prefixo?: string }) {
  const c = contarTarefas(tarefas);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {prefixo && <span style={{ color: "var(--text-dim)" }}>{prefixo}</span>}
      <span>Concluídas: <strong>{c.feitos} de {c.total}</strong>{c.auto ? <span style={{ color: "var(--text-dim)" }}> ({c.auto} por registro automático)</span> : null}</span>
      {c.naoSeAplica > 0 && <span style={{ color: "var(--text-dim)" }}>{c.naoSeAplica} não se aplica{c.naoSeAplica > 1 ? "m" : ""}</span>}
      <span style={{ color: c.atrasadas ? "var(--crit)" : "var(--text-dim)" }}>{c.atrasadas} atrasada{c.atrasadas === 1 ? "" : "s"}</span>
      <span style={{ color: "var(--text-dim)" }}>{c.hoje} hoje · {c.semana} nos próximos 7 dias</span>
    </div>
  );
}

export function AlertaPapeis({ entrada, clientId }: { entrada: EntradaTarefas; clientId: string }) {
  const { isAdmin } = useAuth();
  const faltam = papeisSemPessoa(entrada.papeis).filter((p) => p !== "fundador");
  if (!isAdmin || !faltam.length) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "color-mix(in srgb, var(--warn) 50%, var(--border))", background: "color-mix(in srgb, var(--warn) 8%, var(--surface))" }}>
      <AlertTriangle size={16} aria-hidden style={{ color: "var(--warn)" }} />
      <span><strong>{faltam.length} responsabilidade(s) sem pessoa vinculada:</strong> {faltam.map((p) => NOME_PAPEL[p]).join(", ")}. Defina os responsáveis para que cada pessoa receba suas tarefas.</span>
      <Link to="/sap/$clientId/papeis" params={{ clientId }} className="font-semibold underline" style={{ color: "var(--accent)" }}>Definir responsáveis</Link>
    </div>
  );
}

export function AlertasFundador({ alertas, nomes }: { alertas: AlertaFundador[]; nomes?: Map<string, { nome: string; clientId: string }> }) {
  if (!alertas.length) return null;
  return (
    <Painel icone={AlertTriangle} titulo="Alertas para o Fundador" destaque resumo={`${alertas.length} alerta(s) de escalonamento`}
      ajuda={<>O Fundador não executa tarefas do cronograma: recebe estes alertas e decide com o Coordenador.</>}>
      <ul className="mt-2 space-y-1.5 text-sm">
        {alertas.map((a) => {
          const c = nomes?.get(a.clinicaId);
          return (
            <li key={a.clinicaId + a.id}>
              <strong>{c ? `${c.nome} · ` : ""}{a.titulo}</strong> <span style={{ color: "var(--text-dim)" }}>{a.detalhe}</span>
              {c && <> <Link to={`/sap/$clientId${a.tela}` as never} params={{ clientId: c.clientId } as never} className="font-semibold underline" style={{ color: "var(--accent)" }}>abrir</Link></>}
            </li>
          );
        })}
      </ul>
    </Painel>
  );
}

// ---------------------------------------------------------------- Minhas tarefas (uma clínica)

export function MinhasTarefasClinica({ clientId, filtroInicial = "minhas", grupos, resumoSemana = false }: { clientId: string; filtroInicial?: Filtro; grupos?: Situacao[]; resumoSemana?: boolean }) {
  const { isAdmin, user } = useAuth();
  const { lista, isLoading, error, hoje } = useTarefas(clientId);
  const [filtro, setFiltro] = useState<Filtro>(isAdmin ? filtroInicial : "minhas");
  const c = lista[0];
  if (isLoading) return <p className="note">Carregando…</p>;
  if (error) return <p className="note" style={{ color: "var(--crit)" }}>{(error as Error).message}</p>;
  if (!c) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  if (!c.entrada.clinica.d0) return <p className="note">{isAdmin ? "Defina a data de início em Painel da clínica → Editar cadastro para preparar as tarefas do programa." : "A equipe Doctor Creator vai definir a data de início. As tarefas aparecerão aqui quando o programa estiver preparado."}</p>;
  const meus = papeisDoUsuario(c.entrada, user?.id);
  const visiveis = filtrar(c, filtro, user?.id, isAdmin);
  const ehFundador = meus.includes("fundador");
  return (
    <>
      {resumoSemana && <SapWeekOverview clientId={clientId} day={diaAtual(c.entrada.clinica.d0, c.entrada.clinica.pausas)} all={contarTarefas(c.tarefas)} next={filtrar(c, "minhas", user?.id, isAdmin).filter(t => t.status === "a_fazer" && t.situacao !== "depois").sort(porUrgencia)[0]} missingRole={isAdmin && !meus.length} hoje={hoje} />}
    <section className="sap-my-tasks space-y-4" id="sap-tarefas" aria-labelledby="sap-tasks-title">
      <div className="sap-section-heading"><p className="sap-eyebrow">Executar e acompanhar</p><h2 id="sap-tasks-title">Minhas tarefas</h2></div>
      <AlertaPapeis entrada={c.entrada} clientId={clientId} />
      {isAdmin && (ehFundador || filtro === "todas") && <AlertasFundador alertas={c.alertas} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isAdmin && filtro === "minhas" && !meus.length
          ? <span className="text-sm" style={{ color: "var(--text-dim)" }}>Seu nome ainda não está vinculado a uma responsabilidade nesta clínica.</span>
          : <LinhaContadores tarefas={visiveis} prefixo={filtro === "minhas" && isAdmin ? `Seus papéis: ${meus.map((p) => NOME_PAPEL[p]).join(", ")}.` : undefined} />}
        {isAdmin && <SeletorFiltro valor={filtro} onChange={setFiltro} contagem={(f) => filtrar(c, f, user?.id, isAdmin).filter((t) => t.situacao !== "feita" && t.situacao !== "depois").length} />}
      </div>
      {isAdmin && filtro === "minhas" && !meus.length ? (
        <p className="text-sm">Peça à coordenação para vincular seu nome em <Link to="/sap/$clientId/papeis" params={{ clientId }} className="font-semibold underline" style={{ color: "var(--accent)" }}>Responsáveis</Link>. Para consultar a implantação completa, escolha "Todas" no filtro.</p>
      ) : (
        <ListaAgrupada itens={visiveis.map((t) => ({ t, clientId, clinicaId: c.entrada.clinica.id }))} hoje={hoje} vazio="Nenhuma tarefa disponível nesta seleção. Consulte o cronograma para acompanhar as próximas etapas." grupos={grupos} />
      )}
    </section>
    </>
  );
}

// ---------------------------------------------------------------- Minhas tarefas em todas as clínicas

export function MinhasTarefasTodas() {
  const { user, isAdmin } = useAuth();
  const { lista, isLoading, hoje } = useTarefas();
  const [filtro, setFiltro] = useState<Filtro>("minhas");
  if (isLoading) return <p className="note">Carregando…</p>;
  const itens = lista.flatMap((c) => filtrar(c, filtro, user?.id, isAdmin).map((t) => ({ t, clientId: c.entrada.clinica.clientId, clinicaId: c.entrada.clinica.id, nomeClinica: c.entrada.clinica.nome })));
  const semPapel = lista.filter((c) => papeisSemPessoa(c.entrada.papeis).some((p) => p !== "fundador"));
  const ehFundadorEmAlguma = lista.some((c) => papeisDoUsuario(c.entrada, user?.id).includes("fundador"));
  const alertas = lista.flatMap((c) => c.alertas);
  const nomes = new Map(lista.map((c) => [c.entrada.clinica.id, { nome: c.entrada.clinica.nome, clientId: c.entrada.clinica.clientId }]));
  return (
    <Painel icone={UserRoundCheck} titulo="Minhas tarefas em todas as clínicas" resumo={`${itens.filter((i) => ["atrasada", "hoje", "semana"].includes(i.t.situacao)).length} tarefas até os próximos 7 dias, incluindo atrasadas · ordem de urgência`}
      ajuda={<>Tarefas dos cronogramas das clínicas, reunidas em uma lista. Suas tarefas seguem as atribuições definidas em Responsáveis.</>}>
      <div className="mt-2 space-y-3">
        {(ehFundadorEmAlguma || filtro === "todas") && <AlertasFundador alertas={alertas} nomes={nomes} />}
        {semPapel.length > 0 && (
          <p className="text-sm" style={{ color: "var(--warn)" }}>
            {semPapel.length} clínica(s) com responsabilidades sem pessoa vinculada: {semPapel.map((c) => c.entrada.clinica.nome).join(", ")}. Confira a área Responsáveis de cada clínica.
          </p>
        )}
        <SeletorFiltro valor={filtro} onChange={setFiltro} />
        <ListaAgrupada itens={itens} hoje={hoje} vazio={filtro === "minhas" ? "Nenhuma tarefa vinculada ao seu usuário nesta seleção. Confira suas atribuições na área Responsáveis de cada clínica." : "Nenhuma tarefa disponível nesta seleção."} />
      </div>
    </Painel>
  );
}

// ---------------------------------------------------------------- Quem é quem

export function QuemEQuem({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { lista, isLoading } = useTarefas(clientId);
  const pessoasQ = useQuery({ queryKey: ["pessoas-equipe"], queryFn: getPessoasEquipe, enabled: isAdmin });
  const c = lista[0];
  const salvar = useMutation({
    mutationFn: (v: { papel: PapelId; pessoaId: string | null }) => salvarPapelPessoa(c!.entrada.clinica.id, v.papel, v.pessoaId),
    onSuccess: () => { invalidarTarefas(qc); qc.invalidateQueries({ queryKey: ["pessoas-equipe"] }); },
  });
  if (isLoading) return <p className="note">Carregando…</p>;
  if (!c) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  const pessoas = pessoasQ.data ?? [];
  const contagem = (p: PapelId) => c.tarefas.filter((t) => t.papel === p).length;
  return (
    <div className="space-y-4">
      <AlertaPapeis entrada={c.entrada} clientId={clientId} />
      <Painel icone={UserRoundCheck} titulo="Responsáveis da implantação" resumo="Vincule cada responsabilidade a uma pessoa da equipe ou da clínica"
        ajuda={<>Cada tarefa do cronograma tem um papel. A pessoa atribuída aqui vê essas tarefas em Minhas tarefas, e o nome aparece no card. O Condutor pode ser o Fundador (no piloto) ou outra pessoa. O Fundador fica só para alertas de escalonamento.</>}>
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
          {PAPEIS.map((p) => {
            const atual = c.entrada.papeis[p.id];
            // Ativos da equipe; no papel "Clínica", também os contatos desta clínica. Quem já está no papel continua na lista.
            const opcoes = pessoas.filter((x) => x.id === atual?.pessoaId || (x.ativa && (x.tipo === "equipe" || (p.id === "clinica" && x.client_id === clientId))));
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <div className="min-w-[200px] flex-1">
                  <div className="font-medium">{p.nome} {p.execucao && <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>· {contagem(p.id)} tarefa(s)</span>}</div>
                  <div className="text-xs" style={{ color: "var(--text-dim)" }}>{p.resumo}</div>
                </div>
                {isAdmin ? (
                  <select aria-label={`Pessoa para ${p.nome}`} value={atual?.pessoaId ?? ""} disabled={salvar.isPending}
                    onChange={(x) => salvar.mutate({ papel: p.id, pessoaId: x.target.value || null })}
                    className="min-h-[38px] min-w-[200px] rounded-lg border px-2 text-sm" style={{ ...campo, borderColor: atual ? "var(--border)" : "var(--warn)" }}>
                    <option value="">Responsável a definir</option>
                    {opcoes.map((x) => <option key={x.id} value={x.id}>{x.nome}{x.tipo === "clinica" ? " (clínica)" : ""}{x.tem_login ? "" : " · sem login"}</option>)}
                  </select>
                ) : (
                  <span className="text-sm">{atual?.nome ?? <span style={{ color: "var(--muted)" }}>responsável a definir</span>}</span>
                )}
              </li>
            );
          })}
        </ul>
        {salvar.isError && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</p>}
        {isAdmin && <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Pessoa que não aparece na lista: cadastre em <Link to="/admin/equipe" className="underline">Admin → Equipe</Link>. Não precisa de login; quem tem login com o mesmo e-mail vê as tarefas em Minhas tarefas.</p>}
      </Painel>
    </div>
  );
}
