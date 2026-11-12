import { memo, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { FaixaDoNormal, MarcaDoDia } from "@/lib/faixa-do-normal";
import "@/styles/nexo-dias-com-faixa.css";

// Barras por dia com a faixa do normal da PRÓPRIA clínica (Phase 03.1.1.1, plano 06, piloto de Atendimento aprovado): uma barra por dia, o
// retângulo cinza da faixa do normal ("normal: 10-13") e, sobre cada dia fora da faixa, um ▲ (acima) ou ▼ (abaixo) escrito: a cor nunca
// vai sozinha. Só apresentação: a série e a faixa já vêm calculadas (src/lib/faixa-do-normal.ts); a peça não busca nem grava nada
// (CHAM-07) e nunca compara com outra clínica (D-02). Dia sem dado é buraco (nenhuma barra, nunca 0). Teclado como a linha de 30 dias: o
// gráfico é um slider (setas, Home e End andam pelos dias; Enter e Espaço escolhem). Só tokens de nexo-system.css.

export interface NxDiasComFaixaProps {
  /** O que a série mede, em minúsculas ("conversas"). Entra no resumo para leitor de tela. */
  rotulo: string;
  /** AAAA-MM-DD, um por dia, em ordem e sem falha (use `serieContinua` quando a tela só tem os dias que vieram). */
  datas: readonly string[];
  /** Mesmo tamanho de `datas`; null = dia sem dado (buraco). */
  valores: readonly (number | null)[];
  /** A faixa do normal. null = poucos dias para saber o normal: as barras aparecem sem faixa e a peça diz "Falta dado". */
  faixa: FaixaDoNormal | null;
  /** "acima", "abaixo" ou "normal" de cada dia (foraDaFaixa). Sem isto a peça calcula a partir da faixa. */
  marcas?: readonly (MarcaDoDia | null)[];
  /** Dias extras para marcar (por exemplo dias de orçamento baixo): a barra fica listrada. */
  destaque?: readonly number[];
  /** O que o destaque significa, escrito na legenda. */
  legendaDoDestaque?: string;
  /** Dia escolhido (índice em `datas`). */
  selecionado?: number | null;
  /** Chamado ao tocar, clicar ou apertar Enter num dia. */
  aoSelecionar?: (i: number) => void;
  /** Formata o valor da dica e do resumo (padrão: inteiro pt-BR). */
  formatar?: (n: number) => string;
  /** Versão baixa, sem eixo nem legenda, para dentro de "Por quê?". */
  compacto?: boolean;
}

const formatoPadrao = (n: number) => Math.round(n).toLocaleString("pt-BR");
const ddmm = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const comValor = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
const TEXTO_DA_MARCA: Record<MarcaDoDia, string> = { acima: "acima do normal", abaixo: "abaixo do normal", normal: "dentro do normal" };

/** De quantos em quantos dias o eixo escreve a data (poucos dias: todos ou de dois em dois; um mês: de 7 em 7). */
const passoDoEixo = (n: number) => (n <= 8 ? 1 : n <= 16 ? 2 : 7);

export const NxDiasComFaixa = memo(function NxDiasComFaixa({ rotulo, datas, valores, faixa, marcas, destaque, legendaDoDestaque, selecionado, aoSelecionar, formatar = formatoPadrao, compacto }: NxDiasComFaixaProps) {
  const caixa = useRef<HTMLDivElement>(null);
  const [foco, setFoco] = useState<number | null>(null);
  const n = Math.min(datas.length, valores.length);

  const calculo = useMemo(() => {
    const v = valores.slice(0, n);
    const maior = Math.max(0, ...v.filter(comValor), faixa?.hi ?? 0);
    const teto = maior > 0 ? maior : 1;
    const dentro = v.map((x, i) => {
      if (marcas && marcas[i] !== undefined) return marcas[i] ?? null;
      if (!faixa || !comValor(x)) return null;
      return x > faixa.hi ? ("acima" as const) : x < faixa.lo ? ("abaixo" as const) : ("normal" as const);
    });
    return { teto, marcas: dentro, acima: dentro.filter((m) => m === "acima").length, abaixo: dentro.filter((m) => m === "abaixo").length };
  }, [valores, n, faixa, marcas]);
  const medidos = useMemo(() => valores.slice(0, n).filter(comValor).length, [valores, n]);
  const marcados = useMemo(() => new Set(destaque ?? []), [destaque]);

  if (n < 1 || medidos < 1) return null;

  const resumo = [
    `${rotulo} por dia, ${ddmm(datas[0])} a ${ddmm(datas[n - 1])}`,
    faixa ? `normal de ${formatar(faixa.lo)} a ${formatar(faixa.hi)}; ${calculo.acima} ${calculo.acima === 1 ? "dia" : "dias"} acima e ${calculo.abaixo} abaixo` : "sem faixa do normal: poucos dias medidos",
  ].join(": ");

  const indiceDe = (e: PointerEvent<HTMLDivElement> | { clientX: number }) => {
    const r = caixa.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
  };
  const textoDoDia = (i: number) => {
    const v = valores[i];
    return `dia ${ddmm(datas[i])}: ${comValor(v) ? formatar(v) : "sem dado"}`;
  };
  const atual = foco ?? selecionado ?? n - 1;
  const noTeclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") setFoco(Math.min(n - 1, atual + 1));
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setFoco(Math.max(0, atual - 1));
    else if (e.key === "Home") setFoco(0);
    else if (e.key === "End") setFoco(n - 1);
    else if ((e.key === "Enter" || e.key === " ") && aoSelecionar) aoSelecionar(atual);
    else return;
    e.preventDefault();
  };

  const pct = (v: number) => Math.max(0, Math.min(100, (v / calculo.teto) * 100));
  const passo = passoDoEixo(n);
  const alturaDoFoco = foco != null && comValor(valores[foco]) ? pct(valores[foco] as number) : 0;

  return (
    <div className="nx-dias" data-peca="dias-com-faixa" data-compacto={compacto ? "" : undefined} role="group" aria-label={resumo}>
      <div
        ref={caixa}
        className="nx-dias__area"
        role="slider"
        aria-label={`${rotulo} por dia, com a faixa do normal`}
        tabIndex={0}
        aria-orientation="horizontal"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={atual + 1}
        aria-valuetext={`${textoDoDia(atual)}${calculo.marcas[atual] ? `, ${TEXTO_DA_MARCA[calculo.marcas[atual] as MarcaDoDia]}` : ""}`}
        onPointerMove={(e) => setFoco(indiceDe(e))}
        onPointerLeave={() => setFoco(null)}
        onPointerCancel={() => setFoco(null)}
        onClick={(e) => aoSelecionar?.(indiceDe(e))}
        onKeyDown={noTeclado}
        onBlur={() => setFoco(null)}
      >
        {faixa && (
          <div className="nx-dias__faixa" data-peca="faixa-do-normal" style={{ bottom: `${pct(faixa.lo)}%`, height: `${Math.max(0, pct(faixa.hi) - pct(faixa.lo))}%` }}>
            <span className="nx-dias__faixa-rotulo">{`normal: ${formatar(faixa.lo)}-${formatar(faixa.hi)}`}</span>
          </div>
        )}
        <div className="nx-dias__barras">
          {Array.from({ length: n }, (_, i) => {
            const v = valores[i];
            const marca = calculo.marcas[i];
            return (
              <div key={datas[i]} className="nx-dias__barra" data-i={i} data-marca={marca ?? undefined} data-sem-dado={comValor(v) ? undefined : ""} data-destaque={marcados.has(i) ? "" : undefined} data-sel={selecionado === i ? "" : undefined}>
                {comValor(v) && (
                  <>
                    <i style={{ height: `${pct(v)}%` }} />
                    {(marca === "acima" || marca === "abaixo") && (
                      <span className="nx-dias__marca" aria-hidden style={{ bottom: `calc(${pct(v)}% + 2px)` }}>
                        {marca === "acima" ? "▲" : "▼"}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        {foco != null && (
          <span
            className="nx-dias__dica"
            aria-hidden
            data-lado={foco <= (n - 1) * 0.12 ? "esquerda" : foco >= (n - 1) * 0.88 ? "direita" : "meio"}
            style={{ left: `${((foco + 0.5) / n) * 100}%`, bottom: `calc(${alturaDoFoco}% + 18px)` }}
          >
            {textoDoDia(foco)}
          </span>
        )}
      </div>
      {!compacto && (
        <div className="nx-dias__eixo" aria-hidden>
          {Array.from({ length: n }, (_, i) => (
            <span key={datas[i]}>{i % passo === 0 ? ddmm(datas[i]) : ""}</span>
          ))}
        </div>
      )}
      {!faixa && (
        <p className="nx-dias__falta" data-falta-dado>
          Falta dado: poucos dias para saber o normal.
        </p>
      )}
      {!compacto && (
        <ul className="nx-dias__legenda" aria-label="Legenda">
          {faixa && (
            <li>
              <i data-tipo="faixa" aria-hidden />
              faixa do normal
            </li>
          )}
          <li>
            <i data-tipo="acima" aria-hidden />
            ▲ acima do normal
          </li>
          <li>
            <i data-tipo="abaixo" aria-hidden />
            ▼ abaixo do normal
          </li>
          <li>
            <i data-tipo="normal" aria-hidden />
            dia normal
          </li>
          {marcados.size > 0 && legendaDoDestaque && (
            <li>
              <i data-tipo="destaque" aria-hidden />
              {legendaDoDestaque}
            </li>
          )}
        </ul>
      )}
    </div>
  );
});
