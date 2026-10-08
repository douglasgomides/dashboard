import { ROTULO_DONO, COR_DONO, type Dono } from "@/lib/motivos";

// Etiqueta de DE QUEM é a ação quando uma fonte está parada: cliente, Meta, origem sem dado ou falha nossa.
export function SeloDono({ dono }: { dono: Dono }) {
  const cor = COR_DONO[dono];
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: `color-mix(in srgb, ${cor} 16%, transparent)`, color: dono === "origem" ? "var(--text-dim)" : cor }}
    >
      {ROTULO_DONO[dono]}
    </span>
  );
}
