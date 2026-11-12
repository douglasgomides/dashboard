import type { PessoasNaMesa } from "@/lib/leitura/cinco-pacientes";
import "@/styles/nexo-pessoas-na-mesa.css";

// Pessoas na mesa (Phase 03.1.1.1, plano 05, D-01): o desenho do cartão "Pessoas na mesa" de "Do contato à venda". Uma grade de pontos,
// cada um vale `porPonto` leads: ponto cheio = atendido, ponto vazado = ainda esperando. A diferença também está na legenda escrita,
// nunca só na cor. Sem a medida de Atendido (ou com o funil fora de ordem) o cartão diz "Falta dado: motivo" em cinza e não desenha ponto
// nenhum (D-05: nunca 0). Só apresentação: a regra já calculou tudo, e nenhuma peça busca, grava ou envia.

export interface NxPessoasNaMesaProps {
  mesa: PessoasNaMesa;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

export function NxPessoasNaMesa({ mesa }: NxPessoasNaMesaProps) {
  if (mesa.faltaDado != null) {
    return (
      <p className="nx-cinco-falta" data-falta-dado>
        {`Falta dado: ${mesa.faltaDado}`}
      </p>
    );
  }
  const { atendidos, esperando, porPonto, pontos, pontosAtendidos } = mesa;
  const cadaPonto = `cada ponto = ${fmt(porPonto)} ${porPonto === 1 ? "lead" : "leads"}`;
  return (
    <div className="nx-mesa" data-peca="pessoas-na-mesa">
      <div className="nx-mesa__pontos" role="img" aria-label={`${fmt(atendidos)} atendidos e ${fmt(esperando)} esperando, ${cadaPonto}`}>
        {Array.from({ length: pontos }, (_, k) => (
          <span key={k} className="nx-mesa__ponto" data-estado={k < pontosAtendidos ? "atendido" : "esperando"} aria-hidden />
        ))}
      </div>
      <p className="nx-mesa__legenda">
        <span className="nx-mesa__chave" data-estado="atendido">
          atendidos
        </span>
        <span className="nx-mesa__chave" data-estado="esperando">
          esperando
        </span>
        <span className="nx-mesa__escala">{cadaPonto}</span>
      </p>
    </div>
  );
}
