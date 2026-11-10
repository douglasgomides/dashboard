import { memo, type CSSProperties, type ReactNode } from "react";
import { IconeTabler } from "@/components/icons/tabler";
import type { NomeIcone } from "@/lib/registro-de-telas";
import { NxTag, type NxTom } from "./base";
import "@/styles/nexo-comercial.css";

// Peças das telas Comercial e pacientes no desenho do painel (prancha): número clicável, barras de etapa, leitura em
// linguagem simples, aviso curto e o "como é calculado" recolhido. Só apresentação: recebem o texto e o número prontos.

const ordem = (i?: number): CSSProperties | undefined => (i == null ? undefined : ({ "--i": i } as CSSProperties));

/** Ícone Tabler no tamanho do ladrilho de 28 px (traço 1,7). */
export const icT = (nome: NomeIcone) => <IconeTabler nome={nome} tamanho={17} traco={1.7} />;

/** Variação já calculada pela tela. `bom` diz se a direção é boa (verde) ou ruim (vermelho); igual fica cinza. */
export interface CmVariacao {
  direcao: "cima" | "baixo" | "igual";
  texto: string;
  contexto: string;
  bom?: boolean;
}

/** Pergunta que a tela responde, o período e as ações (sincronizar, copiar). O título da tela já está na casca. */
export function CmTopo({ pergunta, detalhe, acoes }: { pergunta: ReactNode; detalhe?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="cm-topo">
      <div className="min-w-0">
        <p className="cm-topo__pergunta">{pergunta}</p>
        {detalhe && <p className="cm-topo__detalhe">{detalhe}</p>}
      </div>
      {acoes && <div className="cm-topo__acoes">{acoes}</div>}
    </header>
  );
}

/**
 * Cartão de número no desenho do .nx-kpi. O valor leva .ws-metric-value (os testes acham o primeiro número por ela).
 * Com `onAbrir`, o cartão inteiro vira um botão (camada por cima), e o "i" continua clicável à parte.
 */
export const CmKpi = memo(function CmKpi({
  icone,
  rotulo,
  valor,
  variacao,
  nota,
  info,
  extra,
  onAbrir,
  aberto,
  rotuloAbrir,
  apagado,
  i,
}: {
  icone: NomeIcone;
  rotulo: string;
  valor: ReactNode;
  variacao?: CmVariacao | null;
  nota?: ReactNode;
  info?: ReactNode;
  extra?: ReactNode;
  onAbrir?: () => void;
  aberto?: boolean;
  rotuloAbrir?: string;
  /** Sem dado: o valor aparece em cinza e menor ("Sem dado", "Não medido"). */
  apagado?: boolean;
  i?: number;
}) {
  const tom: NxTom = !variacao || variacao.direcao === "igual" ? "g" : variacao.bom === false ? "dn" : "up";
  return (
    <div className={`nx-kpi nx-sobe cm-kpi${onAbrir ? " cm-kpi--abre" : ""}${aberto ? " cm-kpi--aberto" : ""}`} style={ordem(i)}>
      {onAbrir && (
        <button type="button" className="cm-kpi__alvo" onClick={onAbrir} aria-expanded={aberto} aria-label={rotuloAbrir ?? `${rotulo}: ver quem são`} />
      )}
      <div className="nx-kpi__topo">
        <span className="nx-tile" aria-hidden>
          {icT(icone)}
        </span>
        <span className="nx-kpi__rotulo">{rotulo}</span>
        {info && <span className="cm-kpi__info">{info}</span>}
      </div>
      <div className="nx-kpi__corpo">
        <span className={`nx-kpi__valor ws-metric-value${apagado ? " cm-kpi__valor--apagado" : ""}`}>{valor}</span>
        {variacao && (
          <span className="nx-kpi__meta">
            <NxTag tom={tom} seta={variacao.direcao === "igual" ? undefined : variacao.direcao}>
              {variacao.texto}
            </NxTag>
            <small>{variacao.contexto}</small>
          </span>
        )}
      </div>
      {nota && <span className="nx-kpi__nota cm-kpi__nota">{nota}</span>}
      {extra}
    </div>
  );
});

export interface CmBarra {
  chave: string;
  rotulo: string;
  valor: number | null;
  /** Valor já formatado; sem dado, o texto que explica ("Não medido"). */
  texto: string;
  /** Texto pequeno à direita do valor (percentual, valor em reais). */
  apoio?: string;
  nota?: ReactNode;
  variacao?: CmVariacao | null;
  icone?: NomeIcone;
  tom?: "b" | "up" | "dn" | "or" | "g";
}

/**
 * Barras horizontais de etapa (prancha .hb), com a escala na maior barra. Com `onAbrir`, cada linha vira botão.
 * A lista inteira tem nome acessível e cada linha lê "rótulo, valor".
 */
