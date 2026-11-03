import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Paperclip, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DOC } from "@/lib/sap-docs";
import { enviarArquivoDocSap, getRespostasDocSap, linkEvidenciaSap, marcarTarefaSap, salvarRespostaDocSap, type RespostaDocSap } from "@/lib/sap-data";
import {
  EVIDENCIA_DOC, leituraNotaAquisicao, limparDados, progresso, secoesAtivas, totalSecao,
  type Campo, type Dados, type Formulario, type Valor,
} from "@/lib/sap-formularios";

const campoCss = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const input = "mt-1 block min-h-[38px] w-full rounded-md border px-2 text-sm";

/** Respostas dos formulários de uma clínica (ou de pré-venda, com clinicaId null). */
export function useRespostasDoc(clinicaId: string | null, enabled = true) {
  return useQuery({ queryKey: ["sap-doc-resp", clinicaId ?? "venda"], queryFn: () => getRespostasDocSap(clinicaId), enabled });
}

export const respostaDe = (lista: RespostaDocSap[] | undefined, codigo: string, ref = "") => lista?.find((r) => r.documento === codigo && r.ref === ref) ?? null;

function Anexos({ valor, onChange, disabled, clinicaId, pasta, max }: { valor: string[]; onChange: (v: string[]) => void; disabled: boolean; clinicaId: string | null; pasta: number | string; max: number }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="mt-1 space-y-1">
      <ul className="space-y-1 text-sm">
        {valor.map((v, i) => (
          <li key={v} className="flex items-center gap-2">
            <Paperclip size={14} aria-hidden />
            <button type="button" className="underline" onClick={async () => { const u = await linkEvidenciaSap(v); if (u) window.open(u, "_blank", "noopener"); else setErro("Acesso indisponível."); }}>Anexo {i + 1}</button>
            {!disabled && <button type="button" aria-label={`Remover anexo ${i + 1}`} onClick={() => onChange(valor.filter((x) => x !== v))} style={{ color: "var(--text-dim)" }}><Trash2 size={14} /></button>}
          </li>
        ))}
      </ul>
      {!disabled && valor.length < max && (
        <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}>
          <Paperclip size={14} aria-hidden /> {enviando ? "Anexando…" : "Anexar print ou PDF"}
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" disabled={enviando} onChange={async (x) => {
            const f = x.target.files?.[0];
            x.target.value = "";
            if (!f) return;
            setEnviando(true); setErro(null);
            try { onChange([...valor, await enviarArquivoDocSap(clinicaId, pasta, f)]); } catch (e) { setErro((e as Error).message); } finally { setEnviando(false); }
          }} />
        </label>
      )}
      {erro && <p className="text-xs" style={{ color: "var(--crit)" }}>{erro}</p>}
    </div>
  );
}

