import { Fragment, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, CircleCheck, Siren } from "lucide-react";
import {
  filtrarProblemas,
  resumirProblemas,
  EXPLICA_TIPO,
  ROTULO_FONTE_SAUDE,
  ROTULO_GRAVIDADE,
  ROTULO_QUEM,
  ROTULO_TIPO,
  type FiltroProblemas,
  type FonteSaude,
  type Gravidade,
  type ProblemaFonte,
  type QuemResolve,
  type TipoProblema,
} from "@/lib/saude-problemas";

// Painel do topo da Saúde das fontes (admin): resumo com contadores, a prioridade da vez,
// filtros e uma linha por problema com tipo, ação recomendada, última tentativa e último erro.

const COR_TIPO: Record<TipoProblema, string> = {
  falha_tecnica: "var(--crit)",
  cliente: "var(--warn)",
  sem_dado_origem: "var(--muted)",
  config_incompleta: "var(--s1)",
};
const COR_GRAVIDADE: Record<Gravidade, string> = { alta: "var(--crit)", media: "var(--warn)", baixa: "var(--muted)" };

function quando(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function SeloTipo({ tipo }: { tipo: TipoProblema }) {
  const cor = COR_TIPO[tipo];
  return (
    <span
      title={EXPLICA_TIPO[tipo]}
      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: `color-mix(in srgb, ${cor} 16%, transparent)`, color: tipo === "sem_dado_origem" ? "var(--text-dim)" : cor }}
    >
      {ROTULO_TIPO[tipo]}
    </span>
  );
}

function SeloGravidade({ g }: { g: Gravidade }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: COR_GRAVIDADE[g] }} />
      {ROTULO_GRAVIDADE[g]}
    </span>
  );
}

function Contador({ n, rotulo, cor, ativo, onClick, dica }: { n: number; rotulo: string; cor: string; ativo: boolean; onClick: () => void; dica?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={dica}
      className="min-h-[56px] rounded-lg border px-3 py-2 text-left"
      style={{ borderColor: ativo ? cor : "var(--border)", background: ativo ? `color-mix(in srgb, ${cor} 10%, var(--surface))` : "var(--surface)" }}
    >
      <div className="text-xl font-bold tabular-nums" style={{ color: n ? cor : "var(--muted)" }}>{n}</div>
      <div className="text-xs leading-tight" style={{ color: "var(--ink-2)" }}>{rotulo}</div>
    </button>
  );
}

function Seletor<T extends string>({ rotulo, valor, onChange, opcoes }: { rotulo: string; valor: T | ""; onChange: (v: T | "") => void; opcoes: { v: T; r: string }[] }) {
  return (
    <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs sm:flex-none" style={{ color: "var(--muted)" }}>
      {rotulo}
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value as T | "")}
        autoComplete="off"
        className="min-h-[40px] rounded-lg border px-2 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" }}
      >
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o.v} value={o.v}>{o.r}</option>
        ))}
      </select>
    </label>
  );
}

