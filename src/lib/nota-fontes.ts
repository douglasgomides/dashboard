// Nota de saúde das fontes de um cliente (0 a 100): um número só para comparar clientes e achar quem precisa
// de atenção primeiro. Usa a regra única de status (status-fonte.ts) e os problemas de dado (qualidade_dados).
// Lógica pura (teste: scripts/test-nota-fontes.ts).
//
//   Base: média das fontes ligadas (em dia 100, atrasada 60, parada/erro/sem dado 0).
//   Neutra (fora da média): fonte ligada em cinza "Parada pelo cliente" (a leitura roda, quem parou foi o cliente: limite de
//              gastos, pagamento, WhatsApp exigido) ou "Sem movimento" (a leitura roda, a origem não teve atividade). É estado
//              do negócio, não falha: vira alerta em `motivos`. Sem nenhuma fonte na média, a base é 100.
//   Planilha manual atrasada (dono do motivo "manual"): 60, como atrasada. Lançar a planilha é tarefa da equipe, nunca 0.
//   Descontos: Instagram, Anúncios ou CRM não ligados e não marcados como "não usa" (-10 cada: falta decidir);
//              cada problema de dado que afeta a leitura (-15) ou de atenção (-5), no máximo -40 no total.
//   Um fato, um desconto (problemasQueContam): "ads-sem-gasto" não desconta com Anúncios já "Parada pelo cliente";
//              "sync-erro-<fonte>" não desconta com a fonte já vermelha "Erro"; a mesma família (id sem "-30d"/"-90d")
//              conta uma vez, com a maior severidade. Problema sem id conta um a um.
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

/** Um problema de dado como a nota precisa: o id (quando há) decide o que repete outro fato. ProblemaDado cabe aqui. */
export interface ProblemaDaNota {
  id?: string;
  severidade: "alta" | "media" | "baixa";
}

const PESO_SEVERIDADE: Record<ProblemaDaNota["severidade"], number> = { alta: 3, media: 2, baixa: 1 };
const familia = (id: string) => id.replace(/-(30d|90d)$/, "");

/**
 * Os problemas que descontam da nota, um por fato e na ordem em que chegaram: tira "ads-sem-gasto" quando Anúncios já está
 * "Parada pelo cliente" (é a mesma conta parada), tira "sync-erro-<fonte>" quando a fonte já está vermelha "Erro" (o erro
 * já zerou a fonte) e junta a mesma família (id sem "-30d"/"-90d") num item só, com a maior severidade. Sem id, passa.
 */
export function problemasQueContam<P extends ProblemaDaNota>(status: Partial<Record<FonteId, StatusFonte>>, problemas: readonly P[] = []): P[] {
  const saida: P[] = [];
  const porFamilia = new Map<string, number>();
  for (const p of problemas) {
    if (!p.id) {
      saida.push(p);
      continue;
    }
    if (p.id === "ads-sem-gasto" && status.anuncios?.rotulo === "Parada pelo cliente") continue;
    if (p.id.startsWith("sync-erro-")) {
      const s = status[p.id.slice("sync-erro-".length) as FonteId];
      if (s && s.cor === "vermelho" && s.rotulo === "Erro") continue;
    }
    const chave = familia(p.id);
    const onde = porFamilia.get(chave);
    if (onde == null) {
      porFamilia.set(chave, saida.length);
      saida.push(p);
    } else if (PESO_SEVERIDADE[p.severidade] > PESO_SEVERIDADE[saida[onde].severidade]) {
      saida[onde] = p;
    }
  }
  return saida;
}

type Tratamento = { tipo: "conta"; pontos: number } | { tipo: "neutra" } | { tipo: "planilha"; pontos: number };

/** Como a fonte ligada entra na conta: na média com os pontos da cor, neutra (fora da média) ou planilha manual (60). */
function tratamento(s: StatusFonte): Tratamento {
  if (s.cor === "cinza" && (s.rotulo === "Parada pelo cliente" || s.rotulo === "Sem movimento")) {
    return s.dono === "manual" ? { tipo: "planilha", pontos: 60 } : { tipo: "neutra" };
  }
  return { tipo: "conta", pontos: PONTOS[s.cor] ?? 0 };
}

const desde = (s: StatusFonte) => (s.data ? ` desde ${s.data}` : "");

function descontoDosProblemas(contam: readonly ProblemaDaNota[]) {
  const altas = contam.filter((p) => p.severidade === "alta").length;
  // "baixa" é informativo (ex.: CRM compartilhado de propósito): não desconta da nota.
  const medias = contam.filter((p) => p.severidade === "media").length;
  return { altas, desconto: Math.min(40, altas * 15 + medias * 5) };
}

