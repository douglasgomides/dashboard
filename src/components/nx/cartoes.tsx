import { memo, type ReactNode } from "react";
import { IconeTabler } from "@/components/icons/tabler";
import { LinkDoRegistro } from "@/components/menu-equipe";
import type { NomeIcone, TelaDoRegistro } from "@/lib/registro-de-telas";
import type { DateRangeState } from "@/lib/date-range";
import type { BarraDoFato } from "@/lib/leitura/tipos";
import { NxLinhaDe30Dias, type SerieDiaria } from "@/components/nx/linha-de-30-dias";
import "@/styles/nexo-cartoes.css";

// Peças do D-07 (Phase 3.1.1, referência visual aprovada pelo João em 10/11/2026) para cartões e ações. Toda tela no molde
// e a Hoje usam estas mesmas peças: ícone num círculo, número grande com a legenda embaixo, variação em pílula azul-clara
// (sem cor de bom ou ruim) e a ação como pílula com a seta escura. Só apresentação e só tokens; nenhuma peça busca dado nem
// grava (CHAM-07: o botão só abre ou navega). O desenho só vale dentro de .nx-pagina; o SAP não usa estas peças.

type DestinoDoRegistro = { tela: TelaDoRegistro; clientId: string | null; dateRange?: DateRangeState };

const SETA = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <path d="M5 12h14" />
    <path d="M13 6l6 6l-6 6" />
  </svg>
);

export interface NxAcaoPilulaProps {
  /** Frase do passo, que já começa pelo verbo da lista ("Ligar para os pacientes sem retorno."). */
  frase: string;
  /** Número que sustenta o passo, logo depois da frase. */
  numero?: string;
  /** Texto só para leitor de tela do botão da seta ("Ver os detalhes"). */
  rotuloDaSeta?: string;
  /** A seta navega para outra tela do registro (Hoje: a aba de origem). */
  para?: DestinoDoRegistro;
  /** A seta só abre um lugar da própria página (aba: os Detalhes). Nunca envia nada. */
  aoAbrir?: () => void;
}

/** Pílula azul-clara com o verbo e o número, mais o botão redondo escuro com a seta. Sem `para` nem `aoAbrir`, não há seta. */
export const NxAcaoPilula = memo(function NxAcaoPilula({ frase, numero, rotuloDaSeta = "Abrir", para, aoAbrir }: NxAcaoPilulaProps) {
  return (
    <span className="nx-acao-pilula" data-peca="acao-pilula">
      <span className="nx-acao-pilula__texto">
        {frase}
        {numero && (
          <>
            {" "}
            <strong className="nx-acao-pilula__num">{numero}</strong>
          </>
        )}
      </span>
      {para ? (
        <LinkDoRegistro tela={para.tela} clientId={para.clientId} dateRange={para.dateRange} className="nx-acao-pilula__seta">
          {SETA}
          <span className="sr-only">{rotuloDaSeta}</span>
        </LinkDoRegistro>
      ) : aoAbrir ? (
        <button type="button" className="nx-acao-pilula__seta" onClick={aoAbrir}>
          {SETA}
          <span className="sr-only">{rotuloDaSeta}</span>
        </button>
      ) : null}
    </span>
  );
});

/** Botão redondo ↗ do canto do cartão. Só quando o cartão abre outro lugar. */
export function NxBotaoAbrir({ tela, clientId, dateRange, rotulo }: DestinoDoRegistro & { rotulo: string }) {
  return (
    <LinkDoRegistro tela={tela} clientId={clientId} dateRange={dateRange} className="nx-botao-abrir">
      <span aria-hidden>↗</span>
      <span className="sr-only">{`Abrir ${rotulo}`}</span>
    </LinkDoRegistro>
  );
}

/** Variação em pílula azul-clara ("−18% vs período anterior"): o texto já vem pronto da tela; a seta só mostra a direção. */
export function NxPilulaVariacao({ texto, sobe }: { texto: string; sobe?: boolean }) {
  return (
    <span className="nx-pilula-variacao">
      {sobe != null && (
        <span aria-hidden className="nx-pilula-variacao__seta">
          {sobe ? "↑" : "↓"}
        </span>
      )}
      {texto}
    </span>
  );
}

/**
 * Barras de comparação (03.1.1, "menos texto, mais visual"): uma linha por barra com o rótulo, a barra e o valor. A largura é a
 * `fracao` que a regra calculou (a peça só desenha). Cada linha tem nome acessível próprio ("Post de foto: 1.230 pessoas"), porque
 * o da meta diz "% atingido" e isso seria falso numa comparação. O que faltou (`faltou`) é listrado, nunca cheio.
 */
