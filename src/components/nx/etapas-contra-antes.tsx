import { useId, useState } from "react";
import { sentidoDaEtapa, type EtapaContraAntes } from "@/lib/leitura/cinco-hoje";

// A prova da Hoje (Phase 03.1.1.1, CINCO-01): cada etapa do funil contra o período anterior da PRÓPRIA clínica, em barras que saem do eixo
// do meio (para a direita quando subiu, para a esquerda quando caiu), com a linha tracejada "aqui virou" antes da etapa em que o funil
// passa de crescer para cair. Só apresentação: recebe as etapas prontas de src/lib/leitura/cinco-hoje.ts, não busca nem grava nada e todo
// texto é texto do React. O sentido nunca vai só na cor: ▲ ▼ com o percentual ao lado. Etapa sem período anterior medido é um toco listrado
// "Falta dado" (nunca uma barra, nunca 0), com o motivo no title e na linha fixa que abre ao tocar.

export interface NxEtapasContraAntesProps {
  etapas: readonly EtapaContraAntes[];
  /** O título da prova ("Até Virou lead, tudo cresce. Depois, cai."). */
  titulo: string;
  /** Como o período anterior se chama ("mês antes" ou "período anterior"). */
  rotuloDoAnterior?: string;
  /** A etapa em que o funil vira (a linha "aqui virou" vem antes dela). null = não vira. */
  indiceDaVirada?: number | null;
}

const num = (n: number) => n.toLocaleString("pt-BR");

/** "▲ 62%", "▼ 50%" ou "= igual" (menos de 3% para qualquer lado). */
function textoDoValor(pct: number): string {
  return sentidoDaEtapa(pct) === "igual" ? "= igual" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`;
}

/** A linha fixa de uma etapa: "Conversou: 162 agora · 100 período anterior"; sem número, "Falta dado" e o motivo. */
function linhaFixa(e: EtapaContraAntes, rotuloDoAnterior: string): string {
  const agora = e.atual != null ? `${num(e.atual)} agora` : "Falta dado agora";
  const antes = e.antes != null ? `${num(e.antes)} ${rotuloDoAnterior}` : `Falta dado ${rotuloDoAnterior}`;
  return `${e.rotulo}: ${agora} · ${antes}${e.pct == null && e.motivo ? `. Falta dado: ${e.motivo}` : ""}`;
}

export function NxEtapasContraAntes({ etapas, titulo, rotuloDoAnterior = "período anterior", indiceDaVirada = null }: NxEtapasContraAntesProps) {
  const base = useId();
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const maior = Math.max(1, ...etapas.map((e) => (e.pct == null ? 0 : Math.abs(e.pct))));
  const resumo = `${titulo}. ${etapas
    .map((e) => (e.pct != null ? `${e.rotulo}: ${sentidoDaEtapa(e.pct) === "igual" ? "igual ao" : `${e.pct > 0 ? "subiu" : "caiu"} ${Math.abs(e.pct)}% contra o`} ${rotuloDoAnterior}` : `${e.rotulo}: falta dado${e.motivo ? `, ${e.motivo}` : ""}`))
    .join(". ")}.`;
  return (
    <section className="nx-etapas" data-peca="etapas-contra-antes" aria-labelledby={`${base}-t`}>
      <div className="nx-etapas__topo">
        <h2 id={`${base}-t`} className="nx-etapas__titulo">
          {titulo}
        </h2>
        {indiceDaVirada != null && <p className="nx-etapas__sub">{`Cada etapa contra o ${rotuloDoAnterior}`}</p>}
      </div>
      <p className="sr-only">{resumo}</p>
      <ul className="nx-etapas__lista">
        {etapas.flatMap((e, i) => {
          const sentido = sentidoDaEtapa(e.pct);
          const largura = e.pct == null ? 0 : Math.max(2, (Math.abs(e.pct) / maior) * 50);
          const linhas = [];
          if (indiceDaVirada === i) {
            linhas.push(
              <li key={`virada-${i}`} className="nx-etapas__virada" data-peca="virada">
                <span>aqui virou</span>
              </li>,
            );
          }
          linhas.push(
            <li key={e.rotulo} className="nx-etapas__item" data-etapa={e.rotulo}>
              <button
                type="button"
                className="nx-etapas__linha"
                aria-pressed={escolhida === i}
                aria-describedby={escolhida === i ? `${base}-fixo` : undefined}
                title={e.pct == null && e.motivo ? `Falta dado: ${e.motivo}` : linhaFixa(e, rotuloDoAnterior)}
                onClick={() => setEscolhida((atual) => (atual === i ? null : i))}
              >
                <span className="nx-etapas__nome">{e.rotulo}</span>
                <span className="nx-etapas__trilho" aria-hidden>
                  {e.pct == null ? (
                    <span className="nx-etapas__toco" data-falta>
                      Falta dado
                    </span>
                  ) : sentido === "igual" ? null : (
                    <span className="nx-etapas__barra" data-sentido={sentido} style={{ width: `${largura}%` }} />
                  )}
                </span>
                <span className="nx-etapas__valor" data-sentido={sentido}>
                  {e.pct == null ? "—" : textoDoValor(e.pct)}
                  <span className="sr-only">{e.pct == null ? " falta dado" : ""}</span>
                </span>
              </button>
            </li>,
          );
          return linhas;
        })}
      </ul>
      <div className="nx-etapas__eixo" aria-hidden>
        <div className="nx-etapas__eixo-miolo">
          <span>▼ caiu</span>
          <span>igual</span>
          <span>subiu ▲</span>
        </div>
      </div>
      <p id={`${base}-fixo`} className="nx-etapas__fixo" role="status" hidden={escolhida == null} data-peca="etapas-fixo">
        {escolhida != null ? linhaFixa(etapas[escolhida], rotuloDoAnterior) : ""}
      </p>
    </section>
  );
}
