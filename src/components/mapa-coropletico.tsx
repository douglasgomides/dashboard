import { useState } from "react";
import { ESTADOS_BR, PAISES_MUNDO } from "@/lib/mapas";
import { fmtN, fmtPct } from "@/lib/audiencia";

// Mapa pintado por quantidade: quanto mais forte a cor, mais gente. A escala é pela raiz do valor,
// senão um lugar com 97% da audiência apagaria todos os outros.
function corDe(valor: number, max: number): { fill: string; forte: boolean } {
  if (!valor || max <= 0) return { fill: "color-mix(in srgb, var(--ink) 11%, var(--surface))", forte: false };
  const t = Math.sqrt(valor / max);
  const pct = Math.round(24 + t * 76);
  return { fill: `color-mix(in srgb, var(--accent) ${pct}%, var(--surface-2))`, forte: pct > 58 };
}

function Legenda() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--muted)" }}>
      <span>menos</span>
      <span aria-hidden style={{ width: 120, height: 8, borderRadius: 4, background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 24%, var(--surface-2)), var(--accent))" }} />
      <span>mais gente</span>
    </div>
  );
}

type Item = { id: string; nome: string; d: string; cx?: number; cy?: number; rotulo?: string };

function Mapa({
  itens,
  valores,
  viewBox,
  descricao,
  vazio,
  maxWidth,
}: {
  itens: Item[];
  valores: Record<string, number>;
  viewBox: string;
  descricao: string;
  vazio: string;
  maxWidth: number;
}) {
  const [ativo, setAtivo] = useState<string | null>(null);
  const total = Object.values(valores).reduce((a, b) => a + b, 0);
  const max = Math.max(0, ...Object.values(valores));
  const sel = ativo ? itens.find((i) => i.id === ativo) : null;
  const vSel = sel ? valores[sel.id] ?? 0 : 0;
  return (
    <div>
      <div style={{ minHeight: 22, fontSize: 13.5, marginBottom: 6 }} aria-live="polite">
        {sel ? (
          <>
            <b>{sel.nome}</b>: {vSel > 0 ? <>{fmtN(vSel)} <span style={{ color: "var(--muted)" }}>· {fmtPct((vSel / total) * 100, vSel / total < 0.1 ? 1 : 0)}</span></> : <span style={{ color: "var(--muted)" }}>sem dado</span>}
          </>
        ) : (
          <span style={{ color: "var(--muted)" }}>{total > 0 ? "Passe o mouse ou toque em um lugar para ver o número." : vazio}</span>
        )}
      </div>
      <svg viewBox={viewBox} role="img" aria-label={descricao} style={{ width: "100%", maxWidth, height: "auto", display: "block" }}>
        {itens.map((i) => {
          const v = valores[i.id] ?? 0;
          const { fill } = corDe(v, max);
          return (
            <path
              key={i.id}
              d={i.d}
              fill={fill}
              stroke={ativo === i.id ? "var(--ink)" : "var(--surface)"}
              strokeWidth={ativo === i.id ? 1.6 : 0.7}
              strokeLinejoin="round"
              tabIndex={v > 0 ? 0 : undefined}
              aria-label={v > 0 ? `${i.nome}: ${fmtN(v)}` : undefined}
              onMouseEnter={() => setAtivo(i.id)}
              onMouseLeave={() => setAtivo(null)}
              onFocus={() => setAtivo(i.id)}
              onBlur={() => setAtivo(null)}
              onClick={() => setAtivo(i.id)}
              style={{ cursor: v > 0 ? "pointer" : "default", outline: "none" }}
            >
              <title>{v > 0 ? `${i.nome}: ${fmtN(v)}` : i.nome}</title>
            </path>
          );
        })}
        {itens.map((i) => {
          const v = valores[i.id] ?? 0;
          if (!i.rotulo || !v || i.cx == null || i.cy == null) return null;
          const { forte } = corDe(v, max);
          return (
            <text key={`t-${i.id}`} x={i.cx} y={i.cy} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} pointerEvents="none" fill={forte ? "var(--accent-ink)" : "var(--ink)"}>
              {i.rotulo}
            </text>
          );
        })}
      </svg>
      <div style={{ marginTop: 8 }}>
        <Legenda />
      </div>
    </div>
  );
}

export function MapaBrasil({ porUf }: { porUf: Record<string, number> }) {
  const itens: Item[] = ESTADOS_BR.map((e) => ({ id: e.uf, nome: e.nome, d: e.d, cx: e.cx, cy: e.cy, rotulo: e.uf }));
  return <Mapa itens={itens} valores={porUf} viewBox="0 0 600 600" maxWidth={440} descricao="Mapa do Brasil com os estados pintados conforme a quantidade de seguidores" vazio="Sem estado identificado nas cidades informadas." />;
}

export const nomeDoPais = (cca2: string): string => PAISES_MUNDO.find((p) => p.cca2 === cca2)?.nome ?? cca2;

export function MapaMundo({ porPais }: { porPais: Record<string, number> }) {
  const itens: Item[] = PAISES_MUNDO.map((p, k) => ({ id: p.cca2 || `x${k}`, nome: p.nome, d: p.d }));
  return <Mapa itens={itens} valores={porPais} viewBox="0 0 960 490" maxWidth={900} descricao="Mapa-múndi com os países pintados conforme a quantidade de seguidores" vazio="Sem país informado." />;
}
