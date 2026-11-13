import { memo, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import "@/styles/nexo-regua-dos-dias.css";

// Régua dos próprios dias (Phase 03.1.1.1, plano 09, piloto de Anúncios aprovado): cada dia da clínica é um ponto na escala do custo por
// conversa, com a linha tracejada do custo de ANTES da própria clínica e o marcador "Agora". À esquerda o custo é mais barato, à direita mais
// caro, escritos nas pontas (a cor nunca vai sozinha). Só apresentação: os dias já vêm calculados (custoPorDia), a peça não busca nem grava
// nada (CHAM-07) e nunca compara com outra clínica (D-02: só os dias desta clínica). Todo texto sai como texto do React. Teclado: setas, Home e
// End andam entre os pontos (um só ponto entra na ordem de Tab); Enter e Espaço escolhem. Só tokens de nexo-system.css.

export interface NxReguaDosDiasProps {
  /** Os dias com custo (dia AAAA-MM-DD e custo por conversa). Em qualquer ordem. */
  dias: readonly { dia: string; custo: number }[];
  /** Custo por conversa do período anterior da própria clínica. null = sem comparação (a peça diz "Falta dado"). */
  custoAntes: number | null;
  /** Custo por conversa do período atual. null = sem medida. */
  custoAgora: number | null;
  /** Formata um custo (padrão: R$ com centavos abaixo de R$ 10). */
  formatar?: (n: number) => string;
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const formatoPadrao = (v: number) => {
  const casas = Math.abs(v) >= 10 || v === 0 ? 0 : 2;
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
};

/** O menor "número bonito" (1, 2 ou 5 vezes uma potência de 10) que cabe o valor: o teto da escala. */
function tetoBonito(v: number): number {
  if (!(v > 0)) return 1;
  const pot = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * pot >= v) return m * pot;
  return 10 * pot;
}

/** Quanto um dia custa em relação ao custo de antes, em palavras. */
function contraAntes(custo: number, antes: number | null): string {
  if (antes == null) return "";
  if (Math.abs(custo - antes) / antes < 0.03) return " · igual ao custo de antes";
  return custo < antes ? " · mais barato que antes" : " · mais caro que antes";
}

export const NxReguaDosDias = memo(function NxReguaDosDias({ dias, custoAntes, custoAgora, formatar = formatoPadrao }: NxReguaDosDiasProps) {
  const base = useId();
  const faixa = useRef<HTMLDivElement>(null);
  const ordenados = useMemo(() => [...dias].sort((a, b) => a.custo - b.custo || a.dia.localeCompare(b.dia)), [dias]);
  const n = ordenados.length;
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [foco, setFoco] = useState(0);
  // No celular as listas começam recolhidas (a régua de 1,5 tela não cabe com elas à vista); no computador estão sempre à vista.
  const [listasAbertas, setListasAbertas] = useState(false);
  const painelDasListas = `${base}-listas`;

  const escala = useMemo(() => {
    const meio = n ? ordenados[Math.floor(n / 2)].custo : 0;
    const referencia = Math.max(custoAntes ?? 0, custoAgora ?? 0, meio * 2);
    const teto = tetoBonito(referencia);
    return { teto, marcas: [0, 0.25, 0.5, 0.75, 1].map((f) => f * teto) };
  }, [ordenados, n, custoAntes, custoAgora]);

  if (n < 1) return null;

  const pos = (v: number) => (Math.min(v, escala.teto) / escala.teto) * 100;
  const maisBaratos = custoAntes != null ? ordenados.filter((d) => d.custo < custoAntes * 0.97).length : null;
  const titulo = maisBaratos != null ? `${maisBaratos} de ${n} dias saíram mais baratos que o seu custo de antes` : "O custo por conversa de cada dia seu";
  const leitura =
    escolhido != null
      ? `${ddmm(ordenados[escolhido].dia)}: ${formatar(ordenados[escolhido].custo)} por conversa${contraAntes(ordenados[escolhido].custo, custoAntes)} · ${escolhido + 1}º dia mais barato de ${n}`
      : `Agora: ${custoAgora != null ? `${formatar(custoAgora)} por conversa` : "sem medida"}. ${custoAntes != null ? `Antes: ${formatar(custoAntes)}.` : "Falta dado: sem o custo de antes."} Toque nos pontos.`;

  // Os 5 dias mais baratos e os 3 mais caros (sem repetir dia quando são poucos).
  const baratos = ordenados.slice(0, Math.min(5, n));
  const caros = n > 5 ? ordenados.slice(Math.max(5, n - 3)).reverse() : [];

  const noTeclado = (e: KeyboardEvent<HTMLButtonElement>, k: number) => {
    let novo = k;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") novo = Math.min(n - 1, k + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") novo = Math.max(0, k - 1);
    else if (e.key === "Home") novo = 0;
    else if (e.key === "End") novo = n - 1;
    else return;
    e.preventDefault();
    setFoco(novo);
    faixa.current?.querySelector<HTMLButtonElement>(`[data-k="${novo}"]`)?.focus();
  };

  const agoraPos = custoAgora != null ? pos(custoAgora) : null;

  return (
    <section className="nx-regua" data-peca="regua-dos-dias" aria-labelledby={`${base}-t`}>
      <h3 id={`${base}-t`} className="nx-regua__titulo">
        {titulo}
      </h3>
      <p className="nx-regua__sub">Cada ponto é um dia seu. A linha tracejada é o seu custo de antes. Toque num ponto.</p>

      <div ref={faixa} className="nx-regua__escala" role="group" aria-label="Custo por conversa de cada dia, do mais barato ao mais caro">
        <span className="nx-regua__eixo" aria-hidden />
        {escala.marcas.map((m, i) => (
          <span key={i} className="nx-regua__marca" aria-hidden style={{ left: `${pos(m)}%` }} data-ponta={i === 0 ? "esquerda" : i === escala.marcas.length - 1 ? "direita" : undefined} data-quarto={i === 1 || i === 3 ? "" : undefined}>
            {i === escala.marcas.length - 1 ? `${formatar(m)}+` : formatar(m)}
          </span>
        ))}
        {custoAntes != null && (
          <>
            <span className="nx-regua__antes" aria-hidden style={{ left: `${pos(custoAntes)}%` }} />
            <span className="nx-regua__antes-rotulo" style={{ left: `clamp(48px, ${pos(custoAntes)}%, calc(100% - 48px))` }}>
              antes {formatar(custoAntes)}
            </span>
          </>
        )}
        {ordenados.map((d, k) => (
          <button
            key={d.dia}
            type="button"
            className="nx-regua__ponto"
            data-k={k}
            data-sel={escolhido === k ? "" : undefined}
            aria-label={`${ddmm(d.dia)}: ${formatar(d.custo)} por conversa`}
            aria-pressed={escolhido === k}
            tabIndex={foco === k ? 0 : -1}
            style={{ left: `${pos(d.custo)}%` }}
            onFocus={() => setFoco(k)}
            onClick={() => setEscolhido((atual) => (atual === k ? null : k))}
            onKeyDown={(e) => noTeclado(e, k)}
          />
        ))}
        {agoraPos != null && custoAgora != null && (
          <>
            <span className="nx-regua__agora" aria-hidden style={{ left: `${agoraPos}%` }} />
            <span className="nx-regua__agora-rotulo" data-lado={agoraPos > 62 ? "direita" : "esquerda"} style={{ left: `${agoraPos}%` }}>
              Agora · {formatar(custoAgora)}
            </span>
          </>
        )}
      </div>
      <div className="nx-regua__pontas" aria-hidden>
        <span>◀ mais barato</span>
        <span>mais caro ▶</span>
      </div>
      <p className="nx-regua__leitura" aria-live="polite" data-escolhido={escolhido != null ? "" : undefined}>
        {leitura}
      </p>

      <h4 className="nx-regua__lista-titulo">Seus dias mais baratos e mais caros</h4>
      <button type="button" className="nx-regua__lista-botao" aria-expanded={listasAbertas} aria-controls={painelDasListas} onClick={() => setListasAbertas((a) => !a)}>
        Seus dias mais baratos e mais caros
        <span aria-hidden>{listasAbertas ? "▴" : "▾"}</span>
      </button>
      <div id={painelDasListas} className="nx-regua__listas" data-peca="regua-dias-lista" data-aberta={listasAbertas ? "" : undefined}>
        <div className="nx-regua__lista">
          <p className="nx-regua__legenda-da-lista">{baratos.length === 1 ? "O mais barato" : `Os ${baratos.length} mais baratos`}</p>
          <ol className="nx-regua__linhas">
            {baratos.map((d, k) => (
              <li key={d.dia} className="nx-regua__linha" data-tipo="barato">
                <span className="nx-regua__pos">{k + 1}.</span>
                <span className="nx-regua__data">{ddmm(d.dia)}</span>
                <span className="nx-regua__trilha" aria-hidden>
                  <i style={{ width: `${pos(d.custo)}%` }} />
                </span>
                <span className="nx-regua__valor">{formatar(d.custo)}</span>
              </li>
            ))}
          </ol>
        </div>
        {caros.length > 0 && (
          <div className="nx-regua__lista">
            <p className="nx-regua__legenda-da-lista">{caros.length === 1 ? "O mais caro" : `Os ${caros.length} mais caros`}</p>
            <ol className="nx-regua__linhas">
              {caros.map((d, k) => (
                <li key={d.dia} className="nx-regua__linha" data-tipo="caro">
                  <span className="nx-regua__pos">{n - k}.</span>
                  <span className="nx-regua__data">{ddmm(d.dia)}</span>
                  <span className="nx-regua__trilha" aria-hidden>
                    <i style={{ width: `${pos(d.custo)}%` }} />
                  </span>
                  <span className="nx-regua__valor">{formatar(d.custo)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
});
