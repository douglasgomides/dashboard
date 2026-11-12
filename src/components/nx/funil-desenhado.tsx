import { Fragment, memo, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  descricaoDaEtapa,
  larguraDaEtapa,
  larguraDoAnterior,
  maiorDaEscala,
  poligonoDaLigacao,
  resumoAcessivel,
  textoDaPassagem,
  textoDaVariacao,
  type EtapaDesenhada,
  type FunilDesenhado,
} from "@/lib/funil-desenhado";
import { NxAviso } from "./blocos";
import { NxBarras } from "./cartoes";
import "@/styles/nexo-funil-desenhado.css";

// Funil desenhado (sketch 001, variante A2, aprovada pelo João em 12/11/2026). Só apresentação: recebe o funil pronto de
// src/lib/funil-desenhado.ts, não busca nem grava nada (CHAM-07) e nunca refaz a conta. Cada etapa é um botão que abre a gaveta
// (dialog nativo, o mesmo padrão do app-shell) com a quebra da etapa, o período anterior e, se a tela quiser, uma ação.

export interface NxFunilDesenhadoProps {
  /** Nome do gráfico para leitor de tela ("Funil comercial do período"). */
  titulo: string;
  funil: FunilDesenhado;
  /** Como o período anterior se chama ("mês antes" ou "período anterior"). */
  rotuloDoAnterior?: string;
  /** Faixa opcional entre o topo e as etapas (a Jornada põe "Antes da conversa"). */
  antes?: ReactNode;
  /** Ação da gaveta ("Ver quem são"). `fechar` fecha a gaveta. */
  acaoDaEtapa?: (etapa: EtapaDesenhada, fechar: () => void) => ReactNode;
}

