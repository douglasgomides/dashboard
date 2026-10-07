import { useState, type ReactNode } from "react";
import { Film, GalleryHorizontalEnd, Image as ImageIcon, CircleDot, Info, type LucideIcon } from "lucide-react";
import type { ContentFormat } from "@/integrations/supabase/types";

// Peças visuais compartilhadas pelas telas de análise: painel com ícone e ajuda,
// miniatura de post, selo, barra e métrica. Existem para trocar parágrafos por
// leitura rápida SEM tirar informação: o texto explicativo que saiu da frente
// continua um clique adiante, dentro do "i" de cada painel.

export const COR_FORMATO: Record<string, string> = {
  reels: "var(--s2)",
  carrossel: "var(--s1)",
  estatico: "var(--s3)",
  stories: "var(--s7)",
};

export const ICONE_FORMATO: Record<string, LucideIcon> = {
  reels: Film,
  carrossel: GalleryHorizontalEnd,
  estatico: ImageIcon,
  stories: CircleDot,
};

export function IconeFormato({ formato, size = 14 }: { formato: ContentFormat | string | null | undefined; size?: number }) {
  const Icon = (formato && ICONE_FORMATO[formato]) || ImageIcon;
  return <Icon size={size} aria-hidden style={{ color: (formato && COR_FORMATO[formato]) || "var(--muted)" }} />;
}

// "i" que abre o texto de apoio. <details> nativo: funciona sem JS e no celular.
export function Ajuda({ children }: { children: ReactNode }) {
  return (
    <details className="relative inline-block align-middle">
      <summary
        className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full"
        style={{ color: "var(--muted)", background: "var(--surface-2)" }}
        aria-label="Como ler este painel"
        title="Como ler"
      >
        <Info size={14} />
      </summary>
      <span
        className="absolute right-0 z-20 mt-2 block w-72 max-w-[80vw] rounded-lg border p-3 text-xs leading-relaxed"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-dim)", boxShadow: "var(--shadow)" }}
      >
        {children}
      </span>
    </details>
  );
}

export function Painel({
  icone: Icon,
  titulo,
  resumo,
  ajuda,
  cor = "var(--accent)",
  destaque = false,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  resumo?: string;
  ajuda?: ReactNode;
  cor?: string;
  destaque?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-xl border p-4"
      style={{ background: destaque ? "var(--accent-soft)" : "var(--surface)", borderColor: "var(--border)" }}
    >
      <header className="mb-3 flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${cor} 16%, transparent)`, color: cor }}
        >
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight">{titulo}</h2>
          {resumo && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
              {resumo}
            </p>
          )}
        </div>
        {ajuda && <Ajuda>{ajuda}</Ajuda>}
      </header>
      {children}
    </section>
  );
}

export function Selo({ children, cor = "var(--muted)", titulo }: { children: ReactNode; cor?: string; titulo?: string }) {
  return (
    <span
      title={titulo}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `color-mix(in srgb, ${cor} 15%, transparent)`, color: cor === "var(--muted)" ? "var(--text-dim)" : cor }}
    >
      {children}
    </span>
  );
}

// As URLs de imagem do Instagram expiram depois de alguns dias; sem o onError a tela mostra um
// quadrado preto. Quando a imagem falha, cai para o ícone do formato.
export function Miniatura({
  url,
  formato,
  className = "h-14 w-14",
}: {
  url: string | null | undefined;
  formato?: ContentFormat | string | null;
  className?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  if (url && !falhou) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFalhou(true)}
        className={`${className} shrink-0 rounded-lg object-cover`}
        style={{ background: "var(--surface-2)" }}
      />
    );
  }
  return (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-lg`} style={{ background: "var(--surface-2)" }}>
      <IconeFormato formato={formato} size={22} />
    </span>
  );
}

export function BarraFina({ valor, max, cor = "var(--accent)" }: { valor: number; max: number; cor?: string }) {
  const pct = max > 0 ? Math.max(3, Math.min(100, (valor / max) * 100)) : 0;
  return (
    <span aria-hidden className="block h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: cor }} />
    </span>
  );
}

export function Numero({
  icone: Icon,
  valor,
  rotulo,
  cor = "var(--text-dim)",
}: {
  icone: LucideIcon;
  valor: string;
  rotulo: string;
  cor?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs" title={rotulo} style={{ color: cor }}>
      <Icon size={13} aria-hidden />
      <b className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>
        {valor}
      </b>
      <span className="sr-only">{rotulo}</span>
    </span>
  );
}

// Cartão de número grande com ícone — substitui as caixas "RÓTULO EM CAIXA ALTA + valor + frase".
export function Kpi({
  icone: Icon,
  rotulo,
  valor,
  dica,
  cor = "var(--accent)",
  tendencia,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string | number;
  dica?: string;
  cor?: string;
  tendencia?: { sobe: boolean; texto: string } | null;
}) {
  return (
    <div className="rounded-xl border p-3.5" style={{ background: "var(--surface)", borderColor: "var(--border)" }} title={dica}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ background: `color-mix(in srgb, ${cor} 16%, transparent)`, color: cor }}
        >
          <Icon size={15} />
        </span>
        <span className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>
          {rotulo}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums leading-none">{valor}</div>
      {tendencia && (
        <div className="mt-1.5 text-xs font-medium" style={{ color: tendencia.sobe ? "var(--good-text)" : "var(--crit)" }}>
          {tendencia.sobe ? "▲" : "▼"} {tendencia.texto}
        </div>
      )}
      {dica && !tendencia && (
        <div className="mt-1.5 line-clamp-2 text-[11px] leading-snug" style={{ color: "var(--muted)" }}>
          {dica}
        </div>
      )}
    </div>
  );
}
