import { IconeTabler } from "@/components/icons/tabler";

export interface NxChipProps {
  tipo: "sem-selo" | "congelado";
  /** Só a Hoje: o "sem selo" vira uma bolinha cinza que abre a frase (o selo continua honesto, só sai do caminho da leitura). */
  ponto?: boolean;
}

/**
 * Chip neutro e tracejado do resultado da busca (UI-SPEC §Chips): ícone 16 + texto, nunca só cor.
 * "sem selo": o número da tela ainda não tem selo de confiança (rótulo estático do registro até a Phase 6/9).
 * "congelado": tela do SAP, que não muda nesta fase.
 */
export function NxChip({ tipo, ponto }: NxChipProps) {
  if (tipo === "sem-selo" && ponto) {
    return (
      <details className="nx-selo-ponto">
        <summary className="nx-selo-ponto__resumo">
          <span className="nx-selo-ponto__bolinha" role="img" aria-label="Número sem selo de confiança" />
        </summary>
        <p className="nx-selo-ponto__texto">Os números desta tela ainda não têm selo de confiança.</p>
      </details>
    );
  }
  if (tipo === "sem-selo") {
    return (
      <span className="nx-chip nx-chip--sem-selo" role="img" aria-label="Número sem selo de confiança">
        <IconeTabler nome="shield-off" tamanho={16} />
        <span aria-hidden="true">sem selo</span>
      </span>
    );
  }
  return (
    <span className="nx-chip nx-chip--congelado">
      <IconeTabler nome="snowflake" tamanho={16} />
      <span>congelado</span>
    </span>
  );
}
