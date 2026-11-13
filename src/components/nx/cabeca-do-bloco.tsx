import { useId, type ReactNode } from "react";
import type { CabecaDoBloco } from "@/lib/leitura/cabeca-do-bloco";
import "@/styles/nexo-cinco-segundos.css";

// A cabeça de cada bloco do "Ver tudo" (quick-ver-tudo, João 13/11/2026: "a informação deve ficar mais na cara"). O "Ver tudo" aberto lê
// como uma sequência de mini cartões de 5 segundos: primeiro a resposta (UMA frase de até 90 caracteres com o número-chave grande),
// depois a prova (tabela, gráfico, lista). Só apresentação: a frase vem pronta da regra (src/lib/leitura/cabeca-do-bloco.ts e as regras
// de cada tela) e vira texto do React, nunca HTML. Sem dado medido a cabeça diz "Falta dado: motivo", em cinza.

/** Só a frase (a resposta do bloco), com o número-chave em destaque. Para blocos que já têm moldura própria. */
export function NxCabecaDoBloco({ cabeca, rotulo, id }: { cabeca: CabecaDoBloco; rotulo?: ReactNode; id?: string }) {
  return (
    <header className="nx-bloco-vt__cabeca" data-peca="cabeca-do-bloco" data-modo={cabeca.tipo}>
      {rotulo && <p className="nx-bloco-vt__rotulo">{rotulo}</p>}
      {cabeca.tipo === "falta" ? (
        <p id={id} className="nx-bloco-vt__frase nx-bloco-vt__frase--falta" data-falta-dado>
          {`Falta dado: ${cabeca.motivo}`}
        </p>
      ) : (
        <p id={id} className="nx-bloco-vt__frase" data-tom={cabeca.tom}>
          {cabeca.partes.map((p, k) =>
            p.enfase ? (
              <strong key={k} className="nx-bloco-vt__numero" data-enfase={p.enfase}>
                {p.texto}
              </strong>
            ) : (
              <span key={k}>{p.texto}</span>
            ),
          )}
        </p>
      )}
    </header>
  );
}

export interface NxBlocoDoVerTudoProps {
  /** A resposta do bloco, da regra. */
  cabeca: CabecaDoBloco;
  /** O nome do bloco, pequeno, em cima da frase ("Investimento e conversas por dia"). */
  rotulo?: ReactNode;
  /** A prova: o gráfico, a tabela ou a lista do bloco. */
  children: ReactNode;
  id?: string;
}

/** Um bloco do "Ver tudo": cartão branco sobre a moldura cinza, com a resposta em cima e a prova embaixo. */
export function NxBlocoDoVerTudo({ cabeca, rotulo, children, id }: NxBlocoDoVerTudoProps) {
  const base = useId();
  return (
    <section className="nx-bloco-vt" id={id} aria-labelledby={`${base}-f`} data-peca="bloco-do-ver-tudo">
      <NxCabecaDoBloco cabeca={cabeca} rotulo={rotulo} id={`${base}-f`} />
      <div className="nx-bloco-vt__prova">{children}</div>
    </section>
  );
}
