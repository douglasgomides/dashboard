import { useId, useState, type ReactNode } from "react";
import type { DateRangeState } from "@/lib/date-range";
import { ROTULO_RESPONSAVEL } from "@/lib/insight";
import type { TelaId, TomFato } from "@/lib/leitura/tipos";
import type { Descoberta, Veredito } from "@/lib/leitura/cinco-segundos";
import { NxCarregando, NxErro } from "./blocos";
import { NxAcaoPilula, NxBarras } from "./cartoes";
import { linhaDaRota } from "./hoje";
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

// ---------- Descobertas ----------

type Atributos = Record<string, string>;

export interface NxDescobertasProps {
  /** O título da seção ("3 ações esta semana"). */
  titulo: ReactNode;
  /** Uma linha de apoio embaixo do título (o aviso de poucas ações, por exemplo). */
  apoio?: ReactNode;
  /** As descobertas à vista, já em ordem de impacto (de 3 a 5). */
  itens: readonly Descoberta[];
  clientId: string;
  dateRange?: DateRangeState;
  /** Ação de uma descoberta com `local`: a própria tela decide o que abrir (trocar de aba, por exemplo). Nunca envia nada. */
  aoAgir?: (local: string) => void;
  id?: string;
  /** Atributos extras de cada descoberta (data-*), para a tela marcar o que o teste e a regra precisam achar. */
  atributos?: (d: Descoberta, indice: number) => Atributos;
  /** Uma peça da tela depois das barras do "Por quê?" (por exemplo os dias de verba baixa sobre a faixa do normal). Só apresentação. */
  extraDoPorque?: (d: Descoberta) => ReactNode;
}

/**
 * De 3 a 5 descobertas em frase curta, cada uma com selo (sinal e palavra), quem resolve, um número medido em jogo, UMA ação que só
 * navega (CHAM-07) e um "Por quê?" que abre de 2 a 3 fatores em barra. O que falta é barra listrada com "Falta dado" (nunca zero).
 */
export function NxDescobertas({ titulo, apoio, itens, clientId, dateRange, aoAgir, id, atributos, extraDoPorque }: NxDescobertasProps) {
  const base = useId();
  return (
    <section className="nx-descobertas" id={id} aria-labelledby={`${base}-t`} data-peca="descobertas">
      <header className="nx-descobertas__topo">
        {/* div com papel de título, porque o título da Hoje é um parágrafo com número grande. */}
        <div id={`${base}-t`} className="nx-descobertas__titulo" role="heading" aria-level={2}>
          {titulo}
        </div>
        {apoio}
      </header>
      {itens.length > 0 && (
        <ul className="nx-descobertas__lista">
          {itens.map((d, k) => (
            <li key={d.id} className="nx-descobertas__item">
              <ItemDaDescoberta d={d} clientId={clientId} dateRange={dateRange} aoAgir={aoAgir} extras={atributos?.(d, k)} extraDoPorque={extraDoPorque} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemDaDescoberta({ d, clientId, dateRange, aoAgir, extras, extraDoPorque }: { d: Descoberta; clientId: string; dateRange?: DateRangeState; aoAgir?: (local: string) => void; extras?: Atributos; extraDoPorque?: (d: Descoberta) => ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const painel = useId();
  const linha = d.acao.rota ? linhaDaRota(d.acao.rota) : undefined;
  const local = d.acao.local;
  return (
    <article className="nx-descoberta" data-peca="descoberta" data-tom={d.tom} data-aberto={aberto ? "" : undefined} {...extras}>
      <div className="nx-descoberta__corpo">
        <div className="nx-descoberta__topo">
          <NxSelo tom={d.tom} texto={d.selo} />
          {d.quem && (
            <span className="nx-descoberta__quem" title={`Quem resolve: ${d.quem}`}>
              <span className="sr-only">Quem resolve: </span>
              <span className="nx-descoberta__texto-do-chip">{d.quem}</span>
            </span>
          )}
          {d.impacto && (
            <span className="nx-descoberta__impacto" title={d.impacto} data-numero-de-destaque>
              <span className="nx-descoberta__texto-do-chip">{d.impacto}</span>
            </span>
          )}
        </div>
        <p className="nx-descoberta__frase">{d.frase}</p>
      </div>
      <div className="nx-descoberta__acoes">
        {linha ? (
          <NxAcaoPilula frase={d.acao.rotulo} rotuloDaSeta="Abrir a aba de origem" para={{ tela: linha, clientId, dateRange }} />
        ) : local && aoAgir ? (
          <NxAcaoPilula frase={d.acao.rotulo} rotuloDaSeta="Abrir" aoAbrir={() => aoAgir(local)} />
        ) : null}
        <button type="button" className="nx-descoberta__porque-botao" aria-expanded={aberto} aria-controls={painel} onClick={() => setAberto((a) => !a)}>
          Por quê?
        </button>
      </div>
      <div id={painel} className="nx-descoberta__porque" hidden={!aberto}>
        <p className="nx-descoberta__porque-titulo">{d.porque.titulo}</p>
        <NxBarras barras={d.porque.barras} />
        {extraDoPorque?.(d)}
        {d.porque.obs && <p className="nx-descoberta__obs">{d.porque.obs}</p>}
      </div>
    </article>
  );
}
