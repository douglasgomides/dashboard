import { IconeTabler } from "@/components/icons/tabler";

export interface NxChipProps {
  tipo: "sem-selo" | "congelado";
}

/**
 * Chip neutro e tracejado do resultado da busca (UI-SPEC §Chips): ícone 16 + texto, nunca só cor.
 * "sem selo": o número da tela ainda não tem selo de confiança (rótulo estático do registro até a Phase 6/9).
 * "congelado": tela do SAP, que não muda nesta fase.
 */
export function NxChip({ tipo }: NxChipProps) {
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
