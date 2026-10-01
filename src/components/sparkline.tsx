// Sparkline SVG simples (sem biblioteca). Série toda zerada vira traço pontilhado:
// melhor mostrar "sem movimento" do que uma linha que parece dado.
export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2 || values.every((v) => v === 0)) {
    return (
      <svg width={width} height={height} aria-label="Sem dados no período">
        <line x1="2" x2={width - 2} y1={height / 2} y2={height / 2} stroke="var(--axis)" strokeDasharray="3 3" />
      </svg>
    );
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = (width - 4) / (values.length - 1);
  const pts = values.map((v, i) => `${(2 + i * step).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} role="img" aria-label="Tendência de alcance">
      <polyline points={pts} fill="none" stroke="var(--s1, var(--accent))" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
