import type { ReactNode } from "react";
import { IconeTabler } from "@/components/icons/tabler";
import type { NomeIcone } from "@/lib/registro-de-telas";
import { NxTag, type NxTom } from "./base";
import "@/styles/nexo-plano.css";

// Peças das telas de Plano de ação e Relatórios (relatório, prioridades, oportunidades, plano, reuniões).
// Só apresentação: recebem texto e número prontos da tela, não buscam nem calculam dado.

/** Título da tela com a pergunta que ela responde, o período e as ações. */
export function PlanoCabecalho({ titulo, pergunta, periodo, acao }: { titulo: string; pergunta: ReactNode; periodo?: ReactNode; acao?: ReactNode }) {
  return (
    <header className="pl-cab">
      <div className="pl-cab__texto">
        <h2>{titulo}</h2>
        <p>{pergunta}</p>
      </div>
      {(periodo || acao) && (
        <div className="pl-cab__acoes">
          {periodo && (
            <span className="pl-periodo">
              <IconeTabler nome="calendar" tamanho={16} />
              {periodo}
            </span>
          )}
          {acao}
        </div>
      )}
    </header>
  );
}

/** Ícone Tabler no ladrilho de degradê da prancha (28 px). */
export function TileTabler({ nome, suave }: { nome: NomeIcone; suave?: boolean }) {
  return (
    <span className={`nx-tile${suave ? " nx-tile--suave" : ""}`} aria-hidden>
      <IconeTabler nome={nome} tamanho={17} traco={1.7} />
    </span>
  );
}

export interface Contador {
  rotulo: string;
  valor: ReactNode;
  /** Linha pequena embaixo do número. */
  nota?: ReactNode;
  /** Cor do filete à esquerda: dn = urgente, or = atenção, up = bom, b = neutro. */
  tom?: NxTom;
}

/** Contadores do topo das telas de ação: número grande (700) e rótulo, numa faixa só. */
export function PlanoContadores({ itens, rotulo }: { itens: Contador[]; rotulo: string }) {
  return (
    <ul className="pl-contadores" aria-label={rotulo}>
      {itens.map((c, i) => (
        <li key={c.rotulo} className={`pl-contador nx-sobe pl-contador--${c.tom ?? "b"}`} style={{ ["--i" as string]: i }}>
          <span className="pl-contador__rotulo">{c.rotulo}</span>
          <span className="pl-contador__valor">{c.valor}</span>
          {c.nota && <span className="pl-contador__nota">{c.nota}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Linha de ação priorizada: posição, título, uma linha de apoio, chips (dono, prazo, status) e a ação à direita.
 * O detalhe (por quê, evidência, cálculo) vai recolhido em `detalhe`, aberto pelo botão "Ver detalhe".
 */
export function PlanoLinha({
  posicao,
  tom = "b",
  titulo,
  apoio,
  chips,
  acao,
  detalhe,
  rotuloDetalhe = "Por que e como",
  apagada,
  as: Tag = "li",
}: {
  posicao?: number;
  tom?: NxTom;
  titulo: ReactNode;
  apoio?: ReactNode;
  chips?: ReactNode;
  acao?: ReactNode;
  detalhe?: ReactNode;
  rotuloDetalhe?: string;
  apagada?: boolean;
  as?: "li" | "div";
}) {
  return (
    <Tag className={`pl-linha pl-linha--${tom}${apagada ? " pl-linha--apagada" : ""}`}>
      <div className="pl-linha__topo">
        {posicao != null && <span className={`nx-rank${posicao === 1 ? " nx-rank--1" : ""}`} aria-hidden>{posicao}</span>}
        <div className="pl-linha__corpo">
          <p className="pl-linha__titulo">{titulo}</p>
          {apoio && <p className="pl-linha__apoio">{apoio}</p>}
          {chips && <div className="pl-chips">{chips}</div>}
        </div>
        {acao && <div className="pl-linha__acao">{acao}</div>}
      </div>
      {detalhe && (
        <details className="pl-detalhe">
          <summary>
            <IconeTabler nome="chevron-down" tamanho={16} />
            {rotuloDetalhe}
          </summary>
          <div className="pl-detalhe__corpo">{detalhe}</div>
        </details>
      )}
    </Tag>
  );
}

/** Chip com rótulo escondido para leitor de tela ("Responsável: Equipe"). */
export function PlanoChip({ rotulo, tom = "g", icone, children }: { rotulo?: string; tom?: NxTom; icone?: NomeIcone; children: ReactNode }) {
  return (
    <NxTag tom={tom} icone={icone ? <IconeTabler nome={icone} tamanho={14} className="nx-tag__ic" /> : undefined}>
      {rotulo && <span className="sr-only">{rotulo}: </span>}
      {children}
    </NxTag>
  );
}

/** "Como é calculado": recolhido atrás de um botão "i", para o método não competir com o dado. */
export function PlanoComo({ titulo = "Como é calculado", children }: { titulo?: string; children: ReactNode }) {
  return (
    <details className="pl-como">
      <summary>
        <span className="pl-como__i" aria-hidden>i</span>
        {titulo}
      </summary>
      <div className="pl-como__corpo">{children}</div>
    </details>
  );
}

/**
 * Aviso de dado incompleto ou não confiável: curto, secundário, nunca escondido. `detalhe` abre a lista completa.
 * `papel` só quando o aviso aparece depois de uma ação (status/alert); avisos fixos não são anunciados.
 */
export function PlanoAviso({ titulo, children, detalhe, tom = "or", papel }: { titulo: ReactNode; children?: ReactNode; detalhe?: ReactNode; tom?: "or" | "dn" | "b"; papel?: "status" | "alert" }) {
  return (
    <div className={`pl-aviso pl-aviso--${tom}`} role={papel}>
      <span className="pl-aviso__ic" aria-hidden>!</span>
      <div className="min-w-0 flex-1">
        <p className="pl-aviso__titulo">{titulo}</p>
        {children && <div className="pl-aviso__texto">{children}</div>}
        {detalhe && (
          <details className="pl-detalhe pl-detalhe--aviso">
            <summary>
              <IconeTabler nome="chevron-down" tamanho={16} />
              Ver a lista
            </summary>
            <div className="pl-detalhe__corpo">{detalhe}</div>
          </details>
        )}
      </div>
    </div>
  );
}

/** Lista vazia com explicação honesta (o que não aparecer não quer dizer que está tudo bem). */
export function PlanoVazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="pl-vazio">
      <p className="pl-vazio__titulo">{titulo}</p>
      {children && <p className="pl-vazio__texto">{children}</p>}
    </div>
  );
}
