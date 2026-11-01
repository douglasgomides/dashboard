// Ações nos anúncios com 1 clique (o agente prepara, uma pessoa aprova, o servidor aplica pela API da Meta).
// Travas: orçamento muda no máximo 20% por vez e no máximo 1 mudança por campanha a cada 24 h; pausar só quando o
// sinal da etapa pede (C1/C2 seguidor caro, C3 sem resultado); tudo registrado com o estado anterior para desfazer.
// Servidor: api/_lib/anuncios-acoes.ts. Testes: scripts/test-anuncios-acoes.ts.

export type TipoAcao = "pausar" | "ativar" | "orcamento";
export const LIMITE_PCT = 20;
export const INTERVALO_H = 24;

/** Ações oferecidas para cada sinal do Gestor de anúncios. */
export function acoesDoSinal(tipo: string): { tipo: TipoAcao; pct?: number; rotulo: string }[] {
  if (tipo === "escalar" || tipo === "perfil_escalar") return [{ tipo: "orcamento", pct: 20, rotulo: "Aumentar orçamento em 20%" }];
  if (tipo === "custo_subiu") return [{ tipo: "orcamento", pct: -20, rotulo: "Reduzir orçamento em 20%" }];
  if (tipo === "seguidor_caro" || tipo === "sem_resultado") return [{ tipo: "pausar", rotulo: "Pausar campanha" }, { tipo: "orcamento", pct: -20, rotulo: "Reduzir orçamento em 20%" }];
  return [];
}

/** Novo orçamento (centavos da moeda da conta), respeitando o limite de 20% e um mínimo de R$ 1,00/dia. */
export function novoOrcamento(atualCentavos: number, pct: number): number {
  const p = Math.max(-LIMITE_PCT, Math.min(LIMITE_PCT, pct));
  return Math.max(100, Math.round(atualCentavos * (1 + p / 100)));
}

export interface AcaoAnterior { campanha_id: string; estado: string; aplicado_em: string | null }

/** Pode aplicar agora? Bloqueia se já houve mudança aplicada na mesma campanha nas últimas 24 h. */
export function podeAplicar(campanhaId: string, historico: AcaoAnterior[], agora = Date.now()): { ok: boolean; motivo?: string } {
  const recente = historico.find((h) => h.campanha_id === campanhaId && h.estado === "aplicada" && h.aplicado_em && agora - Date.parse(h.aplicado_em) < INTERVALO_H * 3_600_000);
  if (recente) return { ok: false, motivo: `Esta campanha já teve uma mudança nas últimas ${INTERVALO_H} h. Espere o efeito antes de mexer de novo.` };
  return { ok: true };
}

/**
 * Meta: o orçamento de um conjunto de anúncios "only allowed to change 4 times per hour" (doc da Marketing API, lida em
 * 01/11/2026). A 5ª troca na hora é recusada pela Meta; o Nexo recusa antes, com motivo claro. Conta as trocas feitas
 * pelo Nexo (aplicar e desfazer) por conjunto/campanha; trocas feitas direto no Gerenciador não aparecem aqui.
 */
export const TROCAS_ORCAMENTO_POR_HORA = 4;

export interface MudancaOrcamento {
  tipo: string;
  estado: string;
  antes?: { orcamentos?: { id?: string }[] } | null;
  depois?: { orcamentos?: { id?: string }[] } | null;
  aplicado_em?: string | null;
  desfeito_em?: string | null;
}

/** Quantas trocas de orçamento cada objeto (conjunto ou campanha) teve na última hora. */
export function trocasDeOrcamentoNaHora(historico: MudancaOrcamento[], agora = Date.now()): Map<string, number> {
  const conta = new Map<string, number>();
  const naHora = (t?: string | null) => !!t && Number.isFinite(Date.parse(t)) && agora - Date.parse(t) < 3_600_000 && Date.parse(t) <= agora + 60_000;
  const somar = (lista?: { id?: string }[] | null) => { for (const o of lista ?? []) if (o?.id) conta.set(o.id, (conta.get(o.id) ?? 0) + 1); };
  for (const h of historico) {
    if (h.tipo !== "orcamento") continue;
    // Aplicar troca o orçamento dos objetos em "depois"; desfazer volta os de "antes". Uma ação desfeita contou as duas.
    if ((h.estado === "aplicada" || h.estado === "desfeita") && naHora(h.aplicado_em)) somar(h.depois?.orcamentos);
    if (h.estado === "desfeita" && naHora(h.desfeito_em)) somar(h.antes?.orcamentos);
  }
  return conta;
}

/** Recusa quando algum dos objetos já teve 4 trocas na última hora. */
export function podeTrocarOrcamento(ids: string[], historico: MudancaOrcamento[], agora = Date.now()): { ok: boolean; motivo?: string } {
  const conta = trocasDeOrcamentoNaHora(historico, agora);
  const cheio = ids.filter((id) => (conta.get(id) ?? 0) >= TROCAS_ORCAMENTO_POR_HORA);
  if (!cheio.length) return { ok: true };
  return {
    ok: false,
    motivo: `A Meta só aceita ${TROCAS_ORCAMENTO_POR_HORA} trocas de orçamento por hora em cada conjunto de anúncios, e ${cheio.length === 1 ? "um conjunto desta campanha já teve" : `${cheio.length} conjuntos desta campanha já tiveram`} ${TROCAS_ORCAMENTO_POR_HORA} na última hora. Tente de novo daqui a uma hora.`,
  };
}

export const brlCentavos = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
