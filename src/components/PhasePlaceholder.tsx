import { NxVazio } from "@/components/nx/blocos";
import type { Responsavel } from "@/lib/insight";

/**
 * Tela em construção honesta: diz o que falta e quem resolve. O texto técnico de fase (`phase`) não aparece mais
 * para o usuário; fica só no atributo data-fase, para a equipe achar de onde a tela veio.
 */
export function PhasePlaceholder({
  phase,
  title,
  description,
  falta,
  quem,
}: {
  phase: string;
  title: string;
  description: string;
  falta?: string;
  quem?: Responsavel;
}) {
  return (
    <div data-fase={phase}>
      <NxVazio titulo={title} falta={falta ?? description} quem={quem ?? "equipe_hub"} emConstrucao />
    </div>
  );
}
