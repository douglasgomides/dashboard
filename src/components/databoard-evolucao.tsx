import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LinhaDiaria } from "@/hooks/use-resultados-diarios";
import "@/styles/databoard.css";

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Minigráfico de linha para dentro do cartão. Só desenha com 3 ou mais dias medidos. */
export function Minigrafico({ pontos }: { pontos: (number | null)[] }) {
  const v = pontos.map((p) => (p == null ? 0 : p));
  if (pontos.filter((p) => p != null).length < 3) return null;
  const w = 200, h = 38, mn = Math.min(...v), mx = Math.max(...v), r = mx - mn || 1;
  const xy = v.map((y, i) => `${((i * w) / (v.length - 1)).toFixed(1)},${(h - 4 - ((y - mn) / r) * (h - 10)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="dbx-spark" aria-hidden>
      <polygon points={`0,${h} ${xy.join(" ")} ${w},${h}`} fill="var(--accent)" opacity="0.1" />
      <polyline points={xy.join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Evolução por dia: pessoas que chamaram e agendamentos. */
export function EvolucaoDiaria({ linhas, periodo }: { linhas: LinhaDiaria[]; periodo: string }) {
  const dados = linhas.filter((l) => l.mandaram_mensagem != null || l.agendaram != null).map((l) => ({ dia: dataCurta(l.dia), Chamaram: l.mandaram_mensagem ?? 0, Agendaram: l.agendaram ?? 0 }));
  if (dados.length < 3) return null;
  return (
    <section className="dbx-card" aria-labelledby="evolucao-t">
      <h2 id="evolucao-t" className="dbx-title">Evolução por dia</h2>
      <p className="dbx-sub">{periodo} · pessoas que chamaram e agendamentos em cada dia</p>
      <div style={{ height: 240, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dados} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13 }} />
            <Area type="monotone" dataKey="Chamaram" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.12} strokeWidth={2} />
            <Area type="monotone" dataKey="Agendaram" stroke="var(--dbx-b)" fill="var(--dbx-b)" fillOpacity={0.12} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="dbx-note">Cada ponto conta as pessoas daquele dia. A soma dos dias pode ser maior que o número do cartão, porque quem chamou em dois dias conta uma vez só no período.</p>
    </section>
  );
}