export function CmBarras({
  itens,
  rotulo,
  onAbrir,
  aberta,
  max: maxDado,
}: {
  itens: CmBarra[];
  rotulo: string;
  onAbrir?: (chave: string) => void;
  aberta?: string | null;
  max?: number;
}) {
  const max = maxDado ?? Math.max(1, ...itens.map((b) => b.valor ?? 0));
  return (
    <ul className="cm-barras" aria-label={rotulo}>
      {itens.map((b, k) => {
        const pct = b.valor == null ? 0 : Math.max(b.valor > 0 ? 2 : 0, Math.min(100, (b.valor / max) * 100));
        const corpo = (
          <>
            <span className="cm-barra__linha">
              <span className="cm-barra__rotulo">
                {b.icone && <span className="cm-barra__ic" aria-hidden>{icT(b.icone)}</span>}
                {b.rotulo}
              </span>
              <span className="cm-barra__valor">
                <b className={b.valor == null ? "cm-barra__sem" : undefined}>{b.texto}</b>
                {b.apoio && <small>{b.apoio}</small>}
                {b.variacao && (
                  <NxTag tom={b.variacao.direcao === "igual" ? "g" : b.variacao.bom === false ? "dn" : "up"} seta={b.variacao.direcao === "igual" ? undefined : b.variacao.direcao} titulo={b.variacao.contexto}>
                    {b.variacao.texto}
                  </NxTag>
                )}
              </span>
            </span>
            <span className={`cm-trilho${b.tom ? ` cm-trilho--${b.tom}` : ""}`} aria-hidden>
              <i style={{ width: `${pct}%`, ...(ordem(k) as object) }} />
            </span>
            {b.nota && <span className="cm-barra__nota">{b.nota}</span>}
          </>
        );
        return (
          <li key={b.chave}>
            {onAbrir && b.valor != null ? (
              <button type="button" className={`cm-barra cm-barra--botao${aberta === b.chave ? " cm-barra--aberta" : ""}`} onClick={() => onAbrir(b.chave)} aria-expanded={aberta === b.chave}>
                {corpo}
              </button>
            ) : (
              <div className="cm-barra">{corpo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Leitura em linguagem simples (o que mudou, o que fazer). Cada item com o sinal na forma, não só na cor. */
export function CmLeitura({
  titulo = "O que fazer com isso",
  subtitulo,
  itens,
  id,
}: {
  titulo?: string;
  subtitulo?: ReactNode;
  itens: { texto: ReactNode; tom?: "up" | "down" | "flat" | "atencao" }[];
  id?: string;
}) {
  const lista = itens.filter((x) => x.texto);
  if (!lista.length) return null;
  const sinal = (t?: string) => (t === "up" ? "▲" : t === "down" ? "▼" : t === "atencao" ? "!" : "●");
  return (
    <section className="nx-card nx-sobe cm-leitura" aria-labelledby={id ? `${id}-t` : undefined} aria-label={id ? undefined : titulo}>
      <header className="nx-card__head">
        <div className="nx-card__titulo">
          <span className="nx-tile" aria-hidden>
            {icT("bulb")}
          </span>
          <div className="min-w-0">
            <h2 id={id ? `${id}-t` : undefined}>{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
        </div>
      </header>
      <ul className="cm-leitura__lista">
        {lista.map((x, k) => (
          <li key={k}>
            <span className={`cm-leitura__sinal cm-leitura__sinal--${x.tom ?? "flat"}`} aria-hidden>
              {sinal(x.tom)}
            </span>
            <span>{x.texto}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Aviso curto. "critico" muda a leitura de tudo e fica sempre visível no topo, compacto; "atencao" e "info" são
 * secundários. O texto longo vai em `detalhe`, recolhido.
 */
export function CmAviso({ tom = "info", titulo, children, detalhe }: { tom?: "critico" | "atencao" | "info"; titulo?: ReactNode; children?: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className={`cm-aviso cm-aviso--${tom}`} role={tom === "critico" ? "note" : undefined}>
      <span className="cm-aviso__ic" aria-hidden>
        {tom === "info" ? "i" : "!"}
      </span>
      <div className="min-w-0 flex-1">
        <p>
          {titulo && <b>{titulo} </b>}
          {children}
        </p>
        {detalhe && (
          <details className="cm-aviso__mais">
            <summary>Entender</summary>
            <div>{detalhe}</div>
          </details>
        )}
      </div>
    </div>
  );
}

/** "Como é calculado": método, fonte e limitações, recolhido. Nada é apagado, só fica um toque abaixo. */
export function CmMetodo({ titulo = "Como é calculado", children, aberto }: { titulo?: ReactNode; children: ReactNode; aberto?: boolean }) {
  return (
    <details className="cm-metodo" open={aberto}>
      <summary>
        <span className="cm-metodo__i" aria-hidden>
          i
        </span>
        {titulo}
        <span className="cm-metodo__seta" aria-hidden>
          {<IconeTabler nome="chevron-down" tamanho={16} />}
        </span>
      </summary>
      <div className="cm-metodo__corpo">{children}</div>
    </details>
  );
}

/** Bloco recolhido grande (tabelas e listas completas), no desenho do cartão. */
export function CmRecolhido({ titulo, subtitulo, children, id }: { titulo: ReactNode; subtitulo?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <details className="cm-recolhido nx-sobe" id={id}>
      <summary>
        <span className="min-w-0">
          <b>{titulo}</b>
          {subtitulo && <small>{subtitulo}</small>}
        </span>
        <span className="nx-sq" aria-hidden>
          <IconeTabler nome="chevron-down" tamanho={18} />
        </span>
      </summary>
      <div className="cm-recolhido__corpo">{children}</div>
    </details>
  );
}
