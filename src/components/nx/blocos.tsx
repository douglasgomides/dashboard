import { memo, useEffect, useState, type ReactNode } from "react";
import { IconeTabler } from "@/components/icons/tabler";
import { ROTULO_RESPONSAVEL, type Responsavel } from "@/lib/insight";
import { NxTag } from "./base";
import "@/styles/nexo-blocos.css";

// Peças de bloco do molde único (Phase 3.1, TELA-04): uma peça por função, usada por toda tela. Substituem as cópias
// por área (CmAviso, CmRecolhido, PlanoAviso, PlanoVazio, IgNota e as tabelas cruas). Só apresentação e só tokens.
// Cada peça leva data-peca, para o teste de "nenhum bloco antigo" achar quem já migrou.

// ---------- Vazio ----------
export interface NxVazioProps {
  titulo: string;
  /** O que falta para a tela ter o que mostrar. */
  falta: string;
  quem?: Responsavel;
  /** Como consertar (uma frase com verbo). */
  passo?: string;
  /** Botão ou link de ação. */
  acao?: ReactNode;
  /** Tela ainda sendo feita: mostra o chip "Em construção". */
  emConstrucao?: boolean;
}

export const NxVazio = memo(function NxVazio({ titulo, falta, quem, passo, acao, emConstrucao }: NxVazioProps) {
  return (
    <section className="nxb-vazio" data-peca="vazio" aria-label={titulo}>
      <div className="nxb-vazio__topo">
        <h3 className="nxb-vazio__titulo">{titulo}</h3>
        {emConstrucao && <NxTag tom="g">Em construção</NxTag>}
      </div>
      <p className="nxb-vazio__linha">{`O que falta: ${falta}`}</p>
      {passo && <p className="nxb-vazio__linha">{`Para consertar: ${passo}`}</p>}
      {quem && <p className="nxb-vazio__linha">{`Quem resolve: ${ROTULO_RESPONSAVEL[quem]}`}</p>}
      {acao && <div className="nxb-vazio__acao">{acao}</div>}
    </section>
  );
});

// ---------- Aviso ----------
export interface NxAvisoProps {
  /** "critico" muda a leitura de tudo e fica sempre visível; "atencao" e "info" são secundários. */
  tom: "critico" | "atencao" | "info";
  titulo: ReactNode;
  children?: ReactNode;
  /** Texto longo, recolhido atrás de "Entender". */
  detalhe?: ReactNode;
}

export const NxAviso = memo(function NxAviso({ tom, titulo, children, detalhe }: NxAvisoProps) {
  return (
    <div className={`nxb-aviso nxb-aviso--${tom}`} role={tom === "critico" ? "note" : undefined} data-peca="aviso">
      <span className="nxb-aviso__ic" aria-hidden>
        {tom === "info" ? "i" : "!"}
      </span>
      <div className="nxb-aviso__corpo">
        <p>
          <b>{titulo}</b>
          {children ? <> {children}</> : null}
        </p>
        {detalhe && (
          <details className="nxb-aviso__mais">
            <summary>Entender</summary>
            <div>{detalhe}</div>
          </details>
        )}
      </div>
    </div>
  );
});

// ---------- Recolhido ----------
export interface NxRecolhidoProps {
  titulo: ReactNode;
  /** Uma linha de apoio abaixo do título. */
  resumo?: ReactNode;
  id?: string;
  /** Começa aberto. Por padrão começa fechado. */
  aberto?: boolean;
  children: ReactNode;
}

export const NxRecolhido = memo(function NxRecolhido({ titulo, resumo, id, aberto = false, children }: NxRecolhidoProps) {
  return (
    <details className="nxb-recolhido" id={id} open={aberto || undefined} data-peca="recolhido">
      <summary>
        <span className="nxb-recolhido__textos">
          <b>{titulo}</b>
          {resumo && <small>{resumo}</small>}
        </span>
        <span className="nxb-recolhido__seta" aria-hidden>
          <IconeTabler nome="chevron-down" tamanho={18} />
        </span>
      </summary>
      <div className="nxb-recolhido__corpo">{children}</div>
    </details>
  );
});

// ---------- Tabela ----------
export interface NxColunaTabela {
  chave: string;
  titulo: string;
  /** Número: alinhado à direita, com algarismos de mesma largura. */
  numerica?: boolean;
}

export interface NxTabelaProps {
  /** Nome da tabela (lido por leitor de tela; não aparece escrito). */
  rotulo: string;
  colunas: readonly NxColunaTabela[];
  linhas: readonly Record<string, ReactNode>[];
  /** O que mostrar sem linhas. Sem dado nunca vira 0: a tela diz o que falta. */
  vazio?: ReactNode;
  chaveDaLinha?: (linha: Record<string, ReactNode>, indice: number) => string | number;
}

export const NxTabela = memo(function NxTabela({ rotulo, colunas, linhas, vazio, chaveDaLinha }: NxTabelaProps) {
  if (!linhas.length) {
    return (
      <div className="nxb-tabela nxb-tabela--vazia" data-peca="tabela">
        {vazio ?? <p className="nxb-tabela__vazio">Nada para mostrar aqui.</p>}
      </div>
    );
  }
  return (
    <div className="nxb-tabela" data-peca="tabela" role="region" aria-label={rotulo} tabIndex={0}>
      <table>
        <caption className="nxb-oculto">{rotulo}</caption>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c.chave} scope="col" className={c.numerica ? "nxb-num" : undefined}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, k) => (
            <tr key={chaveDaLinha ? chaveDaLinha(l, k) : k}>
              {colunas.map((c) => (
                <td key={c.chave} className={c.numerica ? "nxb-num" : undefined}>
                  {l[c.chave] ?? "Sem dado"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

// ---------- Carregando ----------
/** Quanto o carregamento espera antes de avisar que uma clínica grande leva mais tempo. */
const ESPERA_AVISO_MS = 3000;

export interface NxCarregandoProps {
  /** Mensagem mostrada depois de 3 s esperando. */
  texto?: string;
  /** Linhas do esqueleto (3 por padrão). */
  linhas?: number;
}

export const NxCarregando = memo(function NxCarregando({ texto = "Calculando, clínica grande leva até 30 s", linhas = 3 }: NxCarregandoProps) {
  const [demorou, setDemorou] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDemorou(true), ESPERA_AVISO_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="nxb-carregando" data-peca="carregando" role="status" aria-busy="true">
      <div className="nxb-carregando__esqueleto" aria-hidden>
        {Array.from({ length: Math.max(1, linhas) }, (_, k) => (
          <i key={k} />
        ))}
      </div>
      {demorou && <p className="nxb-carregando__aviso">{texto}</p>}
    </div>
  );
});

// ---------- Erro ----------
export interface NxErroProps {
  texto: string;
  /** Com ela aparece o botão "Tentar de novo". */
  onTentar?: () => void;
}

export const NxErro = memo(function NxErro({ texto, onTentar }: NxErroProps) {
  return (
    <div className="nxb-erro" role="alert" data-peca="erro">
      <p className="nxb-erro__texto">{texto}</p>
      <p className="nxb-erro__apoio">Isso não quer dizer que o número é zero.</p>
      {onTentar && (
        <button type="button" className="nxb-erro__botao" onClick={onTentar}>
          Tentar de novo
        </button>
      )}
    </div>
  );
});