export function NxBarras({ barras, rotulo }: { barras: readonly BarraDoFato[]; rotulo?: string }) {
  if (barras.length === 0) return null;
  return (
    <ul className="nx-barras" data-barras aria-label={rotulo}>
      {barras.map((b) => {
        const fracao = Math.max(0, Math.min(1, b.fracao));
        return (
          <li key={b.rotulo} className="nx-barras__item" data-faltou={b.faltou ? "" : undefined}>
            <span className="nx-barras__linha" role="img" aria-label={`${b.rotulo}: ${b.exibicao}`}>
              <span className="nx-barras__rotulo" aria-hidden>
                {b.rotulo}
              </span>
              <span className={b.faltou ? "nx-meta-tracejada__barra nx-barras__barra nx-faltou" : "nx-meta-tracejada__barra nx-barras__barra"} aria-hidden>
                <span className="nx-meta-tracejada__feito" style={{ width: `${Math.round(fracao * 100)}%` }} />
              </span>
              <span className="nx-barras__valor" aria-hidden>
                {b.exibicao}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export interface NxCartaoNumeroProps {
  /** Nome do ícone do registro ou um ícone já pronto (lucide) da tela. */
  icone: NomeIcone | ReactNode;
  titulo: string;
  /** Subtítulo curto com o número de contexto ("período · 24 publicações"). */
  subtitulo?: string;
  valor: ReactNode;
  /** Legenda embaixo do número ("agendamentos na semana"). */
  legenda?: ReactNode;
  /** Variação já calculada pela tela, em pílula azul-clara. */
  variacao?: { texto: string; sobe?: boolean } | null;
  /** O ↗ do canto, só quando o cartão abre outro lugar. */
  abrir?: DestinoDoRegistro & { rotulo: string };
  /** Abaixo da meta medida ou não confirmado: laranja e o texto dito (nunca só a cor). */
  abaixoDaMeta?: "abaixo da meta" | "não confirmado";
  /** O dado faltou: fundo listrado e "Sem dado" (nunca 0). */
  semMedida?: boolean;
  /** Barra de 8 px com a linha tracejada da meta; fracao é o quanto da meta foi atingido (0 a 1 ou mais). */
  meta?: { rotulo: string; fracao: number };
  /** No máximo uma ação por cartão. */
  acao?: ReactNode;
  info?: ReactNode;
  /** Peça própria da tela logo abaixo do número (por exemplo a barrinha de progresso). */
  extra?: ReactNode;
  /**
   * Série diária que a tela já tem em memória: desenha a linha de 30 dias (sketch 002, A) logo depois da pílula de variação.
   * Dia sem dado vai como null (buraco, nunca 0). Não desenha com `semMedida` nem com menos de 2 dias com valor.
   */
  serie?: SerieDiaria;
}

export const NxCartaoNumero = memo(function NxCartaoNumero({ icone, titulo, subtitulo, valor, legenda, variacao, abrir, abaixoDaMeta, semMedida, meta, acao, info, extra, serie }: NxCartaoNumeroProps) {
  const classe = ["nx-cartao", abaixoDaMeta ? "nx-abaixo-da-meta" : "", semMedida ? "nx-faltou" : ""].filter(Boolean).join(" ");
  const fracao = meta ? Math.max(0, Math.min(1, meta.fracao)) : 0;
  return (
    <section className={classe} data-peca="cartao-numero" aria-label={titulo}>
      <header className="nx-cartao__topo">
        <span className="nx-cartao__icone" aria-hidden>
          {typeof icone === "string" ? <IconeTabler nome={icone as NomeIcone} tamanho={17} traco={1.7} /> : icone}
        </span>
        <div className="nx-cartao__titulos">
          <h3 className="nx-cartao__titulo">{titulo}</h3>
          {subtitulo && <p className="nx-cartao__sub">{subtitulo}</p>}
        </div>
        {info}
        {abrir && <NxBotaoAbrir {...abrir} />}
      </header>
      <p className="nx-numero">
        <span className="nx-numero__valor">{semMedida ? "Sem dado" : valor}</span>
        {legenda && <span className="nx-numero__legenda">{legenda}</span>}
      </p>
      {extra}
      {abaixoDaMeta && <p className="nx-cartao__aviso">{abaixoDaMeta}</p>}
      {variacao && <NxPilulaVariacao texto={variacao.texto} sobe={variacao.sobe} />}
      {serie && !semMedida && <NxLinhaDe30Dias {...serie} />}
      {meta && (
        <div className="nx-meta-tracejada" role="img" aria-label={`${meta.rotulo}: ${Math.round(fracao * 100)}% atingido`}>
          <span className="nx-meta-tracejada__barra">
            <span className="nx-meta-tracejada__feito" style={{ width: `${Math.round(fracao * 100)}%` }} />
          </span>
          <span className="nx-meta-tracejada__rotulo">{meta.rotulo}</span>
        </div>
      )}
      {acao}
    </section>
  );
});
