import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ClipboardList, FolderOpen, Mic, Timer } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import {
  diaAtual, getClinicaSap, getMarcosSap, getPlanoSap, getSessaoSap, getTrackerAuto, marcarMarcoSap, salvarAcaoSap, salvarPastaDriveSap, salvarSessaoSap,
  type RegistroSessao, type SapCadastro,
} from "@/lib/sap-data";
import { cronogramaComDatas } from "@/lib/sap-cronograma";
import { lerTrackerAuto } from "@/lib/sap-auto";
import { KPIS_PLANO, baselineDoTracker, janelaBaseline, kpisDaGarantia, type LinhaPlano } from "@/lib/sap-metas";
import { fmtKpi } from "@/lib/sap-documentos";
import { SESSOES, blocoNoTempo, duracaoPlanejada, linhasParaAcoes, prazosPos, sessaoPorId, type BlocoSessao, type DefSessao } from "@/lib/sap-sessoes";
import { segundaDe } from "@/lib/sap-semana";
import { hojeBrasilia } from "@/lib/status-fonte";

const campo = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const dmh = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dm = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

/** Modo sessão: cada reunião numa tela só, com o roteiro do Drive, os números da clínica e o registro ao vivo. Só a equipe. */
export function ModoSessaoSap({ clientId, sessaoId }: { clientId: string; sessaoId?: string }) {
  const { isAdmin } = useAuth();
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const c = cadQ.data ?? null;
  if (!isAdmin) return <p className="note">O modo sessão é da equipe Doctor Creator.</p>;
  if (cadQ.isLoading) return <p className="note">Carregando…</p>;
  if (!c) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  const s = sessaoPorId(sessaoId) ?? SESSOES[0];
  return (
    <div className="space-y-4">
      <EscolhaSessao clinica={c} atual={s.id} clientId={clientId} />
      <Sessao key={s.id} clinica={c} s={s} clientId={clientId} />
    </div>
  );
}

function EscolhaSessao({ clinica, atual, clientId }: { clinica: SapCadastro; atual: string; clientId: string }) {
  const hoje = hojeBrasilia();
  const marcosQ = useQuery({ queryKey: ["sap-marcos", clinica.id], queryFn: () => getMarcosSap(clinica.id) });
  const crono = useMemo(() => {
    if (!clinica.d0) return [];
    const feitos = new Map((marcosQ.data ?? []).map((m) => [m.marco, { concluidoEm: m.concluido_em, evidencia: m.evidencia }]));
    return cronogramaComDatas(clinica.d0, clinica.pausas ?? [], hoje, feitos).filter((i) => i.tipo === "Sessão");
  }, [clinica, marcosQ.data, hoje]);
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Reuniões do programa">
      {crono.map((i) => {
        const def = SESSOES.find((x) => x.cronoN === i.n);
        const rot = i.nome.split(" (")[0].split(" · ").slice(0, 2).join(" · ");
        const base = "inline-flex min-h-[32px] items-center gap-1 rounded-full border px-3 text-xs";
        if (!def) return <span key={i.n} className={base} style={{ borderColor: "var(--border)", color: "var(--muted)" }} title="Modo sessão em breve; use o roteiro do Drive">{rot} · {dm(i.dataAlvo)}</span>;
        const ativo = def.id === atual;
        return (
          <Link key={i.n} to={"/sap/$clientId/sessao" as never} params={{ clientId } as never} search={{ s: def.id } as never} className={`${base} font-semibold`}
            style={ativo ? { background: "var(--accent)", color: "white", borderColor: "var(--accent)" } : { borderColor: "var(--accent)", color: "var(--accent)" }}>
            {rot} · {dm(i.dataAlvo)}{i.status === "feito" ? " ✓" : ""}
          </Link>
        );
      })}
      {!clinica.d0 && <span className="note">Defina o D0 para ver as datas das reuniões.</span>}
    </div>
  );
}