function LinhaProblema({ p }: { p: ProblemaFonte }) {
  const [aberto, setAberto] = useState(false);
  const erroCurto = p.ultimoErro ? p.ultimoErro.replace(/\s+/g, " ").slice(0, 80) : null;
  return (
    <Fragment>
      <tr className="border-t" style={{ borderColor: "var(--border)" }}>
        <td className="px-3 py-3 align-top" data-label="Cliente">
          <div className="font-medium">{p.cliente}</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>{ROTULO_FONTE_SAUDE[p.fonte as FonteSaude] ?? p.fonte}</div>
        </td>
        <td className="px-3 py-3 align-top" data-label="Problema">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <SeloTipo tipo={p.tipo} />
            <SeloGravidade g={p.gravidade} />
          </div>
          <div className="text-[13px] leading-snug" style={{ color: "var(--ink)" }}>{p.titulo}</div>
        </td>
        <td className="px-3 py-3 align-top text-[13px]" data-label="Quem resolve">{ROTULO_QUEM[p.quem]}</td>
        <td className="max-w-[280px] px-3 py-3 align-top text-[13px] leading-snug" data-label="Ação recomendada" style={{ color: "var(--ink-2)" }}>
          <span className="line-clamp-3" title={p.acao}>{p.acao}</span>
        </td>
        <td className="whitespace-nowrap px-3 py-3 align-top text-[13px] tabular-nums" data-label="Última tentativa" style={{ color: "var(--ink-2)" }}>
          {quando(p.ultimaTentativa)}
        </td>
        <td className="max-w-[220px] px-3 py-3 align-top text-xs" data-label="Último erro técnico" style={{ color: "var(--ink-2)" }}>
          {erroCurto ? <code className="line-clamp-2 break-all" title={p.ultimoErro ?? undefined}>{erroCurto}</code> : <span style={{ color: "var(--muted)" }}>Nenhum</span>}
        </td>
        <td className="px-3 py-3 text-right align-top" data-label="">
          <button
            type="button"
            onClick={() => setAberto(!aberto)}
            aria-expanded={aberto}
            className="inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-sm font-medium"
            style={{ borderColor: "var(--border)", color: "var(--accent)" }}
          >
            Detalhes <ChevronDown size={14} aria-hidden style={{ transform: aberto ? "rotate(180deg)" : undefined }} />
          </button>
        </td>
      </tr>
      {aberto && (
        <tr style={{ background: "var(--surface-2)" }}>
          <td colSpan={7} className="px-4 py-3">
            <dl className="grid gap-3 text-sm leading-relaxed sm:grid-cols-2" style={{ color: "var(--ink-2)" }}>
              <div>
                <dt className="font-semibold" style={{ color: "var(--ink)" }}>O que aconteceu</dt>
                <dd>{p.detalhe || p.titulo}</dd>
              </div>
              <div>
                <dt className="font-semibold" style={{ color: "var(--ink)" }}>O que fazer</dt>
                <dd>{p.acao}</dd>
                <dd className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Quem resolve: <b>{ROTULO_QUEM[p.quem]}</b> · {EXPLICA_TIPO[p.tipo]}</dd>
              </div>
              {p.afeta && (
                <div>
                  <dt className="font-semibold" style={{ color: "var(--ink)" }}>O que fica errado no painel até resolver</dt>
                  <dd>{p.afeta}</dd>
                </div>
              )}
              <div>
                <dt className="font-semibold" style={{ color: "var(--ink)" }}>Histórico da atualização</dt>
                <dd>
                  Última tentativa: {quando(p.ultimaTentativa)} · Último sucesso: {quando(p.ultimoSucesso)}
                  {p.dadoAte ? ` · Dado até ${p.dadoAte.slice(8, 10)}/${p.dadoAte.slice(5, 7)}` : ""}
                </dd>
              </div>
              {p.ultimoErro && (
                <div className="sm:col-span-2">
                  <dt className="font-semibold" style={{ color: "var(--ink)" }}>Erro técnico completo (para a equipe)</dt>
                  <dd><code className="block whitespace-pre-wrap break-all rounded-md p-2 text-xs" style={{ background: "var(--surface)" }}>{p.ultimoErro}</code></dd>
                </div>
              )}
            </dl>
            <Link to="/admin/$clientId" params={{ clientId: p.clientId }} className="mt-3 inline-block text-sm font-semibold" style={{ color: "var(--accent)" }}>
              Abrir o cadastro do cliente (sincronizar, reconectar) →
            </Link>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export function PainelSaudeFontes({
  problemas,
  clientes,
  carregando,
  lidos,
  total,
  falhas,
}: {
  problemas: ProblemaFonte[];
  clientes: { id: string; name: string }[];
  carregando: boolean;
  lidos: number;
  total: number;
  falhas: number;
}) {
  const [f, setF] = useState<FiltroProblemas>({});
  const visiveis = useMemo(() => filtrarProblemas(problemas, f), [problemas, f]);
  const r = useMemo(() => resumirProblemas(problemas), [problemas]);
  const filtrando = Object.values(f).some(Boolean);
  const alterna = <K extends keyof FiltroProblemas>(k: K, v: FiltroProblemas[K]) => setF((x) => ({ ...x, [k]: x[k] === v ? undefined : v }));
  const fontesPresentes = [...new Set(problemas.map((p) => p.fonte))];
  const clientesComProblema = clientes.filter((c) => problemas.some((p) => p.clientId === c.id)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="mb-6 rounded-xl border p-4 sm:p-5" style={{ background: "var(--surface)", borderColor: r.porGravidade.alta ? "var(--danger-border, var(--danger))" : "var(--border)" }} aria-label="Saúde das fontes">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Saúde das fontes</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {carregando ? `Lendo as fontes… ${lidos} de ${total} clientes` : `${total} ${total === 1 ? "cliente lido" : "clientes lidos"}`}
          {falhas > 0 ? ` · ${falhas} não puderam ser lidos agora` : ""}
        </span>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
        Cada problema separado pelo que ele é: <b>falha técnica</b> (é com a gente), <b>do lado do cliente</b> (ele precisa agir),{" "}
        <b>sem dado na origem</b> (não é erro, só não houve dado novo) e <b>configuração incompleta</b> (falta ligar ou cadastrar algo).
      </p>

      {carregando && problemas.length === 0 ? (
        <div className="mt-4 space-y-2" aria-busy="true">
          <div className="h-14 animate-pulse rounded-lg" style={{ background: "var(--surface-2)" }} />
          <div className="h-24 animate-pulse rounded-lg" style={{ background: "var(--surface-2)" }} />
        </div>
      ) : problemas.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--good)" }}>
          <CircleCheck size={18} aria-hidden />
          {falhas > 0 ? "Nenhum problema nos clientes lidos. Recarregue a página para ler os que faltaram." : "Nenhum problema: todas as fontes ligadas estão em dia."}
        </p>
      ) : (
        <>
          {r.prioridade && (
            <div className="mt-4 flex gap-3 rounded-lg p-3" style={{ background: `color-mix(in srgb, ${COR_GRAVIDADE[r.prioridade.gravidade]} 8%, var(--surface))` }}>
              <Siren size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: COR_GRAVIDADE[r.prioridade.gravidade] }} />
              <div className="min-w-0 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Prioridade agora</div>
                <div className="font-semibold" style={{ color: "var(--ink)" }}>
                  {r.prioridade.cliente}: {r.prioridade.titulo}
                </div>
                <div style={{ color: "var(--ink-2)" }}>{r.prioridade.acao}</div>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["alta", "media", "baixa"] as Gravidade[]).map((g) => (
              <Contador key={g} n={r.porGravidade[g]} rotulo={`Gravidade ${ROTULO_GRAVIDADE[g].toLowerCase()}`} cor={COR_GRAVIDADE[g]} ativo={f.gravidade === g} onClick={() => alterna("gravidade", g)} />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(ROTULO_TIPO) as TipoProblema[]).map((t) => (
              <Contador key={t} n={r.porTipo[t]} rotulo={ROTULO_TIPO[t]} cor={COR_TIPO[t]} ativo={f.tipo === t} onClick={() => alterna("tipo", t)} dica={EXPLICA_TIPO[t]} />
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            {r.total} {r.total === 1 ? "problema" : "problemas"} em {r.clientesAfetados} {r.clientesAfetados === 1 ? "cliente" : "clientes"} ·{" "}
            {r.porQuem.equipe} para a Doctor Creator · {r.porQuem.cliente} para o cliente · {r.porQuem.meta + r.porQuem.ninguem} só acompanhar
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Seletor rotulo="Fonte" valor={(f.fonte ?? "") as string} onChange={(v) => setF((x) => ({ ...x, fonte: v || undefined }))} opcoes={fontesPresentes.map((v) => ({ v, r: ROTULO_FONTE_SAUDE[v as FonteSaude] ?? v }))} />
            <Seletor rotulo="Cliente" valor={(f.cliente ?? "") as string} onChange={(v) => setF((x) => ({ ...x, cliente: v || undefined }))} opcoes={clientesComProblema.map((c) => ({ v: c.id, r: c.name }))} />
            <Seletor<Gravidade> rotulo="Gravidade" valor={f.gravidade ?? ""} onChange={(v) => setF((x) => ({ ...x, gravidade: v || undefined }))} opcoes={(["alta", "media", "baixa"] as Gravidade[]).map((v) => ({ v, r: ROTULO_GRAVIDADE[v] }))} />
            <Seletor<QuemResolve> rotulo="Quem resolve" valor={f.quem ?? ""} onChange={(v) => setF((x) => ({ ...x, quem: v || undefined }))} opcoes={(Object.keys(ROTULO_QUEM) as QuemResolve[]).map((v) => ({ v, r: ROTULO_QUEM[v] }))} />
            {filtrando && (
              <button type="button" onClick={() => setF({})} className="min-h-[40px] px-2 text-sm font-semibold" style={{ color: "var(--accent)" }}>
                Limpar filtros
              </button>
            )}
          </div>

          {visiveis.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: "var(--ink-2)" }}>Nenhum problema com esses filtros.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full text-sm empilha">
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--ink-2)", background: "var(--surface-2)" }}>
                    <th className="px-3 py-2">Cliente e fonte</th>
                    <th className="px-3 py-2">Problema</th>
                    <th className="px-3 py-2">Quem resolve</th>
                    <th className="px-3 py-2">Ação recomendada</th>
                    <th className="px-3 py-2">Última tentativa</th>
                    <th className="px-3 py-2">Último erro técnico</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => (
                    <LinhaProblema key={p.id} p={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
