/**
 * Orçamentos por tipo de procedimento (RPC crm_orcamentos_por_tipo). Feito para painéis em que cada item do orçamento
 * vira um card (Dr. Sergio Maia, WTS): agrupa por tipo, conta paciente em vez de card e separa o que "esfriou"
 * (aberto há mais de 60 dias) do que ainda está em aberto. A equipe Doctor Creator corrige o tipo de um procedimento
 * em crm_procedimento_tipo; a correção passa na frente da regra do banco.
 */
import { supabase } from "@/integrations/supabase/client";
import { LIMITES } from "@/lib/limites";

export const TIPOS_PROCEDIMENTO = [
  "Consulta", "Exame", "Medicação", "Terapia injetável", "Implante hormonal", "Kit", "Programa ou clube", "Estética", "Outros",
] as const;
export type TipoProcedimento = (typeof TIPOS_PROCEDIMENTO)[number];

export interface LinhaTipo {
  tipo: TipoProcedimento;
  itens: number;
  pessoas: number;
  aprovados: number;
  pessoas_aprovadas: number;
  valor_aprovado: number;
  aprovados_sem_valor: number;
  perdidos: number;
  esfriados: number;
  em_aberto: number;
}

export interface NomeProcedimento {
  procedimento: string;
  tipo: TipoProcedimento;
  corrigido: boolean;
  itens: number;
}

export interface OrcamentosPorTipo {
  itens: number;
  cards_sem_procedimento: number;
  /** Cards de contato marcado como Equipe ou Fornecedor no CRM: ficam fora das contas. */
  cards_internos: number;
  pessoas: number;
  pessoas_aprovadas: number;
  valor_aprovado: number;
  valor_por_paciente: number | null;
  pessoas_com_consulta: number;
  consulta_e_compra: number;
  esfriados: number;
  tipos: LinhaTipo[];
  procedimentos: NomeProcedimento[];
}

/** Abaixo disso a tela não aparece: sem procedimento nos cards, agrupar por tipo não diz nada. */
export const MIN_ITENS: number = LIMITES.amostra.crm.itensOrcamento;

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

export function lerOrcamentosPorTipo(bruto: unknown): OrcamentosPorTipo | null {
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Record<string, unknown>;
  const tipos = Array.isArray(r.tipos) ? r.tipos : [];
  const nomes = Array.isArray(r.procedimentos) ? r.procedimentos : [];
  return {
    itens: n(r.itens),
    cards_sem_procedimento: n(r.cards_sem_procedimento),
    cards_internos: n(r.cards_internos),
    pessoas: n(r.pessoas),
    pessoas_aprovadas: n(r.pessoas_aprovadas),
    valor_aprovado: n(r.valor_aprovado),
    valor_por_paciente: r.valor_por_paciente == null ? null : n(r.valor_por_paciente),
    pessoas_com_consulta: n(r.pessoas_com_consulta),
    consulta_e_compra: n(r.consulta_e_compra),
    esfriados: n(r.esfriados),
    tipos: tipos.map((t) => {
      const x = t as Record<string, unknown>;
      return {
        tipo: String(x.tipo) as TipoProcedimento,
        itens: n(x.itens), pessoas: n(x.pessoas), aprovados: n(x.aprovados), pessoas_aprovadas: n(x.pessoas_aprovadas),
        valor_aprovado: n(x.valor_aprovado), aprovados_sem_valor: n(x.aprovados_sem_valor), perdidos: n(x.perdidos),
        esfriados: n(x.esfriados), em_aberto: n(x.em_aberto),
      };
    }),
    procedimentos: nomes.map((p) => {
      const x = p as Record<string, unknown>;
      return { procedimento: String(x.procedimento), tipo: String(x.tipo) as TipoProcedimento, corrigido: x.corrigido === true, itens: n(x.itens) };
    }),
  };
}

export async function getOrcamentosPorTipo(clientId: string, from: string, to: string): Promise<OrcamentosPorTipo | null> {
  const cliente = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await cliente.rpc("crm_orcamentos_por_tipo", { p_client_id: clientId, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return lerOrcamentosPorTipo(data);
}

/** Correção feita pela equipe: o nome do procedimento passa a contar no tipo escolhido. */
export async function corrigirTipo(clientId: string, procedimento: string, tipo: TipoProcedimento): Promise<void> {
  const cliente = supabase as unknown as {
    from: (t: string) => { upsert: (row: Record<string, unknown>, o: { onConflict: string }) => Promise<{ error: { message: string } | null }> };
  };
  const { error } = await cliente.from("crm_procedimento_tipo").upsert(
    { client_id: clientId, procedimento, tipo, confirmado_em: new Date().toISOString() },
    { onConflict: "client_id,procedimento" },
  );
  if (error) throw new Error(error.message);
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Frases curtas para o topo do painel. Só fala do que o número sustenta. */
export function conclusoesOrcamentos(d: OrcamentosPorTipo): string[] {
  if (d.itens < MIN_ITENS) return [];
  const out: string[] = [];
  if (d.pessoas > 0 && d.itens > d.pessoas * 1.3) {
    out.push(`São ${d.itens} itens de orçamento, mas só ${d.pessoas} pacientes: em média ${(d.itens / d.pessoas).toFixed(1).replace(".", ",")} itens por paciente. Conte paciente, não card.`);
  }
  if (d.valor_por_paciente) out.push(`Cada paciente que aprovou algo deixou em média ${brl(d.valor_por_paciente)} no período.`);
  const total = d.tipos.reduce((s, t) => s + t.valor_aprovado, 0);
  const maior = [...d.tipos].sort((a, b) => b.valor_aprovado - a.valor_aprovado)[0];
  if (maior && total > 0 && pct(maior.valor_aprovado, total) >= 30) {
    out.push(`${maior.tipo} responde por ${pct(maior.valor_aprovado, total)}% do valor aprovado. Médias que juntam todos os tipos ficam puxadas por ele.`);
  }
  const abertos = d.tipos.reduce((s, t) => s + t.em_aberto + t.esfriados, 0);
  if (d.esfriados > 0 && pct(d.esfriados, abertos) >= 40) {
    out.push(`${d.esfriados} de ${abertos} orçamentos em aberto estão parados há mais de 60 dias. Provavelmente o paciente desistiu e o card não foi fechado como Cancelado.`);
  }
  const perdidos = d.tipos.reduce((s, t) => s + t.perdidos, 0);
  const aprovados = d.tipos.reduce((s, t) => s + t.aprovados, 0);
  if (aprovados >= 20 && perdidos < aprovados * 0.05) {
    out.push(`Quase nenhum orçamento é marcado como perdido (${perdidos}). Por isso a taxa "ganhos ÷ (ganhos + perdidos)" fica perto de 100% e não mede conversão.`);
  }
  const semValor = d.tipos.reduce((s, t) => s + t.aprovados_sem_valor, 0);
  if (aprovados > 0 && pct(semValor, aprovados) >= 15) {
    out.push(`${semValor} orçamentos aprovados estão sem valor no card (${pct(semValor, aprovados)}%). O valor aprovado real é maior que o mostrado.`);
  }
  return out;
}
