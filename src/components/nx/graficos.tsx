import { memo, useId, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import "./nx.css";

// Gráficos do Nexo em SVG e CSS puros (nenhuma biblioteca): colunas, linha no tempo, pizza, meia-lua e faísca.
// Todos recebem os números prontos; a geometria é calculada uma vez por mudança de dado (useMemo), e a interação
// lê a posição do ponteiro só dentro do evento, sem medir o layout no render.

/** Rampa Cobalto para fatias, do mais forte ao mais claro; a última é o cinza do campo. */
export const NX_CORES = ["var(--b1)", "var(--b3)", "var(--b4)", "var(--b5)", "var(--b2)", "var(--field)"] as const;

const v = (o: Record<string, string | number>) => o as CSSProperties;

/** Teto "redondo" para o eixo (1, 2, 2,5 ou 5 vezes uma potência de 10). */
export function tetoRedondo(max: number): number {
  if (!(max > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

/* ---------------- Colunas ---------------- */

export interface NxColuna {
  rotulo: string;
  valor: number;
  /** Texto do valor (já formatado pela tela). */
  texto: string;
}

/** Barras verticais (prancha "Uso de mensagens"): a coluna em destaque ganha o degradê e o valor numa pílula. */
export const NxColunas = memo(function NxColunas({
  dados,
  destaque,
  formatarEixo,
  rotulo,
}: {
  dados: NxColuna[];
  destaque?: number;
  formatarEixo: (n: number) => string;
  rotulo: string;
}) {
  const { teto, ticks } = useMemo(() => {
    const teto = tetoRedondo(Math.max(0, ...dados.map((d) => d.valor)));
    return { teto, ticks: [1, 0.75, 0.5, 0.25, 0].map((k) => formatarEixo(teto * k)) };
  }, [dados, formatarEixo]);
  const colunas = { gridTemplateColumns: `repeat(${dados.length}, minmax(0, 1fr))` };
  return (
    <figure className="nx-colunas" aria-label={rotulo} role="img" style={{ margin: 0 }}>
      <figcaption className="sr-only">
        {rotulo}: {dados.map((d) => `${d.rotulo} ${d.texto}`).join("; ")}
      </figcaption>
      <div className="nx-colunas__y" aria-hidden>
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div className="nx-colunas__plot" aria-hidden>
        <div className="nx-colunas__barras" style={colunas}>
          {dados.map((d, i) => (
            <div
              key={d.rotulo}
              className={`nx-coluna${i === destaque ? " nx-coluna--hl" : ""}`}
              style={v({ "--h": `${((d.valor / teto) * 100).toFixed(1)}%`, "--i": i })}
            >
              <i />
              {i === destaque && <b>{d.texto}</b>}
            </div>
          ))}
        </div>
        <div className="nx-colunas__x" style={colunas}>
          {dados.map((d) => (
            <span key={d.rotulo} title={d.rotulo}>
              {d.rotulo}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
});

/* ---------------- Linha no tempo ---------------- */

export interface NxSerie {
  rotulo: string;
  valores: number[];
  cor: string;
  /** Eixo de cada série; a da direita tem escala própria. */
  eixo?: "esq" | "dir";
  area?: boolean;
}

const LARG = 1000;

/**
 * Série diária com eixo próprio à esquerda (e à direita, se houver). Passar o ponteiro mostra os valores do dia;
 * clicar, ou Enter no teclado depois de escolher o dia com as setas, chama `onSelecionar` com a data.
 */
export const NxLinhaTempo = memo(function NxLinhaTempo({
  datas,
  series,
  selecionado,
  onSelecionar,
  formatarData,
  formatarValor,
  rotulo,
  altura = 220,
}: {
  datas: string[];
  series: NxSerie[];
  selecionado?: string | null;
  onSelecionar?: (data: string) => void;
  formatarData: (d: string) => string;
  formatarValor: (n: number) => string;
  rotulo: string;
  altura?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const [foco, setFoco] = useState<number | null>(null);
  const n = datas.length;

  const geo = useMemo(() => {
    const tetos = { esq: 1, dir: 1 };
    for (const s of series) {
      const e = s.eixo ?? "esq";
      tetos[e] = Math.max(tetos[e], ...s.valores);
    }
    tetos.esq = tetoRedondo(tetos.esq);
    tetos.dir = tetoRedondo(tetos.dir);
    const xDe = (i: number) => (n <= 1 ? LARG / 2 : (i / (n - 1)) * LARG);
    const caminhos = series.map((s) => {
      const teto = tetos[s.eixo ?? "esq"];
      let d = "";
      for (let i = 0; i < s.valores.length; i++) {
        const y = altura - (s.valores[i] / teto) * altura;
        d += `${i ? "L" : "M"}${xDe(i).toFixed(1)} ${y.toFixed(1)}`;
      }
      const area = s.area && d ? `${d}L${xDe(s.valores.length - 1).toFixed(1)} ${altura}L${xDe(0).toFixed(1)} ${altura}Z` : null;
      return { d, area };
    });
    const temDir = series.some((s) => s.eixo === "dir");
    const marcas = (t: number) => [1, 0.75, 0.5, 0.25, 0].map((k) => formatarValor(t * k));
    // Até 5 datas no eixo, sempre a primeira e a última.
    const passos = Math.min(5, n);
    const datasEixo = passos <= 1 ? datas.slice(0, 1) : Array.from({ length: passos }, (_, k) => datas[Math.round((k * (n - 1)) / (passos - 1))]);
    return { caminhos, yEsq: marcas(tetos.esq), yDir: temDir ? marcas(tetos.dir) : null, datasEixo };
  }, [series, datas, n, altura, formatarValor]);

  const pct = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const indiceDoPonteiro = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || n === 0) return null;
    return Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
  };
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const i = indiceDoPonteiro(e);
    if (i !== foco) setFoco(i);
  };
  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    const atual = foco ?? (selecionado ? Math.max(0, datas.indexOf(selecionado)) : n - 1);
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setFoco(Math.max(0, Math.min(n - 1, atual + (e.key === "ArrowLeft" ? -1 : 1))));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setFoco(e.key === "Home" ? 0 : n - 1);
    } else if ((e.key === "Enter" || e.key === " ") && onSelecionar) {
      e.preventDefault();
      onSelecionar(datas[atual]);
    }
  };
  const iSel = selecionado ? datas.indexOf(selecionado) : -1;
  const iFoco = foco ?? -1;
  const textoDia = (i: number) => `${formatarData(datas[i])}: ${series.map((s) => `${s.rotulo} ${formatarValor(s.valores[i] ?? 0)}`).join(", ")}`;

  return (
    <div className="nx-linha">
      <div className="nx-linha__legenda" aria-hidden>
        {series.map((s) => (
          <span key={s.rotulo}>
            <i style={{ background: s.cor }} />
            {s.rotulo}
            {s.eixo === "dir" ? " (eixo da direita)" : ""}
          </span>
        ))}
      </div>
      <div className="nx-linha__area">
        <div className="nx-linha__y" aria-hidden style={{ height: altura + 22 }}>
          {geo.yEsq.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
        <div className="nx-linha__plot">
          <div
            className="nx-linha__alvo"
            style={v({ "--altura": `${altura}px` })}
            role="slider"
            tabIndex={0}
            aria-label={`${rotulo}. Setas escolhem o dia; Enter mostra o que foi publicado.`}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, n - 1)}
            aria-valuenow={iFoco >= 0 ? iFoco : Math.max(0, iSel >= 0 ? iSel : n - 1)}
            aria-valuetext={n ? textoDia(iFoco >= 0 ? iFoco : iSel >= 0 ? iSel : n - 1) : "sem dados"}
            onPointerMove={mover}
            onPointerLeave={() => setFoco(null)}
            onBlur={() => setFoco(null)}
            onKeyDown={teclado}
            onClick={(e) => {
              const i = indiceDoPonteiro(e as unknown as PointerEvent<HTMLDivElement>);
              if (i != null && onSelecionar) onSelecionar(datas[i]);
            }}
          >
            <svg className="nx-linha__svg" viewBox={`0 0 ${LARG} ${altura}`} preserveAspectRatio="none" aria-hidden>
              <defs>
                {series.map((s, k) =>
                  s.area ? (
                    <linearGradient key={k} id={`${gid}-a${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.cor} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={s.cor} stopOpacity={0} />
                    </linearGradient>
                  ) : null,
                )}
              </defs>
              <g className="nx-linha__grade">
                {[0, 0.25, 0.5, 0.75, 1].map((k) => (
                  <line key={k} x1={0} x2={LARG} y1={altura * k} y2={altura * k} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
              {geo.caminhos.map((c, k) => (
                <g key={k}>
                  {c.area && <path d={c.area} fill={`url(#${gid}-a${k})`} stroke="none" />}
                  <path d={c.d} fill="none" stroke={series[k].cor} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </g>
              ))}
            </svg>
            {iSel >= 0 && <span className="nx-linha__guia nx-linha__guia--fixa" style={{ left: `${pct(iSel)}%` }} />}
            {iFoco >= 0 && (
              <>
                <span className="nx-linha__guia" style={{ left: `${pct(iFoco)}%` }} />
                <span className="nx-linha__dica" style={{ left: `clamp(70px, ${pct(iFoco)}%, calc(100% - 70px))` }}>
                  <b>{formatarData(datas[iFoco])}</b>
                  {series.map((s) => (
                    <span key={s.rotulo} style={{ display: "block" }}>
                      {s.rotulo}: {formatarValor(s.valores[iFoco] ?? 0)}
                    </span>
                  ))}
                </span>
              </>
            )}
          </div>
          <div className="nx-linha__x" aria-hidden>
            {geo.datasEixo.map((d, i) => (
              <span key={`${d}-${i}`}>{formatarData(d)}</span>
            ))}
          </div>
        </div>
        {geo.yDir ? (
          <div className="nx-linha__y nx-linha__y--dir" aria-hidden style={{ height: altura + 22 }}>
            {geo.yDir.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
});

/* ---------------- Pizza ---------------- */

export interface NxFatia {
  rotulo: string;
  valor: number;
  /** Cor própria (token via var()); sem ela, a rampa Cobalto na ordem. */
  cor?: string;
}

const pctTexto = (p: number) => `${Math.round(p)}%`;

/** Pizza (prancha "Mensagens por canal"): fatias na rampa Cobalto, percentual em etiqueta e legenda embaixo. */
export const NxPizza = memo(function NxPizza({ fatias, rotulo }: { fatias: NxFatia[]; rotulo: string }) {
  const geo = useMemo(() => {
    const total = fatias.reduce((a, f) => a + f.valor, 0);
    const r = 25;
    const C = 2 * Math.PI * r;
    let acc = 0;
    return {
      C,
      total,
      fatias: fatias.map((f, i) => {
        const p = total > 0 ? (f.valor / total) * 100 : 0;
        const len = (p / 100) * C;
        const meio = ((acc + len / 2) / C) * 2 * Math.PI - Math.PI / 2;
        const item = { ...f, p, len, offset: -acc, lx: 60 + 58 * Math.cos(meio), ly: 60 + 58 * Math.sin(meio), cor: f.cor ?? NX_CORES[i % NX_CORES.length] };
        acc += len;
        return item;
      }),
    };
  }, [fatias]);
  return (
    <figure className="nx-pizza" style={{ margin: 0 }}>
      <svg viewBox="-14 -14 148 148" role="img" aria-label={`${rotulo}: ${geo.fatias.map((f) => `${f.rotulo} ${pctTexto(f.p)}`).join(", ")}`}>
        {geo.fatias.map((f, i) => (
          <circle
            key={f.rotulo}
            className="nx-fatia"
            r={25}
            cx={60}
            cy={60}
            fill="none"
            stroke={f.cor}
            strokeWidth={50}
            strokeDasharray={`${f.len.toFixed(2)} ${geo.C.toFixed(2)}`}
            strokeDashoffset={f.offset.toFixed(2)}
            transform="rotate(-90 60 60)"
            style={v({ "--c": geo.C.toFixed(2), "--i": i })}
          />
        ))}
        {geo.fatias.map((f, i) =>
          f.p >= 4 ? (
            <g key={f.rotulo} className="nx-rotulo-anim" style={v({ "--i": i })}>
              <rect x={(f.lx - 14).toFixed(1)} y={(f.ly - 8).toFixed(1)} width={28} height={16} rx={5} />
              <text x={f.lx.toFixed(1)} y={(f.ly + 3.5).toFixed(1)} textAnchor="middle">
                {pctTexto(f.p)}
              </text>
            </g>
          ) : null,
        )}
      </svg>
      <figcaption>
        <NxLegenda itens={geo.fatias.map((f) => ({ rotulo: f.rotulo, cor: f.cor }))} />
      </figcaption>
    </figure>
  );
});

export function NxLegenda({ itens, coluna }: { itens: { rotulo: string; cor: string }[]; coluna?: boolean }) {
  return (
    <ul className={`nx-legenda${coluna ? " nx-legenda--coluna" : ""}`}>
      {itens.map((it) => (
        <li key={it.rotulo}>
          <i style={{ background: it.cor }} aria-hidden />
          {it.rotulo}
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Meia-lua ---------------- */

/** Medidor em meia-lua (prancha "Status dos pacientes"): segmentos na rampa, número grande no centro, legenda ao lado. */
export const NxMedidor = memo(function NxMedidor({
  segmentos,
  centro,
  legendaCentro,
  rotulo,
}: {
  segmentos: NxFatia[];
  centro: string;
  legendaCentro: string;
  rotulo: string;
}) {
  const geo = useMemo(() => {
    const total = segmentos.reduce((a, s) => a + s.valor, 0) || 1;
    const cx = 150, cy = 150, R = 110, W = 46, gap = 2.2;
    const pt = (a: number, r: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy - r * Math.sin((a * Math.PI) / 180)];
    let a0 = 180;
    return segmentos.map((s, i) => {
      const sweep = (s.valor / total) * 180;
      const a1 = a0 - sweep;
      const ini = a0 - (sweep > gap ? gap / 2 : 0), fim = a1 + (sweep > gap ? gap / 2 : 0);
      const [x1, y1] = pt(ini, R), [x2, y2] = pt(fim, R);
      const len = (Math.PI * R * Math.max(0, ini - fim)) / 180;
      const [lx, ly] = pt((a0 + a1) / 2, R + W / 2 + 16);
      const p = (s.valor / total) * 100;
      a0 = a1;
      return { ...s, d: `M${x1.toFixed(1)} ${y1.toFixed(1)} A${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`, len, lx, ly, p, W, cor: s.cor ?? NX_CORES[i % 5] };
    });
  }, [segmentos]);
  return (
    <figure className="nx-medidor" style={{ margin: 0 }}>
      <svg viewBox="-10 0 320 175" role="img" aria-label={`${rotulo}: ${centro} ${legendaCentro}`}>
        {geo.map((s, i) =>
          s.len > 0 ? (
            <path key={s.rotulo} className="nx-traco" d={s.d} fill="none" stroke={s.cor} strokeWidth={s.W} style={v({ "--len": s.len.toFixed(1), "--i": i })} />
          ) : null,
        )}
        {geo.map((s, i) =>
          s.p >= 3 ? (
            <g key={s.rotulo} className="nx-rotulo-anim" style={v({ "--i": i })}>
              <rect x={(s.lx - 18).toFixed(1)} y={(s.ly - 11).toFixed(1)} width={36} height={22} rx={7} fill="var(--white)" stroke="var(--line)" />
              <text x={s.lx.toFixed(1)} y={(s.ly + 4).toFixed(1)} textAnchor="middle" fontSize={12} fill="var(--text-2)">
                {pctTexto(s.p)}
              </text>
            </g>
          ) : null,
        )}
        <text x={150} y={138} textAnchor="middle" className="nx-medidor__valor">
          {centro}
        </text>
        <text x={150} y={162} textAnchor="middle" className="nx-medidor__rotulo">
          {legendaCentro}
        </text>
      </svg>
      <figcaption>
        <NxLegenda coluna itens={geo.map((s) => ({ rotulo: s.rotulo, cor: s.cor }))} />
      </figcaption>
    </figure>
  );
});

/* ---------------- Faísca ---------------- */

/** Linha mínima de tendência, decorativa (o número ao lado é o dado). */
export const NxSpark = memo(function NxSpark({ valores }: { valores: number[] }) {
  const d = useMemo(() => {
    const max = Math.max(1, ...valores);
    const n = valores.length;
    return valores.map((x, i) => `${i ? "L" : "M"}${(n <= 1 ? 50 : (i / (n - 1)) * 100).toFixed(2)} ${(28 - (x / max) * 26).toFixed(2)}`).join("");
  }, [valores]);
  if (valores.length < 2) return null;
  return (
    <svg className="nx-kpi__spark nx-linha__svg" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="var(--b2)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});