function Sessao({ clinica, s, clientId }: { clinica: SapCadastro; s: DefSessao; clientId: string }) {
  const qc = useQueryClient();
  const regQ = useQuery({ queryKey: ["sap-sessao", clinica.id, s.id], queryFn: () => getSessaoSap(clinica.id, s.id) });
  const reg = useMemo(() => new Map((regQ.data ?? []).map((r) => [r.chave, r])), [regQ.data]);
  const salvar = useMutation({
    mutationFn: (v: { chave: string; texto: string | null; feito: boolean | null }) => salvarSessaoSap(clinica.id, s.id, v.chave, v.texto, v.feito),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sap-sessao", clinica.id, s.id] }),
  });
  const inicio = reg.get("inicio")?.feito_em ?? null;
  const fim = reg.get("fim")?.feito_em ?? null;
  const fase: "antes" | "durante" | "depois" = fim ? "depois" : inicio ? "durante" : "antes";

  return (
    <>
      <Cabecalho clinica={clinica} s={s} fase={fase} />
      <Antes clinica={clinica} s={s} reg={reg} salvar={(chave, feito) => salvar.mutate({ chave, texto: reg.get(chave)?.texto ?? null, feito })} aberto={fase === "antes"} />
      <Durante clinica={clinica} s={s} reg={reg} inicio={inicio} fim={fim} clientId={clientId}
        salvarTexto={(chave, texto) => salvar.mutateAsync({ chave, texto, feito: null })}
        marcar={(chave, feito) => salvar.mutateAsync({ chave, texto: reg.get(chave)?.texto ?? null, feito })} />
      {fim && <Depois clinica={clinica} s={s} reg={reg} fim={fim} salvar={(chave, feito) => salvar.mutate({ chave, texto: reg.get(chave)?.texto ?? null, feito })} />}
      {salvar.isError && <p className="text-xs" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</p>}
    </>
  );
}

