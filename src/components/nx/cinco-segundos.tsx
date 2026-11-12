import { useId, type ReactNode } from "react";
import { ROTULO_RESPONSAVEL } from "@/lib/insight";
import type { TelaId, TomFato } from "@/lib/leitura/tipos";
import type { Veredito } from "@/lib/leitura/cinco-segundos";
import { NxCarregando, NxErro } from "./blocos";
import { NxAcaoPilula } from "./cartoes";
import { SINAL } from "./pagina";
import "@/styles/nexo-cinco-segundos.css";

// Peças do formato 5 segundos (Phase 03.1.1.1, D-01): o veredito da tela (palavra + UMA frase com número grande), o selo de sinal e a
// lista de descobertas com "Por quê?". Só apresentação: nenhuma peça busca dado, grava ou envia (CHAM-07: o botão só navega), e todo
// texto vem pronto da regra (src/lib/leitura/cinco-segundos.ts) como texto do React: nenhuma peça monta HTML a partir de texto.
// O tom nunca vai só na cor: o selo leva o sinal (▲ ▼ ! ●) e a palavra. Só tokens de nexo-system.css.

const NOME_DO_TOM: Record<TomFato, string> = { bom: "bom", atencao: "atenção", ruim: "ruim", neutro: "neutro" };

/** Selo de sinal e palavra ("▲ Bom", "! Atenção", "▼ Em queda"). O sinal é decoração: a palavra diz o tom, e o nome do tom vai para leitor de tela. */
export function NxSelo({ tom, texto }: { tom: TomFato; texto: string }) {
  return (
    <span className="nx-selo" data-tom={tom}>
      <span className="nx-selo__sinal" aria-hidden>
        {SINAL[tom]}
      </span>
      <span className="nx-selo__texto" title={texto}>
        {texto}
      </span>
      <span className="sr-only">{` (sinal ${NOME_DO_TOM[tom]})`}</span>
    </span>
  );
}

export interface NxVereditoProps {
  /** O que a regra devolveu. null com `carregando` falso = nenhum dado neste período. */
  veredito: Veredito | null;
  carregando: boolean;
  /** Mensagem de erro de quem busca o dado (nunca vira zero na tela). */
  erro?: string | null;
  tela: TelaId;
  /** Visual ao lado do texto (anel da nota, por exemplo). */
  lado?: ReactNode;
  /** Linha de apoio abaixo da frase. */
  apoio?: ReactNode;
  /** No máximo um botão. */
  acao?: ReactNode;
}

/**
 * Faixa do topo da tela: a palavra do veredito (com sinal) e UMA frase com o número em destaque. Sem dado, mostra exatamente os textos
 * da leitura honesta ("Falta dado: motivo", "Próximo passo para resolver:", "Quem resolve: ...") e nenhuma conclusão (D-05).
 */
export function NxVeredito({ veredito, carregando, erro, tela, lado, apoio, acao }: NxVereditoProps) {
  const id = useId();
  const modo = carregando ? "carregando" : erro ? "erro" : !veredito ? "vazio" : veredito.tipo === "sem_leitura" ? "sem-leitura" : "veredito";
  return (
    <section className="nx-veredito" aria-labelledby={`${id}-t`} data-peca="veredito" data-modo={modo} data-tela-do-veredito={tela}>
      <h2 id={`${id}-t`} className="sr-only">
        Veredito da tela
      </h2>
      {carregando ? (
        <NxCarregando linhas={2} />
      ) : erro ? (
        <NxErro texto="Não deu para montar a leitura agora." />
      ) : !veredito || veredito.tipo === "sem_leitura" ? (
        <SemDado
          motivo={veredito?.tipo === "sem_leitura" ? veredito.motivo : "não há dado neste período."}
          passo={veredito?.tipo === "sem_leitura" ? veredito.passo : { frase: "Conferir a conexão das fontes.", rotuloQuem: ROTULO_RESPONSAVEL.equipe_hub }}
        />
      ) : (
        <div className="nx-veredito__corpo" data-tem-lado={lado ? "" : undefined}>
          {lado && <div className="nx-veredito__lado">{lado}</div>}
          <div className="nx-veredito__texto">
            <NxSelo tom={veredito.tom} texto={veredito.palavra} />
            <p className="nx-veredito__frase">
              {veredito.frase.map((p, k) =>
                p.enfase ? (
                  <strong key={k} className="nx-veredito__enfase" data-enfase={p.enfase}>
                    {p.texto}
                  </strong>
                ) : (
                  <span key={k}>{p.texto}</span>
                ),
              )}
            </p>
            {(veredito.apoio || apoio) && <p className="nx-veredito__apoio">{apoio ?? veredito.apoio}</p>}
            {acao && <div className="nx-veredito__acao">{acao}</div>}
          </div>
        </div>
      )}
    </section>
  );
}

/** Os mesmos textos de SemLeitura (pagina.tsx), para o motivo ser o que Resultados mostra com os mesmos dados. */
function SemDado({ motivo, passo }: { motivo: string; passo: { frase: string; rotuloQuem: string } }) {
  return (
    <div className="nx-veredito__sem-dado">
      <NxSelo tom="atencao" texto="Falta dado" />
      <p className="nx-veredito__falta">{`Falta dado: ${motivo}`}</p>
      <p className="nx-veredito__passo">Próximo passo para resolver:</p>
      <NxAcaoPilula frase={passo.frase} />
      <p className="nx-veredito__apoio">{`Quem resolve: ${passo.rotuloQuem}`}</p>
    </div>
  );
}
