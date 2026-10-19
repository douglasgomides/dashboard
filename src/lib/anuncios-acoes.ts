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

/** Uma reserva (em_andamento ou desfazendo) que passou deste tempo é tratada como presa por queda do servidor. */
export const RESERVA_EXPIRA_MIN = 10;
export const reservaExpirada = (criadoEm: string, agora = Date.now()) => agora - Date.parse(criadoEm) > RESERVA_EXPIRA_MIN * 60_000;

export interface EstadoCampanha { status?: string; orcamentos: { id: string; nivel: "campanha" | "conjunto"; daily_budget: number }[] }

/**
 * O desfazer só é seguro se a Meta ainda está do jeito que a ação deixou. Se alguém mexeu depois (status ou orçamento),
 * desfazer apagaria essa mudança. Retorna o motivo da recusa, ou null quando pode desfazer.
 * `atual` traz o status da campanha (quando a ação foi pausar/ativar) e o orçamento atual de cada item que a ação mexeu.
 */
export function motivoRecusarDesfazer(
  tipo: string,
  depois: Partial<EstadoCampanha>,
  atual: { status?: string; orcamentos: Record<string, number | undefined> },
): string | null {
  if (tipo === "pausar" || tipo === "ativar") {
    if (!depois.status) return "Registro da ação sem o estado final; confira na Meta e ajuste manualmente.";
    if (atual.status !== depois.status) return `A campanha foi alterada depois desta ação (status atual: ${atual.status ?? "desconhecido"}). Desfazer sobrescreveria essa mudança; ajuste direto na Meta.`;
    return null;
  }
  const itens = depois.orcamentos ?? [];
  if (!itens.length) return "Registro da ação sem o orçamento final; confira na Meta e ajuste manualmente.";
  for (const o of itens) {
    const agora = atual.orcamentos[o.id];
    if (agora === undefined) return "Não consegui ler o orçamento atual na Meta; nada foi desfeito.";
    if (agora !== o.daily_budget) return `O orçamento foi alterado depois desta ação (agora ${brlCentavos(agora)}, a ação deixou ${brlCentavos(o.daily_budget)}). Desfazer sobrescreveria essa mudança; ajuste direto na Meta.`;
  }
  return null;
}

export const brlCentavos = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
