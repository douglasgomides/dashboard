import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { useIsMobile } from "@/hooks/use-is-mobile";

// Peças para os gráficos (Recharts) caberem em qualquer tela.
//
// - CaixaGrafico: o ResponsiveContainer só encolhe se o pai puder encolher.
//   Dentro de grid/flex o pai cresce até o tamanho do conteúdo (min-width: auto)
//   e o gráfico empurra a página para o lado. Aqui o pai tem min-width: 0.
// - useEixos: no celular, menos marcas no eixo (só as que cabem, sempre com a
//   primeira e a última), fonte menor e eixo Y mais estreito.
// - LEGENDA: legenda que quebra linha em vez de vazar.

export function CaixaGrafico({ altura = 240, alturaMobile, children }: { altura?: number; alturaMobile?: number; children: ReactNode }) {
  const mobile = useIsMobile();
  const h = mobile && alturaMobile ? alturaMobile : altura;
  return (
    <div className="grafico-caixa" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export function useEixos() {
  const mobile = useIsMobile();
  return {
    mobile,
    x: {
      interval: "preserveStartEnd" as const,
      minTickGap: mobile ? 28 : 12,
      tick: { fontSize: mobile ? 11 : 12 },
      tickMargin: 6,
    },
    y: {
      width: mobile ? 36 : 48,
      tick: { fontSize: mobile ? 11 : 12 },
      tickCount: mobile ? 4 : 5,
    },
  };
}

export const LEGENDA = {
  wrapperStyle: { fontSize: 12, lineHeight: "18px", paddingTop: 4, whiteSpace: "normal" as const },
  iconSize: 10,
};
