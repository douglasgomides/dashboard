import { memo, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { AlertTriangle, Info, ArrowRight } from "lucide-react";
import { tetoRedondo } from "./graficos";
import "@/styles/nexo-anuncios.css";

// Peças das telas de Marketing (anúncios e criação) no desenho do painel: barras do dia com linha por cima, funil
// de etapas, alerta curto com próximo passo e o "como é calculado" recolhido. Recebem os números prontos da tela;
// nenhuma busca dado nem muda o significado de um número.

const v = (o: Record<string, string | number>) => o as CSSProperties;

/* ---------------- Barras do dia + linha ---------------- */

export interface NxDiaBarraLinha {
  dia: string;
  barra: number;
  linha: number;
}

/**
 * Coluna por dia (ex.: investimento) com uma linha por cima em escala própria (ex.: conversas). As setas escolhem o dia
 * e o leitor de tela ouve os dois valores; quem não enxerga o gráfico tem o resumo completo no figcaption.
 */
export const NxBarrasLinha = memo(function NxBarrasLinha({
  dados,
  rotulo,
  nomeBarra,
  nomeLinha,
  formatarBarra,
  formatarLinha,
  formatarData,
  altura = 220,
}: {
  dados: NxDiaBarraLinha[];
  rotulo: string;
  nomeBarra: string;
  nomeLinha: string;
  formatarBarra: (n: number) => string;
  formatarLinha: (n: number) => string;
  formatarData: (d: string) => string;
  altura?: number;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const n = dados.length;
  const geo = useMemo(() => {
    const tb = tetoRedondo(Math.max(0, ...dados.map((d) => d.barra)));
    const tl = tetoRedondo(Math.max(1, ...dados.map((d) => d.linha)));
    const larg = 1000;
    const passo = n ? larg / n : larg;
    const x = (i: number) => passo * i + passo / 2;
    const y = (val: number) => altura - (val / tl) * altura;
    const linha = dados.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.linha).toFixed(1)}`).join("");
    const marcas = [1, 0.75, 0.5, 0.25, 0];
    const passos = Math.min(5, n);
    const datasEixo = passos <= 1 ? dados.slice(0, 1).map((d) => d.dia) : Array.from({ length: passos }, (_, k) => dados[Math.round((k * (n - 1)) / (passos - 1))].dia);
    return { tb, tl, linha, larg, passo, x, y, yEsq: marcas.map((k) => formatarBarra(tb * k)), yDir: marcas.map((k) => (tl * k).toLocaleString("pt-BR", { maximumFractionDigits: 1 })), datasEixo };
  }, [dados, n, altura, formatarBarra, formatarLinha]);

  const indice = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || !n) return null;
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
  };
  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    const atual = foco ?? n - 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setFoco(Math.max(0, Math.min(n - 1, atual + (e.key === "ArrowLeft" ? -1 : 1))));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setFoco(e.key === "Home" ? 0 : n - 1);
    }
  };
  const texto = (i: number) => `${formatarData(dados[i].dia)}: ${nomeBarra} ${formatarBarra(dados[i].barra)}, ${nomeLinha} ${formatarLinha(dados[i].linha)}`;
  const atual = foco ?? n - 1;
  const total = (k: "barra" | "linha") => dados.reduce((a, d) => a + d[k], 0);

  return (
    <figure className="nx-bl" style={{ margin: 0 }}>
      <figcaption className="sr-only">
        {rotulo}: {nomeBarra} somado {formatarBarra(total("barra"))}, {nomeLinha} somado {formatarLinha(total("linha"))}, em {n} dias.
      </figcaption>
      <div className="nx-linha__legenda" aria-hidden>
        <span>
          <i className="nx-bl__leg-barra" />
          {nomeBarra} (eixo da esquerda)
        </span>
        <span>
          <i style={{ background: "var(--up-ink)" }} />
          {nomeLinha} (eixo da direita)
        </span>
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
            aria-label={`${rotulo}. Use as setas para ler dia a dia.`}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, n - 1)}
            aria-valuenow={Math.max(0, atual)}
            aria-valuetext={n ? texto(atual) : "sem dados"}
            onPointerMove={(e) => {
              const i = indice(e);
              if (i !== foco) setFoco(i);
            }}
            onPointerLeave={() => setFoco(null)}
            onBlur={() => setFoco(null)}
            onKeyDown={teclado}
          >
            <svg className="nx-bl__svg" viewBox={`0 0 ${geo.larg} ${altura}`} preserveAspectRatio="none" aria-hidden>
              <g className="nx-linha__grade">
                {[0, 0.25, 0.5, 0.75, 1].map((k) => (
                  <line key={k} x1={0} x2={geo.larg} y1={altura * k} y2={altura * k} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
              {dados.map((d, i) => {
                const h = (d.barra / geo.tb) * altura;
                const w = Math.max(2, geo.passo * 0.62);
                return (
                  <rect
                    key={d.dia}
                    className={`nx-bl__barra${i === foco ? " nx-bl__barra--on" : ""}`}
                    x={(geo.x(i) - w / 2).toFixed(1)}
                    y={(altura - h).toFixed(1)}
                    width={w.toFixed(1)}
                    height={Math.max(0, h).toFixed(1)}
                    rx={Math.min(6, w / 2)}
                    style={v({ "--i": i })}
                  />
                );
              })}
              <path className="nx-bl__linha" d={geo.linha} fill="none" stroke="var(--up-ink)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {foco != null && (
              <>
                <span className="nx-linha__guia" style={{ left: `${((foco + 0.5) / n) * 100}%` }} />
                <span className="nx-linha__dica" style={{ left: `clamp(80px, ${((foco + 0.5) / n) * 100}%, calc(100% - 80px))` }}>
                  <b>{formatarData(dados[foco].dia)}</b>
                  <span style={{ display: "block" }}>
                    {nomeBarra}: {formatarBarra(dados[foco].barra)}
                  </span>
                  <span style={{ display: "block" }}>
                    {nomeLinha}: {formatarLinha(dados[foco].linha)}
                  </span>
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
        <div className="nx-linha__y nx-linha__y--dir" aria-hidden style={{ height: altura + 22 }}>
          {geo.yDir.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      </div>
    </figure>
  );
});

/* ---------------- Funil ---------------- */

export interface NxEtapaFunil {
  rotulo: string;
  valor: number;
  texto: string;
  /** Texto da passagem da etapa anterior para esta (ex.: "1 clique a cada 100 aparições"). */
  passagem?: string | null;
  icone?: ReactNode;
}

/**
 * Funil em degraus. A largura de cada degrau é a escala de raiz quadrada do valor (para a última etapa não sumir
 * quando a primeira é 1.000 vezes maior); o número escrito é sempre o real, e a passagem entre etapas vem escrita.
 */
export const NxFunil = memo(function NxFunil({ etapas, rotulo }: { etapas: NxEtapaFunil[]; rotulo: string }) {
  const max = Math.sqrt(Math.max(1, ...etapas.map((e) => e.valor)));
  return (
    <figure className="nx-funil" style={{ margin: 0 }} aria-label={rotulo}>
      <figcaption className="sr-only">
        {rotulo}: {etapas.map((e) => `${e.rotulo} ${e.texto}${e.passagem ? ` (${e.passagem})` : ""}`).join("; ")}
      </figcaption>
      <ol className="nx-funil__lista" aria-hidden>
        {etapas.map((e, i) => (
          <li key={e.rotulo} className="nx-funil__etapa" style={v({ "--i": i })}>
            {e.passagem && (
              <span className="nx-funil__passagem">
                <ArrowRight size={13} aria-hidden style={{ transform: "rotate(90deg)" }} />
                {e.passagem}
              </span>
            )}
            <div className="nx-funil__linha">
              <span className="nx-funil__rotulo">
                {e.icone}
                {e.rotulo}
              </span>
              <b>{e.texto}</b>
            </div>
            <div className="nx-funil__trilho">
              <i style={{ width: `${Math.max(6, (Math.sqrt(Math.max(0, e.valor)) / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
});

/* ---------------- Alerta curto ---------------- */

/**
 * Alerta que muda a leitura da tela: compacto, com o que aconteceu, o próximo passo e quem resolve. `tom` crítico usa
 * o vermelho; atenção, o laranja. O texto completo continua inteiro (nada é escondido), só com hierarquia.
 */
export function NxAlertaCurto({
  tom = "critico",
  titulo,
  children,
  passo,
  quem,
  acao,
}: {
  tom?: "critico" | "atencao";
  titulo: ReactNode;
  children?: ReactNode;
  passo?: ReactNode;
  quem?: string;
  acao?: ReactNode;
}) {
  return (
    <div className={`nx-alerta-curto nx-alerta-curto--${tom}`} role={tom === "critico" ? "alert" : "status"}>
      <span className="nx-alerta-curto__ic" aria-hidden>
        <AlertTriangle size={16} strokeWidth={2} />
      </span>
      <div className="nx-alerta-curto__corpo">
        <p className="nx-alerta-curto__titulo">{titulo}</p>
        {children && <p className="nx-alerta-curto__texto">{children}</p>}
        {(passo || quem) && (
          <p className="nx-alerta-curto__passo">
            {passo && (
              <span>
                <b>Próximo passo:</b> {passo}
              </span>
            )}
            {quem && <span className="nx-alerta-curto__quem">Quem resolve: {quem}</span>}
          </p>
        )}
      </div>
      {acao && <div className="nx-alerta-curto__acao">{acao}</div>}
    </div>
  );
}

/** Nota curta e secundária (dado incompleto, só conversas medidas...): visível, mas sem gritar. */
export function NxNota({ children, icone }: { children: ReactNode; icone?: ReactNode }) {
  return (
    <p className="nx-nota">
      <span aria-hidden>{icone ?? <Info size={14} />}</span>
      <span>{children}</span>
    </p>
  );
}

/** "Como é calculado": recolhido por padrão, abre no clique ou no Enter (details nativo). */
export function NxComoCalcula({ titulo = "Como é calculado", children }: { titulo?: string; children: ReactNode }) {
  return (
    <details className="nx-metodo">
      <summary>
        <Info size={15} aria-hidden />
        {titulo}
      </summary>
      <div className="nx-metodo__corpo">{children}</div>
    </details>
  );
}

/** Cabeçalho de tela de Marketing: título curto, a pergunta que a tela responde e as ações à direita. */
export function NxTopo({ titulo, pergunta, meta, acao }: { titulo?: string; pergunta: ReactNode; meta?: ReactNode; acao?: ReactNode }) {
  return (
    <header className="nx-topo">
      <div className="nx-topo__texto">
        {titulo && <h2>{titulo}</h2>}
        <p>{pergunta}</p>
        {meta && <div className="nx-topo__meta">{meta}</div>}
      </div>
      {acao && <div className="nx-topo__acao">{acao}</div>}
    </header>
  );
}
