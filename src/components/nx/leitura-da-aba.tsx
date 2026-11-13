import type { ReactNode } from "react";
import { NxChip } from "@/components/nx-chip";
import type { DateRangeState } from "@/lib/date-range";
import type { Descoberta } from "@/lib/leitura/cinco-segundos";
import { periodoDoVerTudo } from "@/lib/leitura/leitura-em-descobertas";
import type { FatosDaTela } from "@/lib/leitura/tipos";
import { NxDescobertas, NxMaisDescobertas } from "./cinco-segundos";

// A leitura do período nas abas das pastas (quick-ver-tudo-abas, João 13/11/2026). A caixa "Leitura do período" saiu; no lugar dela,
// no topo da aba, até 3 descobertas no mesmo desenho das telas principais (selo, frase curta, número em destaque, UMA ação e "Por
// quê?"). Sem veredito azul: a aba guarda o desenho dela (A-02). O período e o "sem selo" moram uma vez só, pequenos, no começo dos
// Detalhes. Só apresentação: as descobertas vêm prontas da regra (src/lib/leitura/leitura-das-abas.ts).

/**
 * O topo da aba no lugar da leitura antiga. Sempre desenhado (mesmo vazio), para a tela marcar que montou (`data-modo`): "carregando"
 * enquanto os fatos não chegam, "pronta" depois. Sem descoberta, não ocupa altura.
 */
export function NxDescobertasDaAba({ itens, carregando, clientId, dateRange, aoAgir }: { itens: readonly Descoberta[]; carregando: boolean; clientId: string; dateRange?: DateRangeState; aoAgir?: (local: string) => void }) {
  return (
    <div className="nx-descobertas-da-aba" data-peca="descobertas-da-aba" data-modo={carregando ? "carregando" : "pronta"}>
      {!carregando && itens.length > 0 && <NxDescobertas titulo="O que descobrimos" itens={itens} clientId={clientId} dateRange={dateRange} aoAgir={aoAgir} />}
    </div>
  );
}

/** "15/10 a 13/11, comparado com 15/09 a 14/10" (ou "Situação de hoje, 13/11") e o "sem selo", uma vez só, pequenos. */
export function NxPeriodoDaAba({ fatos, semSelo = true }: { fatos: FatosDaTela | null; semSelo?: boolean }) {
  const periodo = fatos ? (fatos.tipoPeriodo === "hoje" ? `Situação de hoje, ${fatos.periodo.ate.slice(8, 10)}/${fatos.periodo.ate.slice(5, 7)}` : periodoDoVerTudo(fatos)) : null;
  if (!periodo && !semSelo) return null;
  return (
    <p className="nx-ver-tudo__periodo" data-peca="periodo-do-ver-tudo">
      {periodo && <span>{periodo}</span>}
      {semSelo && <NxChip tipo="sem-selo" />}
    </p>
  );
}

/** O começo dos Detalhes da aba: o período, o "sem selo" e as descobertas que passaram das 3 à vista. Depois vêm os blocos da aba. */
export function NxComecoDosDetalhes({ fatos, resto, clientId, dateRange, aoAgir, children }: { fatos: FatosDaTela | null; resto: readonly Descoberta[]; clientId: string; dateRange?: DateRangeState; aoAgir?: (local: string) => void; children?: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <NxPeriodoDaAba fatos={fatos} />
      <NxMaisDescobertas itens={resto} clientId={clientId} dateRange={dateRange} aoAgir={aoAgir} />
      {children}
    </div>
  );
}