export const NxFunilDesenhado = memo(function NxFunilDesenhado({ titulo, funil, rotuloDoAnterior = "mês antes", antes, acaoDaEtapa }: NxFunilDesenhadoProps) {
  const [aberta, setAberta] = useState<number | null>(null);
  const idDaGaveta = useId();
  const gaveta = useRef<HTMLDialogElement>(null);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const quemAbriu = useRef<number | null>(null);

  const etapas = funil.etapas;
  const maior = useMemo(() => maiorDaEscala(etapas), [etapas]);
  const resumo = useMemo(() => resumoAcessivel(titulo, funil, rotuloDoAnterior), [titulo, funil, rotuloDoAnterior]);
  const temVariacao = etapas.some((e) => e.variacao);

  const abrir = useCallback((i: number) => {
    quemAbriu.current = i;
    setAberta(i);
  }, []);
  const fechar = useCallback(() => setAberta(null), []);

  // Abre e fecha o dialog nativo conforme a etapa escolhida. O corpo da página não rola enquanto a gaveta está aberta.
  useEffect(() => {
    const dialog = gaveta.current;
    if (!dialog) return;
    if (aberta != null) {
      if (!dialog.open) dialog.showModal();
      const overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = overflow;
      };
    }
    if (dialog.open) dialog.close();
  }, [aberta]);

  // Esc, o botão ✕ e o clique no fundo terminam aqui: o foco volta para o botão da etapa que abriu.
  const aoFechar = useCallback(() => {
    setAberta(null);
    const i = quemAbriu.current;
    if (i != null) botoes.current[i]?.focus({ preventScroll: true });
  }, []);

  const etapaAberta = aberta != null ? etapas[aberta] : null;
  const maiorPerda = funil.maiorPerda;

  return (
    <figure className="nx-funil-d" data-peca="funil-desenhado" style={{ margin: 0 }}>
      <figcaption className="sr-only">{resumo}</figcaption>

      {(maiorPerda || funil.foraDeOrdem || temVariacao) && (
        <div className="nx-funil-d__topo">
          {maiorPerda ? (
            <button type="button" className="nx-funil-d__perda" aria-haspopup="dialog" onClick={() => abrir(maiorPerda.para)}>
              <span aria-hidden>▼</span>
              <span>
                Maior perda: {etapas[maiorPerda.de].nome} → {etapas[maiorPerda.para].nome} ({maiorPerda.texto})
              </span>
              <span aria-hidden>↗</span>
              <span className="sr-only">. Abrir detalhe</span>
            </button>
          ) : (
            funil.aviso && (
              <NxAviso tom="atencao" titulo="Atenção:">
                {funil.aviso}
              </NxAviso>
            )
          )}
          {temVariacao && (
            <p className="nx-funil-d__legenda">
              <span>
                <i aria-hidden />
                faixa = este período
              </span>
              <span>
                <i data-tracejado aria-hidden />
                tracejado = {rotuloDoAnterior}
              </span>
            </p>
          )}
        </div>
      )}

      {antes}

      <div className="nx-funil-d__grade">
        {etapas.map((e, i) => {
          const largura = larguraDaEtapa(e.valor, maior);
          const anterior = larguraDoAnterior(e, maior);
          return (
            <Fragment key={e.id}>
              {i > 0 && <Ligacao cima={etapas[i - 1]} baixo={e} perda={maiorPerda?.para === i} maior={maior} />}
              <button
                type="button"
                ref={(el) => {
                  botoes.current[i] = el;
                }}
                className="nx-funil-d__etapa"
                aria-haspopup="dialog"
                aria-label={`${descricaoDaEtapa(e, rotuloDoAnterior)}. Abrir detalhe`}
                data-aberta={aberta === i ? "" : undefined}
                onClick={() => abrir(i)}
              >
                <span className="nx-funil-d__rotulo" aria-hidden>
                  <span className="nx-funil-d__nome">{e.nome}</span>
                  {e.variacao && (
                    <span className="nx-funil-d__variacao" data-sobe={e.variacao.sobe ? "" : undefined}>
                      {textoDaVariacao(e.variacao)}
                      <span className="nx-funil-d__vs"> vs {rotuloDoAnterior}</span>
                    </span>
                  )}
                </span>
                <span className="nx-funil-d__trilho" aria-hidden>
                  {anterior != null && <span className="nx-funil-d__anterior" style={{ width: `${anterior}%` }} />}
                  {e.valor == null ? <span className="nx-funil-d__toco">{e.texto}</span> : <span className="nx-funil-d__faixa" style={{ width: `${largura}%` }} />}
                </span>
                <span className="nx-funil-d__numero" data-falta={e.valor == null ? "" : undefined} aria-hidden>
                  {e.valor == null ? "—" : `${e.estimado ? "≈ " : ""}${e.texto}`}
                </span>
              </button>
            </Fragment>
          );
        })}
      </div>

      <dialog
        ref={gaveta}
        className="nx-funil-d__gaveta"
        aria-labelledby={`${idDaGaveta}-titulo`}
        onClose={aoFechar}
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) fechar();
        }}
      >
        <div className="nx-funil-d__corpo">
          <button type="button" className="nx-funil-d__fechar" aria-label="Fechar" onClick={fechar}>
            ✕
          </button>
          {etapaAberta && (
            <>
              <h3 id={`${idDaGaveta}-titulo`} className="nx-funil-d__titulo">
                {etapaAberta.nome}: {etapaAberta.estimado && etapaAberta.valor != null ? "≈ " : ""}
                {etapaAberta.texto}
              </h3>
              {etapaAberta.variacao && (
                <p className="nx-funil-d__texto" data-sobe={etapaAberta.variacao.sobe ? "" : undefined} data-desce={etapaAberta.variacao.sobe ? undefined : ""}>
                  {textoDaVariacao(etapaAberta.variacao)} vs {rotuloDoAnterior}
                </p>
              )}
              {etapaAberta.valor == null && etapaAberta.motivo && <p className="nx-funil-d__texto">{etapaAberta.motivo}</p>}
              {etapaAberta.explicacao && <p className="nx-funil-d__texto">{etapaAberta.explicacao}</p>}
              {etapaAberta.valor != null && etapaAberta.passagem && (textoDaPassagem(etapaAberta.passagem) ?? etapaAberta.passagem.sem) && (
                <p className="nx-funil-d__texto">{textoDaPassagem(etapaAberta.passagem) ? `Da etapa de cima: ${textoDaPassagem(etapaAberta.passagem)}.` : etapaAberta.passagem.sem}</p>
              )}
              <NxBarras barras={etapaAberta.detalhe} rotulo={`Quebra de ${etapaAberta.nome}`} />
              {acaoDaEtapa && <div className="nx-funil-d__acoes">{acaoDaEtapa(etapaAberta, fechar)}</div>}
            </>
          )}
        </div>
      </dialog>
    </figure>
  );
});

/** A ligação em trapézio entre duas faixas. Sem % (populações diferentes) ou com vizinha sem dado: faixa reta e neutra, sem pílula. */
function Ligacao({ cima, baixo, perda, maior }: { cima: EtapaDesenhada; baixo: EtapaDesenhada; perda: boolean; maior: number }) {
  const w1 = larguraDaEtapa(cima.valor, maior);
  const w2 = larguraDaEtapa(baixo.valor, maior);
  const p = baixo.passagem;
  const texto = cima.valor != null && baixo.valor != null ? textoDaPassagem(p) : null;
  if (!texto) {
    const w = Math.min(w1, w2);
    return (
      <div className="nx-funil-d__ligacao" data-neutra="" aria-hidden>
        <div className="nx-funil-d__miolo">
          <div className="nx-funil-d__forma" style={{ clipPath: poligonoDaLigacao(w, w) }} />
        </div>
      </div>
    );
  }
  return (
    <div className="nx-funil-d__ligacao" data-perda={perda ? "" : undefined} aria-hidden>
      <div className="nx-funil-d__miolo">
        <div className="nx-funil-d__forma" style={{ clipPath: poligonoDaLigacao(w1, w2) }} />
        <span className="nx-funil-d__pct">{perda ? `▼ ${texto}` : texto}</span>
      </div>
    </div>
  );
}
