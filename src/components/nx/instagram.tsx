import { memo, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Info, Lightbulb, OctagonAlert } from "lucide-react";
import { tetoRedondo } from "./graficos";
import "@/styles/nexo-instagram.css";

// Peças das telas de Marketing/Instagram (Analisar desempenho, Público, Destaques, Publicações, Conteúdo × Comercial)
// no desenho do painel da prancha. Só apresentação: recebem o número e o texto prontos da tela.

/* ---------------- Cabeçalho da tela ---------------- */

/** Título da tela com a pergunta que ela responde, o período e as ações (atualizar, método). */
export function IgCabecalho({
  titulo,
  pergunta,
  periodo,
  acao,
  metodo,
}: {
  titulo: string;
  pergunta: string;
  periodo?: ReactNode;
  acao?: ReactNode;
  metodo?: ReactNode;
}) {
  return (
    <header className="ig-cab">
      <div className="ig-cab__texto">
        <h2>{titulo}</h2>
        <p>{pergunta}</p>
      </div>
      <div className="ig-cab__acoes">
        {periodo && <span className="ig-periodo">{periodo}</span>}
        {metodo && <IgMetodo rotulo="Como ler esta tela">{metodo}</IgMetodo>}
        {acao}
      </div>
    </header>
  );
}

/* ---------------- Método recolhido ("i") ---------------- */

/**
 * Texto de método, fonte ou "como é calculado", recolhido num <details>: abre com Enter/Espaço, funciona sem JS.
 * O resumo é um "i" com o nome acessível em `rotulo`.
 */
export function IgMetodo({ rotulo = "Como é calculado", children, texto }: { rotulo?: string; children: ReactNode; texto?: string }) {
  return (
    <details className="ig-metodo">
      <summary aria-label={rotulo} title={rotulo}>
        <Info size={15} strokeWidth={1.9} aria-hidden />
        {texto && <span>{texto}</span>}
      </summary>
      <div className="ig-metodo__corpo">{children}</div>
    </details>
  );
}

/* ---------------- Aviso de dado ---------------- */

export type IgTomNota = "info" | "aviso" | "critico";

/**
 * Aviso de dado incompleto ou não confiável. Curto e secundário (linha com ícone); o porquê, quando houver, fica
 * num details. `critico` continua visível com fundo, mas compacto.
 */
export function IgNota({ tom = "info", children, detalhe, rotuloDetalhe = "Por quê?" }: { tom?: IgTomNota; children: ReactNode; detalhe?: ReactNode; rotuloDetalhe?: string }) {
  const Icone = tom === "critico" ? OctagonAlert : tom === "aviso" ? AlertTriangle : Info;
  return (
    <div className={`ig-nota ig-nota--${tom}`} role={tom === "critico" ? "alert" : undefined}>
      <Icone size={15} strokeWidth={1.9} aria-hidden className="ig-nota__ic" />
      <div className="ig-nota__texto">
        <span>{children}</span>
        {detalhe && (
          <details className="ig-nota__mais">
            <summary>{rotuloDetalhe}</summary>
            <div>{detalhe}</div>
          </details>
        )}
      </div>
    </div>
  );
}

/** Fileira de avisos curtos. */
export function IgNotas({ children }: { children: ReactNode }) {
  return <div className="ig-notas">{children}</div>;
}

/* ---------------- Leitura em linguagem simples ---------------- */

export type IgTom = "bom" | "atencao" | "neutro";
export interface IgItemLeitura {
  titulo?: ReactNode;
  texto?: ReactNode;
  acao?: ReactNode;
  tom?: IgTom;
  /** Chave estável quando o título não é texto. */
  chave?: string;
}

