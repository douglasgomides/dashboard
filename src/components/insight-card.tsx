import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ArrowRight,
  User,
  Gauge,
  Target,
  ShieldAlert,
  Info,
} from "lucide-react";
import {
  ROTULO_CONFIANCA,
  ROTULO_IMPACTO,
  ROTULO_RESPONSAVEL,
  ROTULO_TOM,
  type Insight,
  type Limitacao,
  type Tom,
} from "@/lib/insight";

// Peças compartilhadas da "inteligência acionável". Todas as telas usam estas,
// para o usuário aprender a ler um card uma vez só.

export const COR_TOM: Record<
  Tom,
  { cor: string; fundo: string; borda: string }
> = {
  bom: {
    cor: "var(--good-text)",
    fundo: "var(--good-bg)",
    borda: "var(--good-border)",
  },
  atencao: {
    cor: "var(--text)",
    fundo: "var(--warn-bg)",
    borda: "var(--warn-border)",
  },
  ruim: {
    cor: "var(--crit)",
    fundo: "var(--danger-bg)",
    borda: "var(--danger-border)",
  },
};
const ICONE_TOM = { bom: CheckCircle2, atencao: AlertTriangle, ruim: XCircle };

export function SeloStatus({ tom, texto }: { tom: Tom; texto?: string }) {
  const Icon = ICONE_TOM[tom];
  const c = COR_TOM[tom];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: c.fundo, borderColor: c.borda, color: c.cor }}
    >
      <Icon
        size={12}
        aria-hidden
        style={{ color: tom === "atencao" ? "var(--warn)" : c.cor }}
      />
      {texto ?? ROTULO_TOM[tom]}
    </span>
  );
}

function Chip({
  icone: Icon,
  children,
}: {
  icone: typeof User;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]"
      style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}
    >
      <Icon size={11} aria-hidden /> {children}
    </span>
  );
}

// Botão de ação: link interno quando há rota, alvo de toque de 44px.
export function BotaoAcao({
  texto,
  rota,
  clientId,
  variante = "primario",
}: {
  texto: string;
  rota?: string;
  clientId?: string;
  variante?: "primario" | "secundario";
}) {
  const cls = `ws-action ws-action--${variante === "primario" ? "primary" : "secondary"}`;
  if (!rota) return null;
  return (
    <Link
      to={rota as any}
      params={clientId ? ({ clientId } as any) : undefined}
      className={cls}
    >
      {texto} <ArrowRight size={15} aria-hidden />
    </Link>
  );
}

/** Card de um insight: título + status sempre visíveis; o resto em camadas. */
export function InsightCard({
  insight: i,
  clientId,
  aberto: abertoInicial = false,
  compacto = false,
}: {
  insight: Insight;
  clientId?: string;
  aberto?: boolean;
  compacto?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoInicial);
  const c = COR_TOM[i.tom];
  return (
    <article
      className="min-w-0 rounded-xl border p-4"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        borderLeft: `4px solid ${c.borda}`,
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <SeloStatus tom={i.tom} />
        <Chip icone={Gauge}>{ROTULO_CONFIANCA[i.confianca]}</Chip>
        <Chip icone={Target}>{ROTULO_IMPACTO[i.impacto]}</Chip>
        <Chip icone={User}>{ROTULO_RESPONSAVEL[i.responsavel]}</Chip>
      </div>
      <h3
        className="mt-2 text-[15px] font-semibold leading-snug"
        style={{ color: "var(--text)" }}
      >
        {i.titulo}
      </h3>
      {!compacto && (
        <p
          className="mt-1 text-sm leading-relaxed"
          style={{ color: "var(--text-dim)" }}
        >
          {i.diagnostico}
        </p>
      )}
      {i.acao && (
        <div
          className="mt-3 rounded-lg p-3 text-sm"
          style={{ background: "var(--accent-soft)" }}
        >
          <div
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-faint)" }}
          >
            O que fazer
          </div>
          <p
            className="mt-0.5 font-medium leading-snug"
            style={{ color: "var(--text)" }}
          >
            {i.acao.texto}
          </p>
          {i.impactoTexto && (
            <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
              Resultado esperado: {i.impactoTexto}
            </p>
          )}
          {i.acao.rota && (
            <div className="mt-2">
              <BotaoAcao
                texto={i.acao.botao ?? "Abrir"}
                rota={i.acao.rota}
                clientId={clientId}
                variante="secundario"
              />
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-[13px] font-medium min-[821px]:min-h-[36px] min-[821px]:text-xs"
        style={{ color: "var(--text-faint)" }}
      >
        <ChevronDown
          size={14}
          style={{ transform: aberto ? "rotate(180deg)" : undefined }}
        />{" "}
        {aberto ? "Esconder" : "Ver"} evidência e limitações
      </button>
      {aberto && (
        <dl
          className="mt-1 space-y-2 text-[13px] leading-relaxed sm:text-xs"
          style={{ color: "var(--text-dim)" }}
        >
          {compacto && (
            <div>
              <dt className="font-semibold" style={{ color: "var(--text)" }}>
                Por que aconteceu
              </dt>
              <dd>{i.diagnostico}</dd>
            </div>
          )}
          <div>
            <dt className="font-semibold" style={{ color: "var(--text)" }}>
              Evidência
            </dt>
            <dd className="tabular-nums">{i.evidencia}</dd>
          </div>
          {i.motivoConfianca && (
            <div>
              <dt className="font-semibold" style={{ color: "var(--text)" }}>
                Por que essa confiança
              </dt>
              <dd>{i.motivoConfianca}</dd>
            </div>
          )}
          {i.risco && (
            <div className="flex gap-1.5">
              <ShieldAlert
                size={13}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--warn)" }}
                aria-hidden
              />
              <dd>
                <b style={{ color: "var(--text)" }}>Limitação: </b>
                {i.risco}
              </dd>
            </div>
          )}
        </dl>
      )}
    </article>
  );
}

/** Lista "dados incompletos": sempre no fim da tela, nunca escondida. */
export function ListaLimitacoes({
  itens,
  titulo = "O que o painel ainda não consegue dizer",
}: {
  itens: Limitacao[];
  titulo?: string;
}) {
  if (itens.length === 0) return null;
  return (
    <section
      className="rounded-xl border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Info size={16} aria-hidden style={{ color: "var(--warn)" }} /> {titulo}
      </h2>
      <ul className="mt-2 space-y-2">
        {itens.map((l) => (
          <li
            key={l.id}
            className="rounded-lg p-3 text-sm"
            style={{ background: "var(--surface-2)" }}
          >
            <p style={{ color: "var(--text)" }}>{l.texto}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
              Quem resolve: <b>{ROTULO_RESPONSAVEL[l.resolve]}</b>
              {l.comoResolver ? ` · ${l.comoResolver}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Explicação de uma métrica em linguagem simples, abre no toque. */
export function OQueE({ children }: { children: React.ReactNode }) {
  return (
    <details className="text-xs" style={{ color: "var(--text-dim)" }}>
      <summary
        className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1 min-[821px]:min-h-[32px]"
        style={{ color: "var(--text-faint)" }}
      >
        <Info size={12} aria-hidden /> O que é isso?
      </summary>
      <p className="mt-1 leading-relaxed">{children}</p>
    </details>
  );
}