function Cabecalho({ clinica, s, fase }: { clinica: SapCadastro; s: DefSessao; fase: string }) {
  const qc = useQueryClient();
  const [pasta, setPasta] = useState<string | null>(null);
  const salvarPasta = useMutation({ mutationFn: (u: string) => salvarPastaDriveSap(clinica.id, u), onSuccess: () => { setPasta(null); qc.invalidateQueries({ queryKey: ["sap-cadastro"] }); } });
  return (
    <Painel icone={BookOpen} titulo={s.titulo} resumo={`${s.quando} · ${s.duracao} · ${fase === "antes" ? "preparação" : fase === "durante" ? "em andamento" : "pós-sessão"}`}
      ajuda={<>O roteiro completo continua no Drive ({s.docs[0].codigo}), que é a fonte. Esta tela junta o essencial do roteiro, os números da clínica e o registro do que a reunião decide.</>}>
      <p className="mt-2 text-sm"><strong>Princípio:</strong> {s.principio}</p>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
        {s.quem.map((q) => <div key={q.papel}><strong>{q.papel}</strong><div className="text-xs" style={{ color: "var(--text-dim)" }}>{q.faz}</div></div>)}
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><div className="text-xs font-semibold" style={{ color: "var(--text-dim)" }}>ENTRA</div><ul className="list-disc pl-5">{s.entra.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><div className="text-xs font-semibold" style={{ color: "var(--text-dim)" }}>SAI</div><ul className="list-disc pl-5">{s.sai.map((x) => <li key={x}>{x}</li>)}</ul></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {s.docs.map((d) => <a key={d.codigo} href={d.url} target="_blank" rel="noreferrer" className="rounded-full border px-2.5 py-1 underline-offset-2 hover:underline" style={{ borderColor: "var(--border)" }}>{d.codigo} · {d.nome} (modelo)</a>)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <FolderOpen size={16} aria-hidden />
        {pasta === null ? (
          clinica.drive_pasta_url ? (
            <><a href={clinica.drive_pasta_url} target="_blank" rel="noreferrer" className="font-semibold underline" style={{ color: "var(--accent)" }}>Pasta desta clínica no Drive</a>
              <button type="button" className="text-xs underline" style={{ color: "var(--text-dim)" }} onClick={() => setPasta(clinica.drive_pasta_url ?? "")}>trocar</button></>
          ) : (
            <button type="button" className="text-sm underline" style={{ color: "var(--accent)" }} onClick={() => setPasta("")}>Informar a pasta desta clínica no Drive (cópia do modelo de pasta)</button>
          )
        ) : (
          <>
            <input value={pasta} onChange={(x) => setPasta(x.target.value)} placeholder="https://drive.google.com/drive/folders/…" className="min-h-[32px] min-w-0 flex-1 rounded-md border px-2 text-sm" style={campo} />
            <button type="button" disabled={salvarPasta.isPending} onClick={() => salvarPasta.mutate(pasta)} className="min-h-[32px] rounded-lg px-3 text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>Salvar</button>
            <button type="button" onClick={() => setPasta(null)} className="text-xs">Cancelar</button>
          </>
        )}
        {salvarPasta.isError && <span className="text-xs" style={{ color: "var(--crit)" }}>{(salvarPasta.error as Error).message}</span>}
      </div>
    </Painel>
  );
}

type Reg = Map<string, RegistroSessao>;

function Checklist({ itens, reg, salvar }: { itens: { chave: string; quando: string; oque: string; quem: string; doc?: string; prazo?: string; atrasado?: boolean }[]; reg: Reg; salvar: (chave: string, feito: boolean) => void }) {
  return (
    <ul className="mt-2 space-y-2">
      {itens.map((p) => {
        const feito = !!reg.get(p.chave)?.feito_em;
        return (
          <li key={p.chave} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={feito} onChange={(x) => salvar(p.chave, x.target.checked)} aria-label={p.oque} />
            <div>
              <div style={feito ? { textDecoration: "line-through", color: "var(--text-dim)" } : undefined}>{p.oque}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {p.quando}{p.prazo ? ` (${dmh(p.prazo)})` : ""} · {p.quem}{p.doc ? ` · ${p.doc}` : ""}
                {feito && reg.get(p.chave)?.feito_em ? ` · feito ${dmh(reg.get(p.chave)!.feito_em!)}` : ""}
                {p.atrasado && <> · <Selo cor="var(--crit)">atrasado</Selo></>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Antes({ s, reg, salvar, aberto }: { clinica: SapCadastro; s: DefSessao; reg: Reg; salvar: (chave: string, feito: boolean) => void; aberto: boolean }) {
  const feitos = s.preparo.filter((p) => reg.get(p.chave)?.feito_em).length;
  return (
    <Painel icone={ClipboardList} titulo="Antes da sessão" resumo={`Preparação ${feitos} de ${s.preparo.length}`} destaque={aberto}
      ajuda={<>Os passos de preparação do roteiro, com quem faz. Marque à medida que forem feitos.</>}>
      <Checklist itens={s.preparo} reg={reg} salvar={salvar} />
      {s.regraPreparo && <p className="mt-2 text-xs" style={{ color: "var(--warn)" }}>{s.regraPreparo}</p>}
    </Painel>
  );
}

function NumerosClinica({ clinica }: { clinica: SapCadastro }) {
  const hoje = hojeBrasilia();
  const planoQ = useQuery({ queryKey: ["sap-plano", clinica.id], queryFn: () => getPlanoSap(clinica.id) });
  const jan = clinica.d0 ? janelaBaseline(clinica.d0, hoje) : null;
  const autoQ = useQuery({ queryKey: ["sap-auto-baseline", clinica.client_id, jan?.de, jan?.ate], queryFn: () => getTrackerAuto(clinica.client_id!, jan!.de, jan!.ate), enabled: !!jan && !!clinica.client_id });
  const doTracker = useMemo(() => {
    const t = lerTrackerAuto(autoQ.data);
    return t && jan ? baselineDoTracker(t, Math.max(1, Math.round((Date.parse(jan.ate) - Date.parse(jan.de)) / 86_400_000) + 1)) : [];
  }, [autoQ.data, jan]);
  const garantia = new Set(kpisDaGarantia(clinica.consulta_paga !== false));
  const linha = (k: (typeof KPIS_PLANO)[number]) => {
    const p = (planoQ.data ?? []).find((x) => x.kpi === k.id);
    const t = doTracker.find((x: LinhaPlano) => x.kpi === k.id);
    return { k, plano: p?.baseline ?? null, origem: p?.origem ?? null, tracker: t?.baseline ?? null, amostra: t?.amostra ?? null };
  };
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm">
        <thead><tr className="text-xs" style={{ color: "var(--text-dim)" }}><th className="text-left font-normal">KPI</th><th className="text-right font-normal">Baseline registrada</th><th className="text-right font-normal">CRM agora{jan ? ` (${dm(jan.de)} a ${dm(jan.ate)})` : ""}</th></tr></thead>
        <tbody>
          {KPIS_PLANO.map(linha).map(({ k, plano, origem, tracker, amostra }) => (
            <tr key={k.id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-1">{k.rotulo} {garantia.has(k.id) && <Selo cor="var(--accent)">garantia</Selo>}</td>
              <td className="py-1 text-right tabular-nums">{fmtKpi(k.id, plano)}{origem === "estimado" ? " (E)" : ""}</td>
              <td className="py-1 text-right tabular-nums">{fmtKpi(k.id, tracker)}{amostra !== null && tracker !== null ? <span className="text-xs" style={{ color: "var(--muted)" }}> · n={amostra}</span> : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>A baseline oficial é a do 03.03 (planilha). Aqui aparece a registrada em Metas e o que o CRM mede agora, para conferir ao vivo.</p>
    </div>
  );
}

const FUNIL = ["Anúncio e atração", "Filtro", "Conversa", "Agendamento", "Comparecimento", "Consulta", "Follow-up", "Retorno", "Indicação"];

function Durante({ clinica, s, reg, inicio, fim, clientId, salvarTexto, marcar }: {
  clinica: SapCadastro; s: DefSessao; reg: Reg; inicio: string | null; fim: string | null; clientId: string;
  salvarTexto: (chave: string, texto: string) => Promise<void>; marcar: (chave: string, feito: boolean) => Promise<void>;
}) {
  const qc = useQueryClient();
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!inicio || fim) return;
    const t = setInterval(() => setAgora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [inicio, fim]);
  const decorrido = inicio ? ((fim ? Date.parse(fim) : agora) - Date.parse(inicio)) / 60_000 : 0;
  const pos = inicio ? blocoNoTempo(s, decorrido) : null;
  const total = duracaoPlanejada(s);
  const [aberto, setAberto] = useState<number>(1);
  useEffect(() => { if (pos && !fim) setAberto(pos.n); }, [pos?.n, fim]); // eslint-disable-line react-hooks/exhaustive-deps

  const encerrar = useMutation({
    mutationFn: async () => {
      await marcar("fim", true);
      const hoje = hojeBrasilia();
      await marcarMarcoSap(clinica.id, s.cronoN, hoje, `Modo sessão: ${s.titulo} registrada no painel`);
      if (s.acoesDe) {
        const textos = linhasParaAcoes(reg.get(s.acoesDe.chave)?.texto);
        const prazo = new Date(Date.parse(`${hoje}T12:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
        for (const texto of textos) {
          await salvarAcaoSap(clinica.id, { semana: segundaDe(hoje), origem: "call", codigo: s.id, texto, lado: s.acoesDe.lado, responsavel: null, prazo, status: "aberta", resultado: null });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sap-marcos"] });
      qc.invalidateQueries({ queryKey: ["sap-acoes"] });
      qc.invalidateQueries({ queryKey: ["sap-sessao", clinica.id, s.id] });
    },
  });
  const qtdAcoes = s.acoesDe ? linhasParaAcoes(reg.get(s.acoesDe.chave)?.texto).length : 0;

  return (
    <Painel icone={Mic} titulo="Durante a sessão" destaque={!!inicio && !fim}
      resumo={!inicio ? `Roteiro de ${total} min em ${s.blocos.length} blocos` : fim ? `Encerrada em ${dmh(fim)} · ${Math.round(decorrido)} min` : `${Math.round(decorrido)} de ${total} min · bloco ${pos!.n}${pos!.estouro ? ` · ${pos!.estouro} min acima` : ` · ${pos!.restante} min para o próximo`}`}
      ajuda={<>Inicie quando a gravação começar. O relógio mostra em que bloco a sessão deveria estar pelo tempo do roteiro (quem controla é o Coordenador). As notas salvam ao sair de cada campo. Ao encerrar, a reunião vira "feita" no Cronograma e as ações da clínica entram em Ações combinadas.</>}>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!inicio && <button type="button" onClick={() => marcar("inicio", true)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}><Timer size={16} aria-hidden /> Iniciar sessão</button>}
        {inicio && !fim && (
          <button type="button" disabled={encerrar.isPending} onClick={() => { if (window.confirm(`Encerrar a sessão? Ela será marcada como feita no Cronograma${qtdAcoes ? ` e ${qtdAcoes} ação(ões) da clínica vão para Ações combinadas` : ""}.`)) encerrar.mutate(); }}
            className="min-h-[36px] rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--good)" }}>
            Encerrar sessão
          </button>
        )}
        {inicio && <span className="text-xs" style={{ color: "var(--text-dim)" }}>Início {dmh(inicio)}</span>}
        {encerrar.isError && <span className="text-xs" style={{ color: "var(--crit)" }}>{(encerrar.error as Error).message}</span>}
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {s.blocos.map((b) => (
          <div key={b.n} className="h-1.5 rounded-full" style={{ flex: b.min, background: pos && b.n < pos.n ? "var(--good)" : pos && b.n === pos.n ? "var(--accent)" : "var(--border)" }} />
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {s.blocos.map((b) => (
          <Bloco key={b.n} b={b} aberto={aberto === b.n} agora={pos?.n === b.n && !fim} onToggle={() => setAberto(aberto === b.n ? 0 : b.n)} clinica={clinica} reg={reg} salvarTexto={salvarTexto} />
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Situações difíceis e regras de condução</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {s.situacoes.map((x) => <div key={x.titulo}><strong>{x.titulo}</strong><ul className="list-disc pl-5 text-xs">{x.como.map((c) => <li key={c}>{c}</li>)}</ul></div>)}
          <div><strong>Regras</strong><ul className="list-disc pl-5 text-xs">{s.regras.map((r) => <li key={r}>{r}</li>)}</ul></div>
        </div>
      </details>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>Depois de encerrar, a lista do pós-sessão aparece abaixo e os prazos também entram em <Link to={"/sap/$clientId/semana" as never} params={{ clientId } as never} className="underline">Esta semana</Link> pelo Cronograma.</p>
    </Painel>
  );
}

function Bloco({ b, aberto, agora, onToggle, clinica, reg, salvarTexto }: { b: BlocoSessao; aberto: boolean; agora: boolean; onToggle: () => void; clinica: SapCadastro; reg: Reg; salvarTexto: (chave: string, texto: string) => Promise<void> }) {
  return (
    <section className="rounded-lg border" style={{ borderColor: agora ? "var(--accent)" : "var(--border)" }}>
      <button type="button" onClick={onToggle} aria-expanded={aberto} className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="text-sm font-semibold">Bloco {b.n} · {b.titulo}</span>
        <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-dim)" }}>{agora && <Selo cor="var(--accent)">agora</Selo>}{b.min} min · {b.publico}</span>
      </button>
      {aberto && (
        <div className="space-y-2 border-t px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
          <ol className="list-decimal space-y-1 pl-5">{b.passos.map((p) => <li key={p}>{p}</li>)}</ol>
          {b.alerta && <p className="rounded-md p-2 text-xs" style={{ background: "color-mix(in srgb, var(--warn) 12%, transparent)" }}>{b.alerta}</p>}
          {b.mostrar === "funil" && <div className="flex flex-wrap gap-1 text-xs">{FUNIL.map((f, i) => <span key={f} className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--border)" }}>{i + 1}. {f}</span>)}</div>}
          {b.mostrar === "kpis" && <NumerosClinica clinica={clinica} />}
          {b.perguntas && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr style={{ color: "var(--text-dim)" }}><th className="text-left font-normal">Etapa (min)</th><th className="text-left font-normal">Mostrar (03.03 e 03.01)</th><th className="text-left font-normal">Perguntas que os números não respondem</th></tr></thead>
                <tbody>{b.perguntas.map((p) => <tr key={p.etapa} className="border-t align-top" style={{ borderColor: "var(--border)" }}><td className="py-1 pr-2 font-medium">{p.etapa} ({p.min})</td><td className="py-1 pr-2">{p.mostrar}</td><td className="py-1">{p.perguntas}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {b.frases && <div className="text-xs" style={{ color: "var(--text-dim)" }}><strong>Frases que ajudam:</strong> {b.frases.join(" · ")}</div>}
          {b.registrar?.map((r) => <CampoNota key={r.chave} rotulo={r.rotulo} dica={r.dica} linhas={r.linhas ?? 2} valor={reg.get(r.chave)?.texto ?? ""} salvar={(t) => salvarTexto(r.chave, t)} />)}
        </div>
      )}
    </section>
  );
}

function CampoNota({ rotulo, dica, linhas, valor, salvar }: { rotulo: string; dica?: string; linhas: number; valor: string; salvar: (t: string) => Promise<void> }) {
  const [v, setV] = useState(valor);
  const [estado, setEstado] = useState<"" | "salvando" | "salvo" | "erro">("");
  useEffect(() => setV(valor), [valor]);
  return (
    <label className="block text-xs">
      <span className="font-semibold">{rotulo}</span>{dica && <span style={{ color: "var(--muted)" }}> · {dica}</span>}
      <textarea rows={linhas} value={v} onChange={(x) => setV(x.target.value)}
        onBlur={async () => { if (v === valor) return; setEstado("salvando"); try { await salvar(v); setEstado("salvo"); } catch { setEstado("erro"); } }}
        className="mt-0.5 block w-full rounded-md border px-2 py-1 text-sm" style={campo} />
      {estado && <span style={{ color: estado === "erro" ? "var(--crit)" : "var(--muted)" }}>{estado === "salvando" ? "salvando…" : estado === "salvo" ? "salvo" : "não salvou; tente de novo"}</span>}
    </label>
  );
}

function Depois({ s, reg, fim, salvar }: { clinica: SapCadastro; s: DefSessao; reg: Reg; fim: string; salvar: (chave: string, feito: boolean) => void }) {
  const feitos = new Set([...reg.values()].filter((r) => r.feito_em).map((r) => r.chave));
  const itens = prazosPos(s, fim, new Date().toISOString(), feitos);
  const nFeitos = itens.filter((i) => i.feito).length;
  const atrasados = itens.filter((i) => i.atrasado).length;
  return (
    <Painel icone={ClipboardList} titulo="Depois da sessão" resumo={`${nFeitos} de ${itens.length} feitos${atrasados ? ` · ${atrasados} atrasado(s)` : ""}`} destaque
      ajuda={<>Os prazos contam do fim da sessão. O relatório sai do prompt do Drive com a transcrição; as notas registradas acima entram junto como apoio.</>}>
      <Checklist itens={itens} reg={reg} salvar={salvar} />
    </Painel>
  );
}
