import { Children, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, MinusCircle } from "lucide-react";
import { NxTag, type NxTom } from "./base";
import "@/styles/nexo-admin.css";

// Peças das telas da equipe (Carteira, Conferência, Integrações e Configurar cliente) no desenho do painel: contador
// em cartão, chip de status com ícone (nunca só a cor), seção de formulário em cartão e campo com rótulo ligado.
// Recebem o número e o texto prontos da tela; nenhuma busca dado nem calcula nada.

export type AdmTom = "ok" | "atencao" | "critico" | "neutro" | "marca";

const TOM_TAG: Record<AdmTom, NxTom> = { ok: "up", atencao: "or", critico: "dn", neutro: "g", marca: "b" };
const ICONE_TOM: Record<AdmTom, ReactNode> = {
  ok: <CheckCircle2 className="nx-tag__ic" aria-hidden />,
  atencao: <Clock className="nx-tag__ic" aria-hidden />,
  critico: <AlertTriangle className="nx-tag__ic" aria-hidden />,
  neutro: <MinusCircle className="nx-tag__ic" aria-hidden />,
  marca: null,
};

/** Tom do chip a partir da cor da regra única de status (status-fonte.ts). */
export const tomDaCor = (cor: string): AdmTom => (cor === "verde" ? "ok" : cor === "amarelo" ? "atencao" : cor === "vermelho" ? "critico" : "neutro");

/** Texto achatado dos filhos (strings e números, também em array), para o title do chip cortado. */
function textoDosFilhos(children: ReactNode): string {
  return Children.toArray(children)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chip de status: cor + ícone + texto. `semIcone` para chips de contagem neutros. O texto fica num span próprio
 * (adm-chip__texto), que a Carteira corta com reticências; o title traz o texto inteiro.
 */
export function AdmChip({ tom = "neutro", children, titulo, semIcone }: { tom?: AdmTom; children: ReactNode; titulo?: string; semIcone?: boolean }) {
  return (
    <NxTag tom={TOM_TAG[tom]} icone={semIcone ? undefined : ICONE_TOM[tom]} titulo={titulo ?? (textoDosFilhos(children) || undefined)}>
      <span className="adm-chip__texto">{children}</span>
    </NxTag>
  );
}

/**
 * Contador do topo: ícone, rótulo, número grande e uma linha curta. Com `onClick` vira botão de filtro
 * (aria-pressed); sem ele, só leitura. `className` deixa a tela somar classes (ex.: dbx-card da entrada animada).
 */
export function AdmContador({
  icone,
  rotulo,
  valor,
  nota,
  tom = "neutro",
  onClick,
  ativo,
  titulo,
  className = "",
  i,
}: {
  icone: ReactNode;
  rotulo: string;
  valor: ReactNode;
  nota?: ReactNode;
  tom?: AdmTom;
  onClick?: () => void;
  ativo?: boolean;
  titulo?: string;
  className?: string;
  i?: number;
}) {
  const cls = `adm-cont adm-cont--${tom} ${className}`;
  const estilo = i == null ? undefined : ({ "--i": i } as CSSProperties);
  const corpo = (
    <>
      <span className="adm-cont__topo">
        <span className="adm-cont__ic" aria-hidden>
          {icone}
        </span>
        <span className="adm-cont__rotulo">{rotulo}</span>
      </span>
      <span className="adm-cont__valor">{valor}</span>
      {nota && <span className="adm-cont__nota">{nota}</span>}
    </>
  );
  if (onClick)
    return (
      <button type="button" className={cls} style={estilo} onClick={onClick} aria-pressed={!!ativo} title={titulo}>
        {corpo}
      </button>
    );
  return (
    <div className={cls} style={estilo} title={titulo}>
      {corpo}
    </div>
  );
}

/** Grade dos contadores. */
export function AdmContadores({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="adm-conts" role="group" aria-label={rotulo}>
      {children}
    </div>
  );
}

/** Seção de formulário em cartão: ícone, título (h2), uma linha do que se faz aqui e o conteúdo. */
export function AdmSecao({
  id,
  icone,
  titulo,
  sub,
  acao,
  children,
  toda,
}: {
  id?: string;
  icone: ReactNode;
  titulo: string;
  sub?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
  /** Ocupa a linha toda na grade de seções. */
  toda?: boolean;
}) {
  return (
    <section id={id} className={`adm-secao${toda ? " adm-secao--toda" : ""}`} aria-labelledby={id ? `${id}-titulo` : undefined} aria-label={id ? undefined : titulo}>
      <header className="adm-secao__head">
        <span className="nx-tile" aria-hidden>
          {icone}
        </span>
        <div className="adm-secao__texto">
          <h2 id={id ? `${id}-titulo` : undefined}>{titulo}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {acao && <div className="adm-secao__acao">{acao}</div>}
      </header>
      <div className="adm-secao__corpo">{children}</div>
    </section>
  );
}

/** Campo com o rótulo ligado ao controle (htmlFor) e a dica embaixo. */
export function AdmCampo({ id, rotulo, dica, children, largo }: { id: string; rotulo: string; dica?: ReactNode; children: ReactNode; largo?: boolean }) {
  return (
    <div className={`adm-campo${largo ? " adm-campo--largo" : ""}`}>
      <label htmlFor={id}>{rotulo}</label>
      {children}
      {dica && <span className="adm-campo__dica">{dica}</span>}
    </div>
  );
}
