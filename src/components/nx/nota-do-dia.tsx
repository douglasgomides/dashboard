import { useEffect, useId, useState } from "react";
import { FAIXAS_DA_NOTA, REGRA_DA_NOTA, type FatorDaNota, type NotaDoDia } from "@/lib/leitura/nota-do-dia";

// A nota do dia da Hoje (Phase 03.1.1.1, D-03): um anel de 0 a 100 que é um botão e, ao tocar, abre o que ajudou (▲), o que puxou para
// baixo (▼), os sinais sem dado ("Falta dado" com o motivo), as faixas e a regra escrita ("Regra do Nexo", "não garante resultado").
// Só apresentação: a nota e os sinais vêm prontos de src/lib/leitura/nota-do-dia.ts, nada é buscado, gravado ou enviado e todo texto é
// texto do React. O tom nunca vai só na cor: o número, a palavra do veredito e os sinais ▲ ▼ dizem o mesmo. Arco e contagem só sem
// reduced-motion. O painel é irmão do anel (a faixa do veredito o põe numa linha própria, ver nexo-hoje.css).

/** Raio do anel no viewBox de 200 e o comprimento da circunferência (2πr), para o arco. */
const RAIO = 84;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

const TOM_DA_FAIXA = (nota: number) => (nota >= 85 ? "otimo" : nota >= 70 ? "bom" : nota >= 50 ? "atencao" : "ruim");

/** Conta de 0 até a nota em 1 s, só para quem não pediu menos movimento; senão mostra a nota direto. */
function useContagem(alvo: number | null): number | null {
  const [valor, setValor] = useState<number | null>(alvo);
  useEffect(() => {
    if (alvo == null) {
      setValor(null);
      return;
    }
    const mover = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    if (!mover) {
      setValor(alvo);
      return;
    }
    let quadro = 0;
    let t0: number | null = null;
    const passo = (ts: number) => {
      t0 = t0 ?? ts;
      const k = Math.min(1, (ts - t0) / 1000);
      setValor(Math.round(alvo * (1 - Math.pow(1 - k, 3))));
      if (k < 1) quadro = requestAnimationFrame(passo);
    };
    setValor(0);
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo]);
  return valor;
}

function Sinal({ f }: { f: FatorDaNota }) {
  const tom = f.pontos > 50 ? "bom" : f.pontos < 50 ? "ruim" : "igual";
  return (
    <li className="nx-nota__sinal" data-tom={tom} data-fator={f.id}>
      <span className="nx-nota__sinal-nome">{f.rotulo}</span>
      <span className="nx-nota__sinal-pontos" aria-label={`${f.pontos} pontos`}>
        {f.pontos}
      </span>
      <span className="nx-nota__sinal-linha" title={f.linha}>
        {f.linha}
      </span>
      <span className="nx-nota__trilho" aria-hidden>
        <i style={{ width: `${Math.max(3, f.pontos)}%` }} />
      </span>
    </li>
  );
}

export interface NxNotaDoDiaProps {
  nota: NotaDoDia;
}

export function NxNotaDoDia({ nota }: NxNotaDoDiaProps) {
  const [aberto, setAberto] = useState(false);
  const painel = useId();
  const valor = useContagem(nota.nota);
  const faixa = nota.nota != null ? TOM_DA_FAIXA(nota.nota) : "sem";
  const ajudaram = nota.fatores.filter((f) => f.pontos > 50);
  const puxaram = nota.fatores.filter((f) => f.pontos < 50);
  const iguais = nota.fatores.filter((f) => f.pontos === 50);
  const atual = nota.nota != null ? FAIXAS_DA_NOTA.find((_, k) => ["Ruim", "Atenção", "Bom", "Ótimo"][k] === nota.palavra) : undefined;
  return (
    <div className="nx-nota" data-peca="nota-do-dia" data-faixa={faixa}>
      <button
        type="button"
        className="nx-nota__anel"
        aria-expanded={aberto}
        aria-controls={painel}
        title="Toque para ver o que puxou a nota"
        onClick={() => setAberto((a) => !a)}
      >
        <svg className="nx-nota__svg" viewBox="0 0 200 200" aria-hidden focusable="false">
          <circle className="nx-nota__fundo" cx="100" cy="100" r={RAIO} fill="none" strokeWidth="16" />
          {nota.nota != null && (
            <circle
              className="nx-nota__arco"
              cx="100"
              cy="100"
              r={RAIO}
              fill="none"
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={CIRCUNFERENCIA}
              strokeDashoffset={CIRCUNFERENCIA * (1 - nota.nota / 100)}
            />
          )}
        </svg>
        <span className="nx-nota__centro">
          {nota.nota != null ? (
            <>
              <b className="nx-nota__numero" aria-label={`Nota ${nota.nota} de 100`}>
                {valor ?? nota.nota}
              </b>
              <small className="nx-nota__de">de 100</small>
            </>
          ) : (
            <b className="nx-nota__falta">Falta dado</b>
          )}
          <span className="nx-nota__ver">Ver o porquê</span>
        </span>
      </button>

      <div id={painel} className="nx-nota__painel" hidden={!aberto} data-peca="nota-fatores">
        <div className="nx-nota__colunas">
          <div className="nx-nota__grupo">
            <h3 className="nx-nota__titulo nx-nota__titulo--bom">▲ O que ajudou</h3>
            {ajudaram.length > 0 ? (
              <ul className="nx-nota__lista">
                {ajudaram.map((f) => (
                  <Sinal key={f.id} f={f} />
                ))}
              </ul>
            ) : (
              <p className="nx-nota__nada">{nota.nota == null ? "Sem sinal com dado." : "Nenhum sinal melhorou."}</p>
            )}
          </div>
          <div className="nx-nota__grupo">
            <h3 className="nx-nota__titulo nx-nota__titulo--ruim">▼ O que puxou para baixo</h3>
            {puxaram.length > 0 ? (
              <ul className="nx-nota__lista">
                {puxaram.map((f) => (
                  <Sinal key={f.id} f={f} />
                ))}
              </ul>
            ) : (
              <p className="nx-nota__nada">{nota.nota == null ? "Sem sinal com dado." : "Nenhum sinal piorou."}</p>
            )}
          </div>
        </div>
        {iguais.length > 0 && (
          <div className="nx-nota__grupo">
            <h3 className="nx-nota__titulo">= Igual a antes</h3>
            <ul className="nx-nota__lista">
              {iguais.map((f) => (
                <Sinal key={f.id} f={f} />
              ))}
            </ul>
          </div>
        )}
        {nota.faltaDado.length > 0 && (
          <div className="nx-nota__grupo" data-peca="nota-falta-dado">
            <h3 className="nx-nota__titulo">Falta dado</h3>
            <ul className="nx-nota__lista">
              {nota.faltaDado.map((f) => (
                <li key={f.id} className="nx-nota__falta-item" data-fator={f.id}>
                  <span className="nx-nota__sinal-nome">{f.rotulo}</span>
                  <span className="nx-nota__falta-motivo">{`Falta dado: ${f.motivo}`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="nx-nota__faixas" aria-label="Faixas da nota">
          {FAIXAS_DA_NOTA.map((fx) => (
            <li key={fx} className="nx-nota__faixa" data-atual={fx === atual ? "" : undefined} aria-current={fx === atual ? "true" : undefined}>
              {fx}
            </li>
          ))}
        </ul>
        <div className="nx-nota__regra">
          {REGRA_DA_NOTA.map((frase) => (
            <p key={frase}>{frase}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