function CampoForm({ c, d, set, disabled, clinicaId, pasta }: { c: Campo; d: Dados; set: (id: string, v: Valor) => void; disabled: boolean; clinicaId: string | null; pasta: number | string }) {
  const v = d[c.id];
  const str = typeof v === "string" ? v : "";
  const arr = Array.isArray(v) ? (v as string[]) : [];
  const rotulo = (
    <span className="text-sm font-medium">{c.rotulo}{c.opcional ? <span className="ml-1 text-xs font-normal" style={{ color: "var(--muted)" }}>(opcional)</span> : null}</span>
  );
  const ajuda = c.ajuda ? <span className="block text-xs" style={{ color: "var(--text-dim)" }}>{c.ajuda}</span> : null;
  switch (c.tipo) {
    case "texto": case "link":
      return <label className="block" id={`campo-${c.id}`}>{rotulo}{ajuda}<input value={str} disabled={disabled} onChange={(x) => set(c.id, x.target.value)} className={input} style={campoCss} /></label>;
    case "numero":
      return <label className="block" id={`campo-${c.id}`}>{rotulo}{ajuda}<input type="number" inputMode="decimal" value={str} disabled={disabled} onChange={(x) => set(c.id, x.target.value)} className={`${input} max-w-[180px]`} style={campoCss} /></label>;
    case "data":
      return <label className="block" id={`campo-${c.id}`}>{rotulo}{ajuda}<input type="date" value={str} disabled={disabled} onChange={(x) => set(c.id, x.target.value)} className={`${input} max-w-[180px]`} style={campoCss} /></label>;
    case "paragrafo":
      return <label className="block" id={`campo-${c.id}`}>{rotulo}{ajuda}<textarea rows={3} value={str} disabled={disabled} onChange={(x) => set(c.id, x.target.value)} className="mt-1 block w-full rounded-md border px-2 py-1.5 text-sm" style={campoCss} /></label>;
    case "escolha": case "nota":
      return (
        <fieldset id={`campo-${c.id}`} className="block">
          <legend>{rotulo}</legend>{ajuda}
          <div className="mt-1 flex flex-wrap gap-2">
            {(c.opcoes ?? []).map((o) => (
              <label key={o} className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm"
                style={{ borderColor: str === o ? "var(--accent)" : "var(--border)", background: str === o ? "color-mix(in srgb, var(--accent) 10%, var(--surface))" : "var(--surface)" }}>
                <input type="radio" name={`${c.id}`} checked={str === o} disabled={disabled} onChange={() => set(c.id, o)} />{o}
              </label>
            ))}
          </div>
        </fieldset>
      );
    case "multipla":
      return (
        <fieldset id={`campo-${c.id}`} className="block">
          <legend>{rotulo}</legend>{ajuda}
          <div className="mt-1 space-y-1">
            {(c.opcoes ?? []).map((o) => (
              <label key={o} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={arr.includes(o)} disabled={disabled} onChange={(x) => set(c.id, x.target.checked ? [...arr, o] : arr.filter((y) => y !== o))} />
                <span>{o}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    case "arquivo":
      return <div id={`campo-${c.id}`}>{rotulo}{ajuda}<Anexos valor={arr} onChange={(x) => set(c.id, x)} disabled={disabled} clinicaId={clinicaId} pasta={pasta} max={c.maxArquivos ?? 6} /></div>;
    case "tabela": {
      const linhas = (Array.isArray(v) ? (v as Record<string, string>[]) : []);
      const cols = c.colunas ?? [];
      const fixas = c.linhas;
      const n = fixas ? fixas.length : Math.max(linhas.length, c.minLinhas ?? 1);
      const cel = (i: number, col: string, val: string) => {
        const nova = Array.from({ length: Math.max(n, linhas.length) }, (_, k) => ({ ...(linhas[k] ?? {}) }));
        nova[i] = { ...nova[i], [col]: val };
        set(c.id, nova);
      };
      return (
        <div id={`campo-${c.id}`}>
          {rotulo}{ajuda}
          <div className="mt-1 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                {fixas && <th className="p-2 font-medium" />}
                {cols.map((col) => <th key={col.id} className="p-2 font-medium">{col.rotulo}</th>)}
                {!fixas && !disabled && <th className="w-8" />}
              </tr></thead>
              <tbody>
                {Array.from({ length: n }, (_, i) => (
                  <tr key={i} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                    {fixas && <th className="max-w-[240px] p-2 text-left text-xs font-medium">{fixas[i]}</th>}
                    {cols.map((col) => (
                      <td key={col.id} className="p-1.5">
                        {col.opcoes ? (
                          <select value={linhas[i]?.[col.id] ?? ""} disabled={disabled} onChange={(x) => cel(i, col.id, x.target.value)} className="min-h-[36px] w-full rounded-md border px-1.5 text-sm" style={campoCss} aria-label={col.rotulo}>
                            <option value="">—</option>{col.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <textarea rows={1} value={linhas[i]?.[col.id] ?? ""} disabled={disabled} onChange={(x) => cel(i, col.id, x.target.value)} className="min-h-[36px] w-full rounded-md border px-1.5 py-1 text-sm" style={campoCss} aria-label={col.rotulo} />
                        )}
                      </td>
                    ))}
                    {!fixas && !disabled && (
                      <td className="p-1.5"><button type="button" aria-label="Remover linha" disabled={n <= 1} onClick={() => set(c.id, linhas.filter((_, k) => k !== i))} style={{ color: "var(--text-dim)" }}><Trash2 size={14} /></button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!fixas && !disabled && (
            <button type="button" onClick={() => set(c.id, [...linhas, ...Array.from({ length: Math.max(0, n - linhas.length) }, () => ({})), {}])} className="mt-1 inline-flex min-h-[36px] items-center gap-1 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}>
              <Plus size={14} aria-hidden /> Adicionar linha
            </button>
          )}
        </div>
      );
    }
  }
}

/** O documento preenchido dentro do SAP: salva sozinho enquanto escreve e, ao concluir, fecha a tarefa do cronograma. */
export function SapFormulario({ clientId, clinicaId, formulario, ref: refDoc = "", titulo }: { clientId?: string; clinicaId: string | null; formulario: Formulario; ref?: string; titulo?: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const respostas = useRespostasDoc(clinicaId);
  const atual = respostaDe(respostas.data, formulario.codigo, refDoc);
  const [dados, setDados] = useState<Dados>({});
  const [sujo, setSujo] = useState(false);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const carregado = useRef(false);
  const concluido = !!atual?.concluido_em;

  useEffect(() => {
    if (respostas.isSuccess && !carregado.current) { carregado.current = true; setDados(limparDados(formulario, atual?.dados ?? {})); }
  }, [respostas.isSuccess, atual, formulario]);
  useEffect(() => { carregado.current = false; setSujo(false); }, [formulario.codigo, refDoc, clinicaId]);

  const salvar = useMutation({
    mutationFn: (v: { d: Dados; concluir: boolean }) => salvarRespostaDocSap(clinicaId, formulario.codigo, refDoc, v.d, v.concluir),
    onSuccess: () => { setSujo(false); setSalvoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })); qc.invalidateQueries({ queryKey: ["sap-doc-resp", clinicaId ?? "venda"] }); },
  });
  const concluir = useMutation({
    mutationFn: async () => {
      await salvarRespostaDocSap(clinicaId, formulario.codigo, refDoc, dados, true);
      if (formulario.marco !== null && clinicaId) {
        await marcarTarefaSap(clinicaId, formulario.marco, "feito", { evidencia: EVIDENCIA_DOC(formulario.codigo), semana: formulario.ref === "semana" ? refDoc : null });
      }
    },
    onSuccess: () => { setSujo(false); qc.invalidateQueries({ queryKey: ["sap-doc-resp", clinicaId ?? "venda"] }); qc.invalidateQueries({ queryKey: ["sap-tarefas"] }); qc.invalidateQueries({ queryKey: ["sap-marcos"] }); },
  });

  const set = (id: string, v: Valor) => { setDados((d) => ({ ...d, [id]: v })); setSujo(true); };
  const salvarRef = useRef(salvar.mutate);
  salvarRef.current = salvar.mutate;
  useEffect(() => {
    if (!sujo || !isAdmin) return;
    const h = setTimeout(() => salvarRef.current({ d: dados, concluir: concluido }), 1500);
    return () => clearTimeout(h);
  }, [dados, sujo, isAdmin, concluido]);

  const pr = useMemo(() => progresso(formulario, dados), [formulario, dados]);
  const secoes = secoesAtivas(formulario, dados);
  const pct = pr.obrigatorios ? Math.round((pr.preenchidos / pr.obrigatorios) * 100) : 100;
  const dc = formulario.doc ? DOC.get(formulario.doc) : undefined;
  const pasta = formulario.marco ?? formulario.codigo;
  const desativado = !isAdmin;

  if (respostas.isLoading) return <p className="note">Carregando…</p>;
  if (respostas.error) return <p className="note" style={{ color: "var(--crit)" }}>{(respostas.error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <p className="sap-eyebrow">{formulario.doc ? `Documento ${formulario.doc}` : "Registro da entrega"}{formulario.ref === "semana" && refDoc ? ` · semana de ${refDoc.split("-").reverse().join("/")}` : ""}</p>
        <h2 className="text-xl font-semibold">{titulo ?? formulario.nome}</h2>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>{formulario.serve}</p>
        {formulario.quem && <p className="text-xs" style={{ color: "var(--muted)" }}>{formulario.quem}</p>}
        {dc?.url && <a href={dc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline" style={{ color: "var(--text-dim)" }}>Modelo original no Drive (só consulta) <ExternalLink size={12} aria-hidden /></a>}
        {desativado && <p className="text-xs" style={{ color: "var(--warn)" }}>Somente a equipe Doctor Creator preenche este documento. Você está vendo as respostas.</p>}
      </header>

      {secoes.map((s) => {
        const tot = s.total ? totalSecao(s, dados) : null;
        return (
          <section key={s.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <h3 className="text-base font-semibold">{s.titulo}</h3>
            {s.intro && <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>{s.intro}</p>}
            <div className="mt-3 space-y-4">
              {s.campos.map((c) => <CampoForm key={c.id} c={c} d={dados} set={set} disabled={desativado} clinicaId={clinicaId} pasta={pasta} />)}
            </div>
            {tot && (
              <p className="mt-3 text-sm font-semibold">
                {s.total === "scorecard" ? `Nota de aquisição: ${tot.valor} de ${tot.maximo}` : `Total do bloco: ${tot.valor} de ${tot.maximo}`}
                {s.total === "scorecard" && <span className="block text-xs font-normal" style={{ color: "var(--text-dim)" }}>{leituraNotaAquisicao(tot.valor)}</span>}
              </p>
            )}
          </section>
        );
      })}

      <div className="sticky bottom-2 z-10 rounded-xl border p-3 shadow-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[160px] flex-1">
            <div className="text-sm"><strong>{pr.preenchidos} de {pr.obrigatorios}</strong> campos obrigatórios · {pct}%</div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }} aria-hidden><div className="h-full" style={{ width: `${pct}%`, background: pr.completo ? "var(--good)" : "var(--accent)" }} /></div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
              {salvar.isPending ? "Salvando…" : salvar.isError ? <span style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</span> : sujo ? "Alterações ainda não salvas…" : salvoEm ? `Salvo às ${salvoEm}` : atual ? "Rascunho salvo" : "Nada salvo ainda"}
            </div>
          </div>
          {isAdmin && (
            <>
              <button type="button" className="min-h-[38px] rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }} disabled={!sujo || salvar.isPending} onClick={() => salvar.mutate({ d: dados, concluir: concluido })}>Salvar rascunho</button>
              {concluido && !sujo
                ? <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--good)" }}><CheckCircle2 size={16} aria-hidden /> Documento concluído{formulario.marco !== null ? " e tarefa feita" : ""}</span>
                : (
                  <button type="button" className="ws-action ws-action--primary disabled:opacity-50" disabled={!pr.completo || concluir.isPending}
                    title={pr.completo ? undefined : `Faltam ${pr.faltam.length} campo(s) obrigatório(s)`} onClick={() => concluir.mutate()}>
                    {formulario.marco !== null ? "Concluir documento e marcar a tarefa como feita" : "Concluir documento"}
                  </button>
                )}
            </>
          )}
          {clientId && formulario.marco !== null && <Link to="/sap/$clientId" params={{ clientId }} className="text-sm underline" style={{ color: "var(--text-dim)" }}>Voltar às tarefas</Link>}
        </div>
        {!pr.completo && pr.faltam.length > 0 && (
          <details className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>
            <summary className="cursor-pointer">Ver o que falta ({pr.faltam.length})</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {pr.faltam.slice(0, 12).map((f) => <li key={f.id}><a href={`#campo-${f.id}`} className="underline">{f.campo}</a> <span style={{ color: "var(--muted)" }}>({f.secao})</span></li>)}
              {pr.faltam.length > 12 && <li>e mais {pr.faltam.length - 12}…</li>}
            </ul>
          </details>
        )}
        {concluir.isError && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{(concluir.error as Error).message}</p>}
      </div>
    </div>
  );
}
