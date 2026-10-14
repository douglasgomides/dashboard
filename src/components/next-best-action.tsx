import { useEffect, useRef, useState } from "react";
import { ArrowRight, X, Database, ListChecks, Gauge, Target, User, ShieldAlert, FileSearch } from "lucide-react";
import { BotaoAcao, SeloStatus } from "@/components/insight-card";
import { categoriaDaArea, ROTULO_CONFIANCA, ROTULO_IMPACTO, ROTULO_RESPONSAVEL, type Insight } from "@/lib/insight";

// Próxima Melhor Ação.
// Nível 1: card compacto (categoria, prioridade, título, uma frase, uma ação).
// Nível 2: painel lateral "Entender e agir" com evidência, fonte, regra,
// impacto, confiança, etapas, responsável. O que aparece aqui vem só de regras
// determinísticas (src/lib/*); nada é escrito por IA.

export type Prioridade = "alta" | "media" | "baixa";

export function prioridadeDe(i: Insight): Prioridade {
  if (i.tom === "ruim" && i.impacto === "alto") return "alta";
  if (i.tom === "bom" || i.impacto === "baixo") return "baixa";
  return i.impacto === "alto" || i.tom === "ruim" ? "alta" : "media";
}

const COR_PRIORIDADE: Record<Prioridade, { cor: string; fundo: string; texto: string }> = {
  alta: { cor: "var(--crit)", fundo: "var(--danger-bg)", texto: "Prioridade alta" },
  media: { cor: "var(--warn)", fundo: "var(--warn-bg)", texto: "Prioridade média" },
  baixa: { cor: "var(--ink-2)", fundo: "var(--surface-2)", texto: "Prioridade baixa" },
};

export function PriorityBadge({ p }: { p: Prioridade }) {
  const c = COR_PRIORIDADE[p];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: c.fundo, color: c.cor }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: c.cor }} />
      {c.texto}
    </span>
  );
}

/** Nível 1: card compacto. `destaque` = a principal da Home. */
export function NextBestActionCard({ insight: i, onAbrir, destaque = false }: { insight: Insight; onAbrir: () => void; destaque?: boolean }) {
  const p = prioridadeDe(i);
  return (
    <article
      className="rounded-xl border p-4 sm:p-5"
      style={{
        background: "var(--surface)",
        borderColor: destaque ? "var(--accent)" : "var(--border)",
        boxShadow: destaque ? "0 0 0 1px var(--accent)" : undefined,
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {destaque && (
          <span className="font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
            Próxima melhor ação
          </span>
        )}
        <span style={{ color: "var(--muted)" }}>{categoriaDaArea(i.area)}</span>
        <PriorityBadge p={p} />
      </div>
      <h2 className={`mt-2 font-semibold leading-snug ${destaque ? "text-lg sm:text-xl" : "text-base"}`} style={{ color: "var(--ink)" }}>
        {i.titulo}
      </h2>
      <p className="mt-1 line-clamp-2 text-sm" style={{ color: "var(--ink-2)" }} title={i.diagnostico}>
        {i.diagnostico}
      </p>
      {i.acao && (
        <p className="mt-3 text-sm font-medium" style={{ color: "var(--ink)" }}>
          <span style={{ color: "var(--muted)" }}>O que fazer: </span>
          {i.acao.texto}
        </p>
      )}
      <button
        type="button"
        onClick={onAbrir}
        className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-4 text-sm font-semibold"
        style={destaque ? { background: "var(--accent)", color: "var(--accent-ink)" } : { border: "1px solid var(--border)", color: "var(--ink)" }}
      >
        Entender e agir <ArrowRight size={15} aria-hidden />
      </button>
    </article>
  );
}

function Bloco({ icone: Icon, titulo, children }: { icone: typeof Database; titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        <Icon size={13} aria-hidden /> {titulo}
      </h3>
      <div className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {children}
      </div>
    </section>
  );
}

/** Nível 2: painel lateral (folha de baixo no celular). Fecha com Esc e com toque fora. */
export function NextBestActionPanel({ insight: i, clientId, onFechar, rodape }: { insight: Insight | null; clientId: string; onFechar: () => void; rodape?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!i) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", esc);
  }, [i, onFechar]);
  if (!i) return null;
  const p = prioridadeDe(i);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={i.titulo}>
      <button type="button" aria-label="Fechar" className="absolute inset-0" style={{ background: "rgba(15,23,42,.45)" }} onClick={onFechar} />
      <div
        ref={ref}
        tabIndex={-1}
        className="relative ml-auto flex h-full w-full max-w-[520px] flex-col overflow-y-auto p-5 outline-none sm:p-6"
        style={{ background: "var(--surface)", boxShadow: "-12px 0 40px rgba(0,0,0,.2)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span style={{ color: "var(--muted)" }}>{categoriaDaArea(i.area)}</span>
            <PriorityBadge p={p} />
            <SeloStatus tom={i.tom} />
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar painel" className="icobtn -mr-2 -mt-2">
            <X size={20} />
          </button>
        </div>
        <h2 className="mt-2 text-[22px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
          {i.titulo}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {i.diagnostico}
        </p>

        {i.acao && (
          <div className="mt-4 rounded-xl p-4" style={{ background: "var(--surface-2)" }}>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Ação recomendada
            </div>
            <p className="mt-1 text-[15px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
              {i.acao.texto}
            </p>
            {i.impactoTexto && (
              <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
                Resultado esperado: {i.impactoTexto}
              </p>
            )}
            {i.acao.rota && (
              <div className="mt-3">
                <BotaoAcao texto={i.acao.botao ?? "Abrir a tela da ação"} rota={i.acao.rota} clientId={clientId} />
              </div>
            )}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {i.etapas && i.etapas.length > 0 && (
            <Bloco icone={ListChecks} titulo="Etapas">
              <ol className="list-decimal space-y-1 pl-5">
                {i.etapas.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ol>
            </Bloco>
          )}
          <Bloco icone={FileSearch} titulo="Evidência">
            <p className="tabular-nums">{i.evidencia}</p>
          </Bloco>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Bloco icone={Gauge} titulo="Confiança">
              {ROTULO_CONFIANCA[i.confianca].replace("Confiança ", "")}
              {i.motivoConfianca ? <span className="block text-xs" style={{ color: "var(--muted)" }}>{i.motivoConfianca}</span> : null}
            </Bloco>
            <Bloco icone={Target} titulo="Impacto">
              {ROTULO_IMPACTO[i.impacto].replace("Impacto ", "")}
            </Bloco>
            <Bloco icone={User} titulo="Responsável">
              {ROTULO_RESPONSAVEL[i.responsavel]}
            </Bloco>
          </div>
          {i.fonte && (
            <Bloco icone={Database} titulo="Fonte dos dados">
              {i.fonte}
            </Bloco>
          )}
          {i.regra && (
            <Bloco icone={ListChecks} titulo="Regra que gerou esta recomendação">
              {i.regra}
            </Bloco>
          )}
          {i.risco && (
            <Bloco icone={ShieldAlert} titulo="Limitações">
              {i.risco}
            </Bloco>
          )}
        </div>
        {rodape && <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>{rodape}</div>}
      </div>
    </div>
  );
}

/** Estado local do painel aberto, para usar em qualquer tela. */
export function usePainelNBA() {
  const [aberto, setAberto] = useState<Insight | null>(null);
  return { aberto, abrir: (i: Insight) => setAberto(i), fechar: () => setAberto(null) };
}
