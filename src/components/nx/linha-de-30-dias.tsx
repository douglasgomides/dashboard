import { memo, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  ALTURA,
  LARGURA,
  caminhoDaArea,
  caminhoDaLinha,
  comparacaoComAMedia,
  indiceMaisProximo,
  mediaDaSerie,
  nomeDoDia,
  pontosDaLinha,
  resumoDaSerie,
  temSerieParaDesenhar,
  textoDoDia,
  yDaMedia,
} from "@/lib/linha-30-dias";
import "@/styles/nexo-linha-30-dias.css";

// Linha de 30 dias dos cartões (sketch 002, variante A, aprovada pelo João em 12/11/2026): área, média tracejada, dica "dia: valor"
// com ponto ao passar o dedo ou o mouse, e o toque fixa embaixo "dia: valor · ▲/▼ N% vs média do mês". Só apresentação: a série diária
// já está em memória na tela, a peça não busca nem grava nada (CHAM-07). Dia sem dado é buraco (nunca 0). Teclado: o gráfico é um
// slider (setas, Home, End andam pelos dias; Enter e Espaço fixam). O sinal ▲/▼ sempre vai no texto, nunca só na cor.

export interface SerieDiaria {
  /** Nome do que a série mede, em minúsculas ("investido", "conversas iniciadas"). Entra no resumo para leitor de tela. */
  rotulo: string;
  /** AAAA-MM-DD, um por dia, em ordem e sem falha (use `serieContinua` quando a tela só tem os dias que vieram). */
  datas: readonly string[];
  /** Mesmo tamanho de `datas`; null = dia sem dado (buraco). */
  valores: readonly (number | null)[];
  /** Formata o valor na dica e no resumo (padrão: inteiro pt-BR). */
  formatar?: (n: number) => string;
}

export const NxLinhaDe30Dias = memo(function NxLinhaDe30Dias({ rotulo, datas, valores, formatar }: SerieDiaria) {
  const idArea = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const [foco, setFoco] = useState<number | null>(null);
  const [fixo, setFixo] = useState<number | null>(null);

  const n = Math.min(datas.length, valores.length);
  const desenha = n >= 2 && temSerieParaDesenhar(valores);
  const geometria = useMemo(() => {
    const v = valores.slice(0, n);
    const pontos = pontosDaLinha(v, LARGURA, ALTURA);
    return { pontos, linha: caminhoDaLinha(pontos), area: caminhoDaArea(pontos, ALTURA), yMedia: yDaMedia(v, ALTURA), media: mediaDaSerie(v) };
  }, [valores, n]);
  const resumo = useMemo(() => resumoDaSerie({ rotulo, datas: datas.slice(0, n), valores: valores.slice(0, n), formatar }), [rotulo, datas, valores, n, formatar]);

  if (!desenha) return null;

  const indiceDe = (e: PointerEvent<HTMLDivElement>) => {
    const r = caixa.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return indiceMaisProximo((e.clientX - r.left) / r.width, n);
  };
  const noDedo = (e: PointerEvent<HTMLDivElement>) => setFoco(indiceDe(e));
  const noTeclado = (e: KeyboardEvent<HTMLDivElement>) => {
    const atual = foco ?? fixo ?? n - 1;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") setFoco(Math.min(n - 1, atual + 1));
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setFoco(Math.max(0, atual - 1));
    else if (e.key === "Home") setFoco(0);
    else if (e.key === "End") setFoco(n - 1);
    else if (e.key === "Enter" || e.key === " ") setFixo(atual);
    else return;
    e.preventDefault();
  };

  const atual = foco ?? fixo ?? n - 1;
  const pontoDoFoco = foco != null ? geometria.pontos[foco] : null;
  const leFixo = fixo != null ? comparacaoComAMedia(valores[fixo] ?? null, geometria.media, n) : null;

  return (
    <div className="nx-linha30" data-peca="linha-30-dias" role="group" aria-label={resumo}>
      <div
        ref={caixa}
        className="nx-linha30__area"
        role="slider"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={atual + 1}
        aria-valuetext={textoDoDia(datas[atual], valores[atual] ?? null, formatar)}
        onPointerDown={noDedo}
        onPointerMove={noDedo}
        onPointerLeave={() => setFoco(null)}
        onPointerCancel={() => setFoco(null)}
        onClick={(e) => setFixo(indiceDe(e as unknown as PointerEvent<HTMLDivElement>))}
        onKeyDown={noTeclado}
        onBlur={() => setFoco(null)}
      >
        <svg className="nx-linha30__svg" viewBox={`0 0 ${LARGURA} ${ALTURA}`} preserveAspectRatio="none" aria-hidden focusable="false">
          {geometria.yMedia != null && <line className="nx-linha30__media" x1={0} x2={LARGURA} y1={geometria.yMedia} y2={geometria.yMedia} vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />}
          {geometria.area && <path id={idArea} className="nx-linha30__preenchimento" d={geometria.area} />}
          <path className="nx-linha30__tracado" d={geometria.linha} fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
        {foco != null && (
          <>
            {pontoDoFoco && <span className="nx-linha30__ponto" aria-hidden style={{ left: `${(pontoDoFoco.x / LARGURA) * 100}%`, top: `${(pontoDoFoco.y / ALTURA) * 100}%` }} />}
            <span
              className="nx-linha30__dica"
              aria-hidden
              data-lado={foco <= (n - 1) * 0.15 ? "esquerda" : foco >= (n - 1) * 0.85 ? "direita" : "meio"}
              style={{ left: `${(foco / (n - 1)) * 100}%`, top: `${((pontoDoFoco?.y ?? ALTURA / 2) / ALTURA) * 100}%` }}
            >
              {textoDoDia(datas[foco], valores[foco] ?? null, formatar)}
            </span>
          </>
        )}
      </div>
      <p className="nx-linha30__fixo" aria-live="polite" hidden={fixo == null}>
        {fixo != null && (
          <>
            <b>{nomeDoDia(datas[fixo])}</b>: {valores[fixo] == null ? "sem dado" : (formatar ?? ((v: number) => Math.round(v).toLocaleString("pt-BR")))(valores[fixo] as number)}
            {leFixo && ` · ${leFixo.texto}`}
          </>
        )}
      </p>
    </div>
  );
});
