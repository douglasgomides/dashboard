import { fmtPct } from "@/lib/audiencia";

// Barras horizontais com rótulo, valor e percentual. Sem biblioteca: é só layout.
export function Barras({
  itens,
  total,
  cor = "var(--accent)",
  formato,
}: {
  itens: { rotulo: string; valor: number; extra?: string }[];
  total?: number;
  cor?: string;
  formato?: (v: number) => string;
}) {
  const soma = total ?? itens.reduce((a, i) => a + i.valor, 0);
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {itens.map((i) => (
        <div key={i.rotulo} style={{ display: "grid", gridTemplateColumns: "minmax(70px,150px) 1fr auto", gap: 10, alignItems: "center", fontSize: 13 }}>
          <span style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={i.rotulo}>
            {i.rotulo}
          </span>
          <span aria-hidden style={{ display: "block", height: 10, borderRadius: 5, background: "var(--surface-2)" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.max(2, (i.valor / max) * 100)}%`, borderRadius: 5, background: cor }} />
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 96, textAlign: "right" }}>
            {formato ? formato(i.valor) : i.valor.toLocaleString("pt-BR")}
            {soma > 0 && <span style={{ color: "var(--muted)" }}> · {fmtPct((i.valor / soma) * 100, i.valor / soma < 0.1 ? 1 : 0)}</span>}
            {i.extra && <span style={{ color: "var(--muted)" }}> · {i.extra}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// Uma barra dividida em partes (ex.: seguidores x não seguidores).
export function BarraDividida({ partes }: { partes: { rotulo: string; valor: number; cor: string }[] }) {
  const total = partes.reduce((a, p) => a + p.valor, 0);
  if (total <= 0) return null;
  return (
    <div>
      <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", background: "var(--surface-2)" }} role="img" aria-label={partes.map((p) => `${p.rotulo} ${Math.round((p.valor / total) * 100)}%`).join(", ")}>
        {partes.map((p) => (
          <span key={p.rotulo} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} title={`${p.rotulo}: ${p.valor.toLocaleString("pt-BR")}`} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 8, fontSize: 13 }}>
        {partes.map((p) => (
          <span key={p.rotulo} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: p.cor, display: "inline-block" }} />
            {p.rotulo}: <b>{p.valor.toLocaleString("pt-BR")}</b> <span style={{ color: "var(--muted)" }}>({fmtPct((p.valor / total) * 100, (p.valor / total) < 0.1 ? 1 : 0)})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Duas séries lado a lado por categoria (ex.: % dos seguidores x % do alcance por faixa etária).
export function BarrasPareadas({
  categorias,
  a,
  b,
  nomeA,
  nomeB,
}: {
  categorias: string[];
  a: number[];
  b: number[];
  nomeA: string;
  nomeB: string;
}) {
  const max = Math.max(1, ...a, ...b);
  return (
    <div>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--ink-2)", marginBottom: 8 }}>
        <span><i style={{ width: 10, height: 10, borderRadius: 3, background: "var(--accent)", display: "inline-block", marginRight: 6 }} />{nomeA}</span>
        <span><i style={{ width: 10, height: 10, borderRadius: 3, background: "var(--ai, #8b7cf6)", display: "inline-block", marginRight: 6 }} />{nomeB}</span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {categorias.map((c, i) => (
          <div key={c} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 10, alignItems: "center", fontSize: 12.5 }}>
            <span style={{ color: "var(--ink-2)" }}>{c}</span>
            <span style={{ display: "grid", gap: 3 }}>
              {[
                { v: a[i], cor: "var(--accent)" },
                { v: b[i], cor: "var(--ai, #8b7cf6)" },
              ].map((s, k) => (
                <span key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden style={{ display: "block", height: 8, borderRadius: 4, background: s.cor, width: `${Math.max(1, (s.v / max) * 100)}%`, maxWidth: "calc(100% - 52px)" }} />
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{fmtPct(s.v, s.v < 10 ? 1 : 0)}</span>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
