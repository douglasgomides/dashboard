import { Fragment, memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { IconeTabler } from "@/components/icons/tabler";
import { NxChip } from "@/components/nx-chip";
import { ROTULO_RESPONSAVEL } from "@/lib/insight";
import { montarTexto, rotuloPeriodo } from "@/lib/leitura/texto";
import { ROTULO_DECISAO, type DecisaoMedico, type FatosDaTela, type LinhaTexto, type PassoTexto, type TelaId, type TextoDoResumo, type TomFato } from "@/lib/leitura/tipos";
import { NxTag } from "./base";
import "@/styles/nexo-pagina.css";

// Molde único de página do Nexo (Phase 3.1). Toda tela, da clínica e da equipe, abre assim, nesta ordem fixa:
// cabeçalho (rótulo, pergunta e decisão), leitura (o que aconteceu, por quê e o próximo passo), de 3 a 4 cartões,
// um gráfico principal, o corpo da tela (formulário, quadro, fila ou lista) e o detalhe recolhido.
// Só apresentação e só tokens do nexo-system.css. Sem children livres: cada região é uma prop.

export interface PaginaNexoProps {
  tela: TelaId;
  /** Rótulo da tela no registro ("Resultados da clínica"). */
  titulo: string;
  /** A pergunta que a tela responde: até 80 caracteres, termina em "?". */
  pergunta: string;
  /** A qual das 5 decisões do médico a tela serve, quando serve. */
  decisao?: DecisaoMedico;
  meta?: ReactNode;
  acao?: ReactNode;
  /** Sempre uma LeituraDaTela. */
  leitura: ReactNode;
  /** No máximo 4 cartões (o tipo garante). */
  cartoes?: readonly [ReactNode, ReactNode?, ReactNode?, ReactNode?];
  /** Um gráfico nx. */
  principal?: ReactNode;
  /** Telas de trabalho: formulário, quadro, fila, lista. */
  corpo?: ReactNode;
  /** Vai dentro do bloco recolhido "Detalhes", fechado. */
  detalhe?: ReactNode;
}

export function PaginaNexo({ tela, titulo, pergunta, decisao, meta, acao, leitura, cartoes, principal, corpo, detalhe }: PaginaNexoProps) {
  const cartoesVisiveis = (cartoes ?? []).filter((c) => c != null && c !== false);
  return (
    <div className="nx-pagina" data-tela={tela}>
      <header className="nx-pagina__topo">
        <div className="nx-pagina__titulos">
          <p className="nx-pagina__rotulo">{titulo}</p>
          <h1 className="nx-pagina__pergunta">{pergunta}</h1>
          {(decisao || meta) && (
            <div className="nx-pagina__meta">
              {decisao && <NxTag tom="b">{ROTULO_DECISAO[decisao]}</NxTag>}
              {meta}
            </div>
          )}
        </div>
        {acao && <div className="nx-pagina__acao">{acao}</div>}
      </header>
      {leitura}
      {cartoesVisiveis.length > 0 && (
        <div className="nx-pagina__cartoes" data-quantidade={cartoesVisiveis.length}>
          {cartoesVisiveis.map((c, k) => (
            <Fragment key={k}>{c}</Fragment>
          ))}
        </div>
      )}
      {principal && <div className="nx-pagina__principal">{principal}</div>}
      {corpo && <div className="nx-pagina__corpo">{corpo}</div>}
      {detalhe && (
        <details className="nx-pagina__detalhe">
          <summary>
            <span>Detalhes</span>
            <span className="nx-pagina__seta" aria-hidden>
              <IconeTabler nome="chevron-down" tamanho={18} />
            </span>
          </summary>
          <div className="nx-pagina__detalhe-corpo">{detalhe}</div>
        </details>
      )}
    </div>
  );
}

// ---------- Leitura da tela ----------

export interface LeituraDaTelaProps {
  /** Fatos já calculados pela tela. null com `carregando` falso = nenhum dado neste período. */
  fatos: FatosDaTela | null;
  carregando: boolean;
  /** Mensagem de erro de quem busca o dado (nunca vira zero na tela). */
  erro?: string | null;
  /** Mostra o chip "sem selo" (provisório até a resposta do João no 03.1-03). */
  semSelo?: boolean;
  /** Modo resumo da clínica (3 linhas, D-07). */
  resumo?: TextoDoResumo;
  id?: string;
}

const SINAL: Record<TomFato, string> = { bom: "▲", ruim: "▼", atencao: "!", neutro: "●" };
/** Quanto a leitura espera antes de avisar que uma clínica grande leva mais tempo. */
const ESPERA_AVISO_MS = 3000;

function Linha({ rotulo, tom = "neutro", children }: { rotulo?: string; tom?: TomFato; children: ReactNode }) {
  return (
    <li className="nx-leitura__linha">
      <span className={`nx-leitura__sinal nx-leitura__sinal--${tom}`} aria-hidden>
        {SINAL[tom]}
      </span>
      <div className="nx-leitura__corpo">
        {rotulo && <p className="nx-leitura__rotulo">{rotulo}</p>}
        {children}
      </div>
    </li>
  );
}

/** A frase com o número que a sustenta logo depois (cada número em strong, tabular). Texto sempre como texto do React. */
function FraseComNumero({ linha }: { linha: LinhaTexto }) {
  return (
    <p className="nx-leitura__frase">
      {linha.frase}
      {linha.numeros.map((n) => (
        <Fragment key={n.chave}>
          {" "}
          <strong className="nx-leitura__num">{n.exibicao}</strong>
        </Fragment>
      ))}
    </p>
  );
}

function BlocoPasso({ passo, rotulo }: { passo: PassoTexto; rotulo: string }) {
  return (
    <Linha rotulo={rotulo}>
      <p className="nx-leitura__frase">{passo.frase}</p>
      {passo.motivo && <p className="nx-leitura__apoio">Motivo: {passo.motivo}</p>}
      <p className="nx-leitura__apoio">{`Quem resolve: ${ROTULO_RESPONSAVEL[passo.quem]}`}</p>
    </Linha>
  );
}

function VerMais({ passos }: { passos: PassoTexto[] }) {
  if (!passos.length) return null;
  return (
    <details className="nx-leitura__mais">
      <summary>Ver mais ({passos.length})</summary>
      <ul className="nx-leitura__outros">
        {passos.map((p) => (
          <li key={p.frase}>
            <span>{p.frase}</span> <span className="nx-leitura__apoio">{`Quem resolve: ${ROTULO_RESPONSAVEL[p.quem]}`}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function SemLeitura({ motivo, passo }: { motivo: string; passo: PassoTexto }) {
  return (
    <ul className="nx-leitura__linhas">
      <Linha tom="atencao">
        <p className="nx-leitura__frase">{`Sem leitura: ${motivo}`}</p>
      </Linha>
      <Linha>
        <p className="nx-leitura__frase">{`Para consertar: ${passo.frase}`}</p>
        <p className="nx-leitura__apoio">{`Quem resolve: ${ROTULO_RESPONSAVEL[passo.quem]}`}</p>
      </Linha>
    </ul>
  );
}

/** Avisa, depois de 3 s esperando, que clínica grande leva mais tempo. */
function useDemora(ativo: boolean): boolean {
  const [demorou, setDemorou] = useState(false);
  useEffect(() => {
    if (!ativo) {
      setDemorou(false);
      return;
    }
    const t = setTimeout(() => setDemorou(true), ESPERA_AVISO_MS);
    return () => clearTimeout(t);
  }, [ativo]);
  return demorou;
}

export const LeituraDaTela = memo(function LeituraDaTela({ fatos, carregando, erro, semSelo, resumo, id = "leitura" }: LeituraDaTelaProps) {
  const texto = useMemo(() => (fatos ? montarTexto(fatos) : null), [fatos]);
  const demorou = useDemora(carregando);
  const modoResumo = !!resumo && !carregando && !erro;
  const titulo = modoResumo ? "Resumo da clínica" : fatos?.tipoPeriodo === "hoje" ? "Situação de hoje" : "Leitura do período";
  const subtitulo = !carregando && !erro && fatos ? rotuloPeriodo(fatos.periodo) : null;
  const modo = carregando ? "carregando" : erro ? "erro" : modoResumo ? "resumo" : !texto ? "vazio" : texto.tipo === "sem_leitura" ? "sem-leitura" : "leitura";

  return (
    <section className="nx-leitura" aria-labelledby={`${id}-t`} aria-busy={carregando || undefined} data-peca="leitura" data-modo={modo}>
      <header className="nx-leitura__topo">
        <span className="nx-leitura__tile" aria-hidden>
          <IconeTabler nome="bulb" tamanho={17} traco={1.7} />
        </span>
        <div className="nx-leitura__titulos">
          <h2 id={`${id}-t`}>{titulo}</h2>
          {subtitulo && <p className="nx-leitura__periodo">{subtitulo}</p>}
        </div>
        {semSelo && <NxChip tipo="sem-selo" />}
      </header>

      {carregando ? (
        <div className="nx-leitura__espera">
          <div className="nx-leitura__esqueleto" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          {demorou && <p className="nx-leitura__apoio">Calculando, clínica grande leva até 30 s</p>}
        </div>
      ) : erro ? (
        <div className="nx-leitura__erro" role="note">
          <p className="nx-leitura__frase">Não deu para montar a leitura agora.</p>
          <p className="nx-leitura__apoio">Isso não quer dizer que o número é zero.</p>
        </div>
      ) : modoResumo && resumo ? (
        resumo.tipo === "sem_leitura" ? (
          <SemLeitura motivo={resumo.motivo} passo={resumo.passo} />
        ) : (
          <ul className="nx-leitura__linhas">
            {resumo.aconteceu && (
              <Linha rotulo="O que aconteceu" tom={resumo.aconteceu.tom}>
                <FraseComNumero linha={resumo.aconteceu} />
              </Linha>
            )}
            {resumo.preocupa && (
              <Linha rotulo="O que mais preocupa" tom={resumo.preocupa.tom}>
                <FraseComNumero linha={resumo.preocupa} />
              </Linha>
            )}
            {resumo.acao ? (
              <BlocoPasso passo={resumo.acao} rotulo="Ação da semana" />
            ) : (
              resumo.semAcaoMotivo && (
                <Linha rotulo="Ação da semana">
                  <p className="nx-leitura__frase">{resumo.semAcaoMotivo}</p>
                </Linha>
              )
            )}
          </ul>
        )
      ) : !texto ? (
        <SemLeitura
          motivo="não há dado neste período."
          passo={{ frase: "Conferir a conexão das fontes.", verbo: "conferir", quem: "equipe_hub", rotuloQuem: ROTULO_RESPONSAVEL.equipe_hub }}
        />
      ) : texto.tipo === "sem_leitura" ? (
        <SemLeitura motivo={texto.motivo} passo={texto.passo} />
      ) : (
        <>
          <ul className="nx-leitura__linhas">
            <Linha rotulo="O que aconteceu" tom={texto.aconteceu.tom}>
              <FraseComNumero linha={texto.aconteceu} />
            </Linha>
            {texto.porque && (
              <Linha rotulo="Por quê" tom={texto.porque.tom}>
                <FraseComNumero linha={texto.porque} />
              </Linha>
            )}
            {texto.proximoPasso ? (
              <BlocoPasso passo={texto.proximoPasso} rotulo="Próximo passo" />
            ) : (
              texto.semPassoMotivo && (
                <Linha rotulo="Próximo passo">
                  <p className="nx-leitura__frase">{texto.semPassoMotivo}</p>
                </Linha>
              )
            )}
          </ul>
          <VerMais passos={texto.verMais} />
        </>
      )}
    </section>
  );
});
