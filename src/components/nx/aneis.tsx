import { Fragment, useId, useState } from "react";
import type { AnelDoPeriodo, ChaveDoFunil } from "@/lib/leitura/cinco-resultados";
import type { BarraDoFato } from "@/lib/leitura/tipos";
import { NxBarras } from "./cartoes";
import { NxSelo } from "./cinco-segundos";
import { NxLinhaDe30Dias, type SerieDiaria } from "./linha-de-30-dias";
import "@/styles/nexo-cinco-resultados.css";

// Os 3 anéis de Resultados da clínica (Phase 03.1.1.1, plano 03; aprovados pelo João em 12/11/2026): Conversas, Agendaram e Fecharam,
// cada um contra o MESMO período anterior da própria clínica. Anel cheio = igual ao de antes; a volta mais escura = passou de antes; o
// risquinho marca o "igual". Não é a rosca de partes do molde (proibida em NxPizza/NxMedidor): aqui o anel mede progresso contra o
// próprio passado, e o João aprovou o desenho. Só apresentação: a regra (cinco-resultados.ts) já calculou fração, volta, selo e passagem.
// Tocar num anel abre UMA área embaixo com a linha de 30 dias da etapa e as barras "agora" e "antes"; tocar de novo fecha. O sinal
// ▲/▼ vai sempre no texto, nunca só na cor. Nada aqui busca ou grava dado (CHAM-07).

const RAIO = 80;
const VOLTA_INTEIRA = 2 * Math.PI * RAIO;

const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");

export interface NxAneisProps {
  aneis: readonly AnelDoPeriodo[];
  /** A série diária de cada etapa (a que a tela já tem em memória). Sem série, a área do anel mostra só as barras. */
  series: Partial<Record<ChaveDoFunil, SerieDiaria>>;
  /** "30 dias antes". */
  rotuloDoAnterior: string;
}

function Anel({ a }: { a: AnelDoPeriodo }) {
  return (
    <svg className="nx-aneis__svg" viewBox="0 0 200 200" aria-hidden focusable="false" data-chave={a.chave}>
      <circle className="nx-aneis__trilho" cx="100" cy="100" r={RAIO} fill="none" strokeWidth="22" />
      {a.fracao > 0 && (
        <circle
          className="nx-aneis__arco"
          cx="100"
          cy="100"
          r={RAIO}
          fill="none"
          strokeWidth="22"
          strokeLinecap="round"
          strokeDasharray={VOLTA_INTEIRA}
          strokeDashoffset={VOLTA_INTEIRA * (1 - a.fracao)}
          style={{ ["--anel-total" as string]: VOLTA_INTEIRA }}
        />
      )}
      {a.volta > 0 && (
        <circle
          className="nx-aneis__volta"
          cx="100"
          cy="100"
          r={RAIO}
          fill="none"
          strokeWidth="22"
          strokeLinecap="round"
          strokeDasharray={VOLTA_INTEIRA}
          strokeDashoffset={VOLTA_INTEIRA * (1 - a.volta)}
          style={{ ["--anel-total" as string]: VOLTA_INTEIRA }}
        />
      )}
      <line className="nx-aneis__marca" x1={100 + RAIO - 15} x2={100 + RAIO + 15} y1="100" y2="100" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function NxAneis({ aneis, series, rotuloDoAnterior }: NxAneisProps) {
  const [aberto, setAberto] = useState<ChaveDoFunil | null>(null);
  const painel = useId();
  const doAnel = aneis.find((a) => a.chave === aberto) ?? null;
  const serie = doAnel ? series[doAnel.chave] : undefined;

  const barras: BarraDoFato[] =
    doAnel && doAnel.somaAtual != null && doAnel.somaAntes != null
      ? (() => {
          const maior = Math.max(doAnel.somaAtual, doAnel.somaAntes, 1);
          return [
            { rotulo: "Agora", exibicao: inteiro(doAnel.somaAtual), fracao: doAnel.somaAtual / maior },
            { rotulo: rotuloDoAnterior, exibicao: inteiro(doAnel.somaAntes), fracao: doAnel.somaAntes / maior },
          ];
        })()
      : [];

  return (
    <section className="nx-aneis" data-peca="aneis" aria-label="Conversas, agendaram e fecharam contra o período anterior">
      <div className="nx-aneis__fila">
        {aneis.map((a, k) => {
          const aria = `${a.rotulo}: ${a.valor != null ? inteiro(a.valor) : "falta dado"}. ${a.variacao ? a.variacao.texto.replace("▲", "subiu").replace("▼", "caiu").replace("= igual", "igual") + " contra o período anterior" : "Sem período anterior para comparar"}.`;
          return (
            <Fragment key={a.chave}>
              {k > 0 && (
                <div className="nx-aneis__passagem" data-peca="passagem">
                  <span aria-hidden className="nx-aneis__seta">
                    →
                  </span>
                  {a.passagemAteAqui && (
                    <span className="nx-aneis__passagem-texto" title={a.passagemAteAqui}>
                      {a.passagemAteAqui}
                    </span>
                  )}
                </div>
              )}
              <button
                type="button"
                className="nx-aneis__anel"
                data-chave={a.chave}
                data-tom={a.tom}
                aria-pressed={aberto === a.chave}
                aria-controls={painel}
                aria-label={aria}
                onClick={() => setAberto((atual) => (atual === a.chave ? null : a.chave))}
              >
                <span className="nx-aneis__roda">
                  <Anel a={a} />
                  <span className="nx-aneis__centro" aria-hidden>
                    <b className="nx-aneis__valor">{a.valor != null ? inteiro(a.valor) : "Falta dado"}</b>
                    {a.variacao && <span className="nx-aneis__variacao">{a.variacao.texto}</span>}
                  </span>
                </span>
                <span className="nx-aneis__nome">{a.rotulo}</span>
                <span className="nx-aneis__antes">{a.somaAntes != null ? `antes: ${inteiro(a.somaAntes)}` : "antes: falta dado"}</span>
                <NxSelo tom={a.tom === "neutro" && a.selo === "Falta dado" ? "atencao" : a.tom} texto={a.selo} />
                {a.passagemAteAqui && <span className="sr-only">{`Da etapa anterior até aqui: ${a.passagemAteAqui}.`}</span>}
              </button>
            </Fragment>
          );
        })}
      </div>
      <p className="nx-aneis__legenda">
        <span className="nx-aneis__legenda-marca" aria-hidden />
        marca = mesmo número de antes · volta a mais = passou de antes
      </p>
      <div id={painel} className="nx-aneis__detalhe" data-peca="anel-detalhe" hidden={!doAnel} aria-live="polite">
        {doAnel && (
          <>
            <p className="nx-aneis__detalhe-titulo">
              {doAnel.somaAtual != null && doAnel.somaAntes != null
                ? `${doAnel.rotulo}: ${inteiro(doAnel.somaAtual)} agora, ${inteiro(doAnel.somaAntes)} antes`
                : `${doAnel.rotulo}: falta dado do período anterior`}
            </p>
            {doAnel.passagemAteAqui && <p className="nx-aneis__detalhe-apoio">{`Da etapa anterior até aqui: ${doAnel.passagemAteAqui}.`}</p>}
            {serie ? <NxLinhaDe30Dias {...serie} /> : <p className="nx-aneis__detalhe-apoio">Falta dado: o histórico por dia desta etapa não cobre o período.</p>}
            {barras.length > 0 && <NxBarras barras={barras} rotulo={`${doAnel.rotulo}: agora e antes`} />}
          </>
        )}
      </div>
    </section>
  );
}
