import { useState } from "react";
import { COR_SELO, ROTULO_SELO, type Selo } from "@/lib/selo";

// Selo de confiança ao lado de um número de resultado. Toque ou passe o mouse para ver o motivo.
export function SeloConfianca({ selo }: { selo: Selo }) {
  const [aberto, setAberto] = useState(false);
  const cor = COR_SELO[selo.nivel];
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-expanded={aberto}
        aria-label={`${ROTULO_SELO[selo.nivel]}: ${selo.motivo}`}
        title={selo.motivo}
        onClick={(e) => {
          e.stopPropagation();
          setAberto(!aberto);
        }}
        className="inline-flex min-h-[24px] items-center whitespace-nowrap rounded-full px-2 text-[11px] font-semibold"
        style={{ background: `color-mix(in srgb, ${cor} 16%, transparent)`, color: selo.nivel === "ilegivel" ? "var(--text-dim)" : cor }}
      >
        {ROTULO_SELO[selo.nivel]}
      </button>
      {aberto && (
        <span
          role="tooltip"
          className="absolute left-0 top-7 z-20 w-64 rounded-lg border p-2.5 text-xs leading-relaxed shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink-2)" }}
        >
          {selo.motivo}
        </span>
      )}
    </span>
  );
}