/** "O que isso quer dizer": frases do que os números mostram e o próximo passo, em cartão de destaque. */
export function IgLeitura({
  itens,
  titulo = "O que isso quer dizer",
  subtitulo,
  vazio,
  metodo,
  i,
}: {
  itens: IgItemLeitura[];
  titulo?: string;
  subtitulo?: ReactNode;
  vazio?: ReactNode;
  metodo?: ReactNode;
  i?: number;
}) {
  if (itens.length === 0 && !vazio) return null;
  return (
    <section className="ig-leitura nx-sobe" style={i == null ? undefined : ({ "--i": i } as CSSProperties)} aria-label={titulo}>
      <header className="ig-leitura__cab">
        <span className="nx-tile" aria-hidden>
          <Lightbulb size={17} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <h3>{titulo}</h3>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        {metodo && <IgMetodo rotulo={`Como ler: ${titulo}`}>{metodo}</IgMetodo>}
      </header>
      {itens.length === 0 ? (
        <p className="ig-leitura__vazio">{vazio}</p>
      ) : (
        <ul className="ig-leitura__lista">
          {itens.map((x, k) => (
            <li key={x.chave ?? (typeof x.titulo === "string" ? x.titulo : typeof x.texto === "string" ? x.texto : k)} className={`ig-leitura__item ig-tom--${x.tom ?? "neutro"}`}>
              {x.titulo && <p className="ig-leitura__titulo">{x.titulo}</p>}
              {x.texto && <p className="ig-leitura__texto">{x.texto}</p>}
              {x.acao && (
                <p className="ig-leitura__acao">
                  <ArrowRight size={15} strokeWidth={2} aria-hidden />
                  <span>
                    <b>Próximo passo:</b> {x.acao}
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------- Abas ---------------- */

/** Abas em pílula (prancha). Setas esquerda/direita trocam de aba pelo teclado. */
export function IgAbas<T extends string>({
  abas,
  ativa,
  onTrocar,
  rotulo,
}: {
  abas: { id: T; rotulo: string; icone?: ReactNode }[];
  ativa: T;
  onTrocar: (id: T) => void;
  rotulo: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = abas.findIndex((a) => a.id === ativa);
    const prox = abas[(i + (e.key === "ArrowRight" ? 1 : abas.length - 1)) % abas.length];
    onTrocar(prox.id);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>(`[data-aba="${prox.id}"]`)?.focus());
  };
  return (
    <div ref={ref} className="ig-abas" role="tablist" aria-label={rotulo} onKeyDown={teclado}>
      {abas.map((a) => (
        <button
          key={a.id}
          type="button"
          role="tab"
          data-aba={a.id}
          aria-selected={a.id === ativa}
          tabIndex={a.id === ativa ? 0 : -1}
          onClick={() => onTrocar(a.id)}
          className="ig-aba"
        >
          {a.icone}
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Barras horizontais com percentual ---------------- */

/** Lista de barras (prancha "Agendaram por canal"): rótulo, valor e o percentual do total em azul claro. */
export function IgBarras({
  itens,
  total,
  formato,
  semPercentual,
}: {
  itens: { rotulo: ReactNode; chave?: string; valor: number; extra?: ReactNode }[];
  total?: number;
  formato?: (v: number) => string;
  semPercentual?: boolean;
}) {
  const soma = total ?? itens.reduce((a, x) => a + x.valor, 0);
  const max = Math.max(1, ...itens.map((x) => x.valor));
  const pct = (v: number) => {
    const p = (v / soma) * 100;
    return `${p.toLocaleString("pt-BR", { maximumFractionDigits: p < 10 ? 1 : 0 })}%`;
  };
  return (
    <ul className="ig-barras">
      {itens.map((x, k) => (
        <li key={x.chave ?? (typeof x.rotulo === "string" ? x.rotulo : k)} className="nx-hb">
          <div className="nx-hb__linha">
            <span className="ig-barras__rotulo">{x.rotulo}</span>
            <em>
              {formato ? formato(x.valor) : x.valor.toLocaleString("pt-BR")}
              {!semPercentual && soma > 0 && <small> · ({pct(x.valor)})</small>}
              {x.extra && <small> · {x.extra}</small>}
            </em>
          </div>
          <div className="nx-trk" aria-hidden>
            <i style={{ width: `${Math.max(3, Math.min(100, (x.valor / max) * 100))}%`, ["--i" as string]: k } as CSSProperties} />
            <u />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Barra dividida ---------------- */

/** Uma barra em partes (seguidores × não seguidores), com o número grande de cada parte embaixo. */
export function IgDividida({ partes, rotulo }: { partes: { rotulo: string; valor: number; cor: string }[]; rotulo: string }) {
  const total = partes.reduce((a, p) => a + p.valor, 0);
  if (total <= 0) return null;
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <figure className="ig-dividida" style={{ margin: 0 }}>
      <div className="ig-dividida__barra" role="img" aria-label={`${rotulo}: ${partes.map((p) => `${p.rotulo} ${pct(p.valor)}%`).join(", ")}`}>
        {partes.map((p) => (
          <span key={p.rotulo} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} title={`${p.rotulo}: ${p.valor.toLocaleString("pt-BR")}`} />
        ))}
      </div>
      <figcaption className="ig-dividida__partes">
        {partes.map((p) => (
          <span key={p.rotulo}>
            <i style={{ background: p.cor }} aria-hidden />
            <span>
              <small>{p.rotulo}</small>
              <b>{pct(p.valor)}%</b>
              <em>{p.valor.toLocaleString("pt-BR")}</em>
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/* ---------------- Linha de seguidores (eixo justo + projeção tracejada) ---------------- */

const LARG = 1000;

/**
 * Total de seguidores no tempo. O eixo começa perto do menor valor (seguidores mudam pouco de um dia para o outro,
 * e um eixo a partir de zero achataria a linha); a projeção, quando a tela a calcula, entra tracejada.
 * Setas escolhem o dia pelo teclado; o valor do dia vai no aria-valuetext.
 */
export const IgLinhaSeguidores = memo(function IgLinhaSeguidores({
  datas,
  valores,
  projecao,
  formatarData,
  formatarValor,
  rotulo,
  altura = 220,
}: {
  datas: string[];
  valores: number[];
  projecao?: { data: string; valor: number } | null;
  formatarData: (d: string) => string;
  formatarValor: (n: number) => string;
  rotulo: string;
  altura?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const [foco, setFoco] = useState<number | null>(null);
  const todasDatas = useMemo(() => (projecao ? [...datas, projecao.data] : datas), [datas, projecao]);
  const n = todasDatas.length;

  const geo = useMemo(() => {
    const todos = projecao ? [...valores, projecao.valor] : valores;
    const min = Math.min(...todos);
    const max = Math.max(...todos);
    const folga = Math.max(1, (max - min) * 0.15);
    const passo = tetoRedondo((max - min + 2 * folga) / 4) / 2 || 1;
    const base = Math.floor((min - folga) / passo) * passo;
    const topo = Math.max(base + passo * 4, Math.ceil((max + folga) / passo) * passo);
    // Datas no eixo por tempo real: a projeção fica 30 dias à frente.
    const t = (d: string) => new Date(`${d}T12:00:00Z`).getTime();
    const t0 = t(todasDatas[0]);
    const t1 = t(todasDatas[n - 1]);
    const xDe = (d: string) => (t1 === t0 ? LARG / 2 : ((t(d) - t0) / (t1 - t0)) * LARG);
    const yDe = (v: number) => altura - ((v - base) / (topo - base)) * altura;
    const pts = valores.map((v, i) => [xDe(datas[i]), yDe(v)] as const);
    const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
    const area = pts.length ? `${d}L${pts[pts.length - 1][0].toFixed(1)} ${altura}L${pts[0][0].toFixed(1)} ${altura}Z` : "";
    const proj = projecao && pts.length ? `M${pts[pts.length - 1][0].toFixed(1)} ${pts[pts.length - 1][1].toFixed(1)}L${xDe(projecao.data).toFixed(1)} ${yDe(projecao.valor).toFixed(1)}` : null;
    const ticks = [0, 1, 2, 3, 4].map((k) => formatarValor(topo - ((topo - base) * k) / 4));
    const xPct = todasDatas.map((dd) => (xDe(dd) / LARG) * 100);
    const passos = Math.min(5, n);
    const eixo = passos <= 1 ? [0] : Array.from({ length: passos }, (_, k) => Math.round((k * (n - 1)) / (passos - 1)));
    return { d, area, proj, ticks, xPct, eixo };
  }, [valores, datas, projecao, todasDatas, n, altura, formatarValor]);

  const valorEm = (i: number) => (i < valores.length ? valores[i] : (projecao?.valor ?? 0));
  const texto = (i: number) => `${formatarData(todasDatas[i])}: ${formatarValor(valorEm(i))}${i >= valores.length ? " (projeção)" : ""}`;
  const indice = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || n === 0) return null;
    const p = ((e.clientX - r.left) / r.width) * 100;
    let melhor = 0;
    for (let i = 1; i < n; i++) if (Math.abs(geo.xPct[i] - p) < Math.abs(geo.xPct[melhor] - p)) melhor = i;
    return melhor;
  };
  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    const atual = foco ?? valores.length - 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setFoco(Math.max(0, Math.min(n - 1, atual + (e.key === "ArrowLeft" ? -1 : 1))));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setFoco(e.key === "Home" ? 0 : n - 1);
    }
  };
  const atual = foco ?? Math.max(0, valores.length - 1);

  return (
    <div className="nx-linha">
      <div className="nx-linha__legenda" aria-hidden>
        <span>
          <i style={{ background: "var(--b2)" }} />
          Medido
        </span>
        {projecao && (
          <span>
            <i className="ig-tracejado" />
            Projeção (estimativa)
          </span>
        )}
      </div>
      <div className="nx-linha__area">
        <div className="nx-linha__y" aria-hidden style={{ height: altura + 22 }}>
          {geo.ticks.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
        <div className="nx-linha__plot">
          <div
            className="nx-linha__alvo"
            style={{ ["--altura" as string]: `${altura}px` } as CSSProperties}
            role="slider"
            tabIndex={0}
            aria-label={`${rotulo}. Setas escolhem o dia.`}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, n - 1)}
            aria-valuenow={atual}
            aria-valuetext={n ? texto(atual) : "sem dados"}
            onPointerMove={(e) => {
              const i = indice(e);
              if (i !== foco) setFoco(i);
            }}
            onPointerLeave={() => setFoco(null)}
            onBlur={() => setFoco(null)}
            onKeyDown={teclado}
          >
            <svg className="nx-linha__svg" viewBox={`0 0 ${LARG} ${altura}`} preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id={`${gid}-a`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--b2)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--b2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <g className="nx-linha__grade">
                {[0, 0.25, 0.5, 0.75, 1].map((k) => (
                  <line key={k} x1={0} x2={LARG} y1={altura * k} y2={altura * k} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
              {geo.area && <path d={geo.area} fill={`url(#${gid}-a)`} stroke="none" />}
              <path d={geo.d} fill="none" stroke="var(--b2)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {geo.proj && <path d={geo.proj} fill="none" stroke="var(--b3)" strokeWidth={2.25} strokeDasharray="7 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
            </svg>
            {foco != null && (
              <>
                <span className="nx-linha__guia" style={{ left: `${geo.xPct[foco]}%` }} />
                <span className="nx-linha__dica" style={{ left: `clamp(70px, ${geo.xPct[foco]}%, calc(100% - 70px))` }}>
                  <b>{formatarData(todasDatas[foco])}</b>
                  <span style={{ display: "block" }}>
                    {foco >= valores.length ? "Projeção" : "Seguidores"}: {formatarValor(valorEm(foco))}
                  </span>
                </span>
              </>
            )}
          </div>
          <div className="nx-linha__x ig-eixo-x" aria-hidden>
            {geo.eixo.map((i) => (
              <span key={i} style={{ left: `${geo.xPct[i]}%` }}>
                {formatarData(todasDatas[i])}
              </span>
            ))}
          </div>
        </div>
        <span />
      </div>
    </div>
  );
});

/* ---------------- Colunas para cima e para baixo (entraram × saíram) ---------------- */

/** Colunas divergentes: o que entrou sobe, o que saiu desce, a partir da linha do zero. Dias abertos ficam claros. */
export const IgColunasSaldo = memo(function IgColunasSaldo({
  dias,
  formatarData,
  rotulo,
  rotuloCima = "Novos",
  rotuloBaixo = "Saíram",
}: {
  dias: { data: string; cima: number | null; baixo: number | null; aberto?: boolean }[];
  formatarData: (d: string) => string;
  rotulo: string;
  rotuloCima?: string;
  rotuloBaixo?: string;
}) {
  const max = Math.max(1, ...dias.map((d) => Math.max(d.cima ?? 0, d.baixo ?? 0)));
  const teto = tetoRedondo(max);
  const resumo = dias.map((d) => `${formatarData(d.data)}: ${rotuloCima.toLowerCase()} ${d.cima ?? "sem dado"}, ${rotuloBaixo.toLowerCase()} ${d.baixo ?? "sem dado"}${d.aberto ? " (em fechamento)" : ""}`).join("; ");
  const marcas = Math.min(5, dias.length);
  const eixo: number[] = dias.length <= 1 ? [0] : Array.from({ length: marcas }, (_, k) => Math.round((k * (dias.length - 1)) / (marcas - 1)));
  return (
    <figure className="ig-saldo" style={{ margin: 0 }} role="img" aria-label={rotulo}>
      <figcaption className="sr-only">
        {rotulo}: {resumo}
      </figcaption>
      <div className="nx-linha__legenda" aria-hidden>
        <span>
          <i style={{ background: "var(--b2)" }} />
          {rotuloCima}
        </span>
        <span>
          <i style={{ background: "var(--dn)" }} />
          {rotuloBaixo}
        </span>
        {dias.some((d) => d.aberto) && (
          <span>
            <i style={{ background: "var(--b5)" }} />
            Em fechamento
          </span>
        )}
      </div>
      <div className="ig-saldo__area" aria-hidden>
        <div className="ig-saldo__y">
          <span>{teto.toLocaleString("pt-BR")}</span>
          <span>0</span>
          <span>−{teto.toLocaleString("pt-BR")}</span>
        </div>
        <div className="ig-saldo__plot" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
          {dias.map((d, i) => (
            <div key={d.data} className={`ig-saldo__dia${d.aberto ? " ig-saldo__dia--aberto" : ""}`} title={`${formatarData(d.data)}: +${d.cima ?? "—"} / −${d.baixo ?? "—"}`}>
              <span className="ig-saldo__cima">
                <i style={{ height: `${((d.cima ?? 0) / teto) * 100}%`, ["--i" as string]: i } as CSSProperties} />
              </span>
              <span className="ig-saldo__baixo">
                <i style={{ height: `${((d.baixo ?? 0) / teto) * 100}%`, ["--i" as string]: i } as CSSProperties} />
              </span>
            </div>
          ))}
        </div>
        <span />
        <div className="nx-linha__x ig-eixo-x">
          {eixo.map((i) => (
            <span key={i} style={{ left: `${dias.length <= 1 ? 50 : ((i + 0.5) / dias.length) * 100}%` }}>
              {formatarData(dias[i].data)}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
});

/* ---------------- Vitrine (pódio de posts) ---------------- */

/** Cartões com a miniatura grande, a posição e o número que decidiu o lugar (prancha: lista de destaque). */
export function IgVitrine({
  itens,
}: {
  itens: { id: string; href?: string | null; imagem: ReactNode; titulo: ReactNode; valor: ReactNode; rotulo: ReactNode; extra?: ReactNode }[];
}) {
  return (
    <ol className="ig-vitrine">
      {itens.map((x, k) => {
        const corpo = (
          <>
            <span className="ig-vitrine__img">
              {x.imagem}
              <span className={`nx-rank ig-vitrine__pos${k === 0 ? " nx-rank--1" : ""}`} aria-label={`${k + 1}º lugar`}>
                {k + 1}
              </span>
            </span>
            <span className="ig-vitrine__corpo">
              <span className="ig-vitrine__titulo">{x.titulo}</span>
              <span className="ig-vitrine__num">
                <b>{x.valor}</b>
                <small>{x.rotulo}</small>
              </span>
              {x.extra && <span className="ig-vitrine__extra">{x.extra}</span>}
            </span>
          </>
        );
        return (
          <li key={x.id} className="nx-sobe" style={{ "--i": k } as CSSProperties}>
            {x.href ? (
              <a className="ig-vitrine__item" href={x.href} target="_blank" rel="noreferrer">
                {corpo}
              </a>
            ) : (
              <div className="ig-vitrine__item">{corpo}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- Mais análises (recolhido) ---------------- */

/** Bloco recolhido com as análises de apoio: o botão diz quantas são; abrir não muda nenhum número. */
export function IgMaisAnalises({ id, titulo, resumo, children, inicialAberto = false }: { id: string; titulo: string; resumo: string; children: ReactNode; inicialAberto?: boolean }) {
  const [aberto, setAberto] = useState(inicialAberto);
  return (
    <section id={id} className="ig-mais">
      <button type="button" className="ig-mais__botao" aria-expanded={aberto} aria-controls={`${id}-corpo`} onClick={() => setAberto((v) => !v)}>
        <span className="min-w-0 flex-1">
          <b>{titulo}</b>
          <small>{resumo}</small>
        </span>
        <span className="nx-sq" aria-hidden>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: aberto ? "rotate(180deg)" : undefined }}>
            <path d="M6 9l6 6l6 -6" />
          </svg>
        </span>
      </button>
      {aberto && (
        <div id={`${id}-corpo`} className="ig-mais__corpo">
          {children}
        </div>
      )}
    </section>
  );
}
