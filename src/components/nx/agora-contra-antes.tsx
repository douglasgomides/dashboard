import { useId, useState } from "react";
import type { LinhaAgoraContraAntes } from "@/lib/leitura/cinco-resultados";
import "@/styles/nexo-cinco-resultados.css";

// "Você agora contra você antes" (Phase 03.1.1.1, plano 03, D-02): a clínica comparada só com ela mesma. Em cada linha, uma frase, a linha
// de detalhe e uma régua com a bolinha cinza (antes) e a azul (agora); direita = melhor, invertido para custo (a regra já calculou as
// posições). O sinal ▲/▼ vai no texto, nunca só na cor. Linha sem um dos lados fica cinza com o motivo, sem bolinha e sem zero. Só
// apresentação: nenhuma peça busca ou grava dado.

type Qual = "antes" | "agora";

function Linha({ l }: { l: LinhaAgoraContraAntes }) {
  const [dica, setDica] = useState<Qual | null>(null);
  const id = useId();
  if (l.faltaDado) {
    return (
      <li className="nx-agora-antes__linha" data-falta-dado title={l.detalhe}>
        <div className="nx-agora-antes__texto">
          <p className="nx-agora-antes__frase">{l.rotulo}</p>
          <p className="nx-agora-antes__detalhe">{`Falta dado: ${l.faltaDado}.`}</p>
        </div>
      </li>
    );
  }
  const valor = (q: Qual) => l.formatar((q === "antes" ? l.antes : l.agora) as number);
  const textoDaDica = dica === "antes" ? `Antes (${l.rotuloAntes}): ${valor("antes")}` : dica === "agora" ? `Agora: ${valor("agora")}` : "";
  const ponto = (q: Qual) => (
    <button
      type="button"
      className="nx-agora-antes__ponto"
      data-qual={q}
      style={{ left: `${(q === "antes" ? l.posicaoAntes : l.posicaoAgora) ?? 0}%` }}
      aria-label={q === "antes" ? `Antes: ${valor("antes")}` : `Agora: ${valor("agora")}`}
      aria-describedby={dica === q ? id : undefined}
      onMouseEnter={() => setDica(q)}
      onMouseLeave={() => setDica(null)}
      onFocus={() => setDica(q)}
      onBlur={() => setDica(null)}
      onClick={() => setDica(q)}
    >
      <span aria-hidden className="nx-agora-antes__bolinha" />
    </button>
  );
  const anterior = l.posicaoAntes ?? 0;
  const atual = l.posicaoAgora ?? 0;
  return (
    <li className="nx-agora-antes__linha" data-melhor={l.melhor === null ? "igual" : l.melhor ? "sim" : "nao"} title={l.detalhe}>
      <div className="nx-agora-antes__texto">
        <p className="nx-agora-antes__frase">{l.frase}</p>
        {/* No celular só o nome da medida fica à vista (o detalhe inteiro está no title da linha e nas bolinhas). */}
        <p className="nx-agora-antes__rotulo" aria-hidden>
          {l.rotulo}
        </p>
        <p className="nx-agora-antes__detalhe">{l.detalhe}</p>
      </div>
      <div className="nx-agora-antes__regua">
        <div className="nx-agora-antes__trilho" aria-hidden />
        {ponto("antes")}
        {ponto("agora")}
        <span id={id} className="nx-agora-antes__dica" role="status" hidden={!dica} style={{ left: `${Math.min(Math.max(dica === "antes" ? anterior : atual, 14), 86)}%` }}>
          {textoDaDica}
        </span>
        <span className="nx-agora-antes__ponta nx-agora-antes__ponta--pior" aria-hidden>
          pior
        </span>
        <span className="nx-agora-antes__ponta nx-agora-antes__ponta--melhor" aria-hidden>
          melhor
        </span>
      </div>
    </li>
  );
}

export function NxAgoraContraAntes({ linhas }: { linhas: readonly LinhaAgoraContraAntes[] }) {
  const titulo = useId();
  return (
    <section className="nx-agora-antes" aria-labelledby={titulo} data-peca="agora-contra-antes">
      <header className="nx-agora-antes__topo">
        <h2 id={titulo} className="nx-agora-antes__titulo">
          Você agora contra você antes
        </h2>
        <p className="nx-agora-antes__legenda">
          <span className="nx-agora-antes__legenda-longa">Bolinha cinza = antes · azul = agora · direita = melhor</span>
          <span className="nx-agora-antes__legenda-curta" aria-hidden>
            cinza = antes · azul = agora · direita = melhor
          </span>
        </p>
      </header>
      <ul className="nx-agora-antes__lista">
        {linhas.map((l) => (
          <Linha key={l.id} l={l} />
        ))}
      </ul>
      <p className="nx-agora-antes__nota">Só números desta clínica.</p>
    </section>
  );
}
