import { memo, type CSSProperties, type ReactNode } from "react";
import { AvatarGerado } from "@/components/avatar-gerado";
import "./nx.css";

// Peças de apresentação do Nexo no desenho da prancha "painel": cartão, cabeçalho de seção, número com variação,
// etiqueta, barra horizontal e linha de lista. Nenhuma busca dado nem calcula número: recebem o texto pronto da tela.

type Nivel = 2 | 3;
const ordem = (i?: number): CSSProperties | undefined => (i == null ? undefined : ({ "--i": i } as CSSProperties));

/** Cartão branco de borda fina (prancha .box). `rotulo` vira o nome acessível da região quando não há título. */
export function NxCard({
  titulo,
  subtitulo,
  icone,
  acao,
  nivel = 3,
  id,
  rotulo,
  i,
  className = "",
  children,
}: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  icone?: ReactNode;
  acao?: ReactNode;
  nivel?: Nivel;
  id?: string;
  rotulo?: string;
  /** Posição na entrada escalonada (55 ms por item). */
  i?: number;
  className?: string;
  children?: ReactNode;
}) {
  const H = nivel === 2 ? "h2" : "h3";
  const tituloId = id ? `${id}-titulo` : undefined;
  return (
    <section
      id={id}
      className={`nx-card nx-sobe ${className}`}
      style={ordem(i)}
      aria-label={rotulo}
      aria-labelledby={!rotulo && tituloId && titulo ? tituloId : undefined}
    >
      {(titulo || acao) && (
        <header className="nx-card__head">
          <div className="nx-card__titulo">
            {icone && <span className="nx-tile" aria-hidden>{icone}</span>}
            <div className="min-w-0">
              {titulo && <H id={tituloId}>{titulo}</H>}
              {subtitulo && <p>{subtitulo}</p>}
            </div>
          </div>
          {acao && <div className="nx-card__acao">{acao}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Título de bloco solto, fora de cartão. */
export function NxSectionHeader({
  titulo,
  subtitulo,
  acao,
  nivel = 2,
  id,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acao?: ReactNode;
  nivel?: Nivel;
  id?: string;
}) {
  const H = nivel === 2 ? "h2" : "h3";
  return (
    <header className="nx-sec">
      <div className="min-w-0">
        <H id={id}>{titulo}</H>
        {subtitulo && <p>{subtitulo}</p>}
      </div>
      {acao}
    </header>
  );
}

const SETA_CIMA = (
  <svg viewBox="0 0 10 10" aria-hidden>
    <path d="M5 1l4 6H1z" />
  </svg>
);
const SETA_BAIXO = (
  <svg viewBox="0 0 10 10" aria-hidden>
    <path d="M5 9L1 3h8z" />
  </svg>
);

export type NxTom = "up" | "dn" | "or" | "b" | "g" | "gl";

/** Etiqueta pequena (prancha .chip). Com `seta`, mostra o triângulo de subida ou queda: nunca só a cor. */
export function NxTag({ tom = "g", seta, icone, children, titulo }: { tom?: NxTom; seta?: "cima" | "baixo"; icone?: ReactNode; children: ReactNode; titulo?: string }) {
  return (
    <span className={`nx-tag nx-tag--${tom}`} title={titulo}>
      {seta === "cima" ? SETA_CIMA : seta === "baixo" ? SETA_BAIXO : icone}
      {children}
    </span>
  );
}

/**
 * Número de destaque (prancha .kpi). O valor leva a classe ws-metric-value, que os testes e o CSS de hoje usam para
 * achar o primeiro número da tela. `variacao` é o texto já calculado pela tela; sem ele, `nota` aparece embaixo.
 */
export const NxKpi = memo(function NxKpi({
  icone,
  rotulo,
  valor,
  variacao,
  nota,
  info,
  extra,
  titulo,
  i,
}: {
  icone: ReactNode;
  rotulo: string;
  valor: ReactNode;
  variacao?: { sobe: boolean; percentual: string; contexto: string } | null;
  nota?: ReactNode;
  info?: ReactNode;
  extra?: ReactNode;
  titulo?: string;
  i?: number;
}) {
  return (
    <div className="nx-kpi nx-sobe" style={ordem(i)} title={titulo}>
      <div className="nx-kpi__topo">
        <span className="nx-tile" aria-hidden>
          {icone}
        </span>
        <span className="nx-kpi__rotulo">{rotulo}</span>
        {info}
      </div>
      {extra}
      <div className="nx-kpi__corpo">
        <span className="nx-kpi__valor ws-metric-value">{valor}</span>
        {variacao && (
          <span className="nx-kpi__meta">
            <NxTag tom={variacao.sobe ? "up" : "dn"} seta={variacao.sobe ? "cima" : "baixo"}>
              {variacao.sobe ? "+" : "−"}
              {variacao.percentual}
            </NxTag>
            <small>{variacao.contexto}</small>
          </span>
        )}
      </div>
      {!variacao && nota && <span className="nx-kpi__nota">{nota}</span>}
    </div>
  );
});

/** Linha de barra horizontal (prancha .hb): rótulo, valor à direita e trilho com a parte preenchida. */
export function NxHBar({ rotulo, valor, pct, icone, i }: { rotulo: ReactNode; valor: ReactNode; pct: number; icone?: ReactNode; i?: number }) {
  const largura = Math.max(3, Math.min(100, pct));
  return (
    <div className="nx-hb">
      <div className="nx-hb__linha">
        <span>
          {icone}
          {rotulo}
        </span>
        <em>{valor}</em>
      </div>
      <div className="nx-trk" aria-hidden>
        <i style={{ width: `${largura}%`, ...(ordem(i) as object) }} />
        <u />
      </div>
    </div>
  );
}

/**
 * Linha de lista (prancha .ci): avatar gerado (ou a miniatura que vier em `inicio`), título, linha de apoio e o fim.
 * Com `href` vira link; com `onClick`, botão. Sem estado próprio, para listas longas não pesarem.
 */
export const NxListRow = memo(function NxListRow({
  avatarNome,
  inicio,
  titulo,
  sub,
  fim,
  href,
  ativa,
  externo = true,
}: {
  avatarNome?: string;
  inicio?: ReactNode;
  titulo: ReactNode;
  sub?: ReactNode;
  fim?: ReactNode;
  href?: string;
  ativa?: boolean;
  externo?: boolean;
}) {
  const corpo = (
    <>
      {inicio ?? (avatarNome ? <span className="nx-row__av"><AvatarGerado nome={avatarNome} tamanho={40} /></span> : null)}
      <span className="nx-row__corpo">
        <span className="nx-row__titulo" title={typeof titulo === "string" ? titulo : undefined}>
          {titulo}
        </span>
        {sub && <span className="nx-row__sub">{sub}</span>}
      </span>
      {fim && <span className="nx-row__fim">{fim}</span>}
    </>
  );
  const cls = `nx-row${ativa ? " nx-row--ativa" : ""}`;
  if (href)
    return (
      <a className={cls} href={href} {...(externo ? { target: "_blank", rel: "noreferrer" } : {})}>
        {corpo}
      </a>
    );
  return <div className={cls}>{corpo}</div>;
});

/** Número grande em azul com a legenda ao lado (prancha "+21% vs. semana anterior"). */
export function NxDestaque({ valor, legenda }: { valor: ReactNode; legenda: ReactNode }) {
  return (
    <div className="nx-destaque">
      <b>{valor}</b>
      <small>{legenda}</small>
    </div>
  );
}
