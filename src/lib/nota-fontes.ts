// Nota de saúde das fontes de um cliente (0 a 100): um número só para comparar clientes e achar quem precisa
// de atenção primeiro. Usa a regra única de status (status-fonte.ts) e os problemas de dado (qualidade_dados).
// Lógica pura (teste: scripts/test-nota-fontes.ts).
//
//   Base: média das fontes ligadas (em dia 100, atrasada 60, parada/erro/sem dado 0).
//   Descontos: Instagram, Anúncios ou CRM não ligados e não marcados como "não usa" (-10 cada: falta decidir);
//              cada problema de dado que afeta a leitura (-15) ou de atenção (-5), no máximo -40 no total.
//   WhatsApp não ligado não desconta: só existe para quem usa a API do WTS.
//   Faixas: 85 ou mais boa · 60 a 84 atenção · abaixo de 60 ruim. Sem nenhuma fonte ligada: sem nota.

import type { CorStatus, FonteId, StatusFonte } from "@/lib/status-fonte";
import { NOME_FONTE } from "@/lib/status-fonte";
import type { BarraDoFato } from "@/lib/leitura/tipos";

export type FaixaNota = "boa" | "atencao" | "ruim";

export interface NotaFontes {
  nota: number | null;
  faixa: FaixaNota | null;
  cor: CorStatus;
  /** Por que não é 100, em frases curtas (para o title e o detalhe). */
  motivos: string[];
}

const PONTOS: Record<CorStatus, number | null> = { verde: 100, amarelo: 60, vermelho: 0, cinza: null };
const OBRIGATORIAS: FonteId[] = ["instagram", "anuncios", "crm"];

export function notaDasFontes(status: Partial<Record<FonteId, StatusFonte>>, problemas: { severidade: "alta" | "media" | "baixa" }[] = []): NotaFontes {
  const motivos: string[] = [];
  const ligadas = (Object.entries(status) as [FonteId, StatusFonte][]).filter(([, s]) => s.ligado);
  if (!ligadas.length) return { nota: null, faixa: null, cor: "cinza", motivos: ["Nenhuma fonte ligada"] };

  let soma = 0;
  for (const [f, s] of ligadas) {
    soma += PONTOS[s.cor] ?? 0;
    if (s.cor === "amarelo") motivos.push(`${NOME_FONTE[f]} atrasada (${s.dias} dias)`);
    if (s.cor === "vermelho") motivos.push(`${NOME_FONTE[f]} ${s.rotulo.toLowerCase()}${s.dias != null ? ` (${s.dias} dias)` : ""}`);
  }
  let nota = soma / ligadas.length;

  for (const f of OBRIGATORIAS) {
    const s = status[f];
    if (s && !s.ligado && !s.naoUsa) {
      nota -= 10;
      motivos.push(`${NOME_FONTE[f]} não ligado (ligar ou marcar "não usa")`);
    }
  }

  const altas = problemas.filter((p) => p.severidade === "alta").length;
  // "baixa" é informativo (ex.: CRM compartilhado de propósito): não desconta da nota.
  const medias = problemas.filter((p) => p.severidade === "media").length;
  const desconto = Math.min(40, altas * 15 + medias * 5);
  if (desconto) {
    nota -= desconto;
    motivos.push(`${problemas.length} problema${problemas.length === 1 ? "" : "s"} de dado${altas ? ` (${altas} afeta${altas === 1 ? "" : "m"} a leitura)` : ""}`);
  }

  const final = Math.max(0, Math.min(100, Math.round(nota)));
  const faixa: FaixaNota = final >= 85 ? "boa" : final >= 60 ? "atencao" : "ruim";
  return { nota: final, faixa, cor: faixa === "boa" ? "verde" : faixa === "atencao" ? "amarelo" : "vermelho", motivos };
}

export const ROTULO_FAIXA: Record<FaixaNota, string> = { boa: "Boa", atencao: "Atenção", ruim: "Ruim" };

const ORDEM_FONTES: FonteId[] = ["instagram", "anuncios", "crm", "atendimento"];

/**
 * A nota explicada em barras, para o painel da clínica. Espelha a conta de notaDasFontes: uma barra por fonte ligada (a fração é o
 * ponto da fonte sobre 100), uma barra listrada "Não ligado" por fonte obrigatória sem decisão e uma barra dos problemas de dado
 * (fração = o que sobrou do teto de desconto de 40). Só mostra o que a nota usou: nenhuma promessa de ponto por correção. Sem
 * nenhuma fonte ligada não há nota, então não há barra.
 */
export function fatoresDaNota(status: Partial<Record<FonteId, StatusFonte>>, problemas: { severidade: "alta" | "media" | "baixa" }[] = []): BarraDoFato[] {
  const ligadas = ORDEM_FONTES.filter((f) => status[f]?.ligado);
  if (!ligadas.length) return [];
  const barras: BarraDoFato[] = [];
  for (const f of ligadas) {
    const s = status[f]!;
    const pontos = PONTOS[s.cor] ?? 0;
    const palavra = s.cor === "verde" ? "em dia" : s.cor === "amarelo" ? "atrasada" : s.rotulo.toLowerCase();
    barras.push({ rotulo: NOME_FONTE[f], exibicao: `${palavra}${s.cor !== "verde" && s.dias != null ? ` (${s.dias} dias)` : ""}`, fracao: pontos / 100 });
  }
  for (const f of OBRIGATORIAS) {
    const s = status[f];
    if (s && !s.ligado && !s.naoUsa) barras.push({ rotulo: NOME_FONTE[f], exibicao: "Não ligado", fracao: 0, faltou: true });
  }
  if (problemas.length) {
    const altas = problemas.filter((p) => p.severidade === "alta").length;
    const medias = problemas.filter((p) => p.severidade === "media").length;
    const desconto = Math.min(40, altas * 15 + medias * 5);
    barras.push({ rotulo: "Problemas de dado", exibicao: `${problemas.length}${altas ? (altas === 1 ? " (afeta a leitura)" : " (afetam a leitura)") : ""}`, fracao: 1 - desconto / 40 });
  }
  return barras;
}