export function notaDasFontes(status: Partial<Record<FonteId, StatusFonte>>, problemas: readonly ProblemaDaNota[] = []): NotaFontes {
  const motivos: string[] = [];
  const ligadas = (Object.entries(status) as [FonteId, StatusFonte][]).filter(([, s]) => s.ligado);
  if (!ligadas.length) return { nota: null, faixa: null, cor: "cinza", motivos: ["Nenhuma fonte ligada"] };

  let soma = 0;
  let naMedia = 0;
  for (const [f, s] of ligadas) {
    const t = tratamento(s);
    if (t.tipo === "neutra") {
      motivos.push(s.rotulo === "Parada pelo cliente" ? `${NOME_FONTE[f]} parada pelo cliente: quem resolve é o cliente` : `${NOME_FONTE[f]} sem movimento${desde(s)}`);
      continue;
    }
    soma += t.pontos;
    naMedia++;
    if (t.tipo === "planilha") motivos.push(`${NOME_FONTE[f]} por planilha sem lançamento${desde(s)}: quem resolve é a equipe`);
    else if (s.cor === "amarelo") motivos.push(`${NOME_FONTE[f]} atrasada (${s.dias} dias)`);
    else if (s.cor === "vermelho") motivos.push(`${NOME_FONTE[f]} ${s.rotulo.toLowerCase()}${s.dias != null ? ` (${s.dias} dias)` : ""}`);
  }
  let nota = naMedia ? soma / naMedia : 100;

  for (const f of OBRIGATORIAS) {
    const s = status[f];
    if (s && !s.ligado && !s.naoUsa) {
      nota -= 10;
      motivos.push(`${NOME_FONTE[f]} não ligado (ligar ou marcar "não usa")`);
    }
  }

  const contam = problemasQueContam(status, problemas);
  const { altas, desconto } = descontoDosProblemas(contam);
  if (desconto) {
    nota -= desconto;
    motivos.push(`${contam.length} problema${contam.length === 1 ? "" : "s"} de dado${altas ? ` (${altas} afeta${altas === 1 ? "" : "m"} a leitura)` : ""}`);
  }

  const final = Math.max(0, Math.min(100, Math.round(nota)));
  const faixa: FaixaNota = final >= 85 ? "boa" : final >= 60 ? "atencao" : "ruim";
  return { nota: final, faixa, cor: faixa === "boa" ? "verde" : faixa === "atencao" ? "amarelo" : "vermelho", motivos };
}

export const ROTULO_FAIXA: Record<FaixaNota, string> = { boa: "Boa", atencao: "Atenção", ruim: "Ruim" };

const ORDEM_FONTES: FonteId[] = ["instagram", "anuncios", "crm", "atendimento"];

/**
 * A nota explicada em barras, para o painel da clínica. Espelha a conta de notaDasFontes: uma barra por fonte ligada (a fração é o
 * ponto da fonte sobre 100; a fonte neutra fica cheia com "(fora da conta)"; a planilha manual atrasada vale 0,6), uma barra
 * listrada "Não ligado" por fonte obrigatória sem decisão e uma barra dos problemas de dado que contam (problemasQueContam;
 * fração = o que sobrou do teto de desconto de 40). Só mostra o que a nota usou: nenhuma promessa de ponto por correção. Sem
 * nenhuma fonte ligada não há nota, então não há barra.
 */
export function fatoresDaNota(status: Partial<Record<FonteId, StatusFonte>>, problemas: readonly ProblemaDaNota[] = []): BarraDoFato[] {
  const ligadas = ORDEM_FONTES.filter((f) => status[f]?.ligado);
  if (!ligadas.length) return [];
  const barras: BarraDoFato[] = [];
  for (const f of ligadas) {
    const s = status[f]!;
    const t = tratamento(s);
    if (t.tipo === "neutra") {
      barras.push({ rotulo: NOME_FONTE[f], exibicao: `${s.rotulo.toLowerCase()} (fora da conta)`, fracao: 1 });
      continue;
    }
    const palavra = t.tipo === "planilha" ? "planilha sem lançamento" : s.cor === "verde" ? "em dia" : s.cor === "amarelo" ? "atrasada" : s.rotulo.toLowerCase();
    barras.push({ rotulo: NOME_FONTE[f], exibicao: `${palavra}${s.cor !== "verde" && s.dias != null ? ` (${s.dias} dias)` : ""}`, fracao: t.pontos / 100 });
  }
  for (const f of OBRIGATORIAS) {
    const s = status[f];
    if (s && !s.ligado && !s.naoUsa) barras.push({ rotulo: NOME_FONTE[f], exibicao: "Não ligado", fracao: 0, faltou: true });
  }
  const contam = problemasQueContam(status, problemas);
  if (contam.length) {
    const { altas, desconto } = descontoDosProblemas(contam);
    barras.push({ rotulo: "Problemas de dado", exibicao: `${contam.length}${altas ? (altas === 1 ? " (afeta a leitura)" : " (afetam a leitura)") : ""}`, fracao: 1 - desconto / 40 });
  }
  return barras;
}
