import { z } from "zod";

const texto = z.string().max(4000);
const lista = z.array(z.string().max(2000)).max(100);

const OBJECOES = ["preco", "convenio", "distancia", "adiamento", "agenda", "medo", "desconfianca", "outro"];
const FALHAS = ["sem_resposta", "demora", "desvio_preco", "preco_sem_ancoragem", "sem_cta", "sem_follow_up", "nome_errado", "informacao_inconsistente", "pressao", "so_emoji", "desconto_reativo", "excesso_audio"];

/**
 * Arruma desvios de forma comuns da IA antes de validar, sem inventar conteúdo: texto nulo vira "", item fora
 * da lista sai da lista, nota fora de 0 a 10 é limitada, e conversa não comercial perde a ação comercial.
 * Campos que faltam ou com valor fora do esperado continuam reprovando na validação.
 */
const ORIGENS = ["anuncio", "instagram", "indicacao", "paciente_antigo", "desconhecida"] as const;

export function normalizarResumoConversa(bruto: unknown): unknown {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return bruto;
  const r = { ...(bruto as Record<string, unknown>) };
  const corta = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : v);
  for (const k of ["motivo", "resumo", "interesse", "atendente", "evidencia", "como_deveria", "proximo_passo", "alerta"]) r[k] = corta(r[k], 4000);
  for (const k of ["evidencia", "como_deveria"]) if (r[k] == null) r[k] = "";
  const filtra = (v: unknown, ok: string[], max: number) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string" && ok.includes(x)))].slice(0, max) : v);
  r.objecoes = filtra(r.objecoes ?? [], OBJECOES, 8);
  r.falhas = filtra(r.falhas ?? [], FALHAS, 12);
  const a = r.atendimento;
  if (a && typeof a === "object" && !Array.isArray(a)) {
    const at = { ...(a as Record<string, unknown>) };
    if (typeof at.nota_0a10 === "string" && at.nota_0a10.trim() !== "" && Number.isFinite(Number(at.nota_0a10))) at.nota_0a10 = Number(at.nota_0a10);
    if (typeof at.nota_0a10 === "number") at.nota_0a10 = Math.min(10, Math.max(0, at.nota_0a10));
    for (const k of ["pontos_fortes", "pontos_a_melhorar"]) {
      if (at[k] == null) at[k] = [];
      if (Array.isArray(at[k])) at[k] = (at[k] as unknown[]).filter((x) => typeof x === "string").map((x) => (x as string).slice(0, 2000)).slice(0, 100);
    }
    r.atendimento = at;
  }
  // A IA às vezes escreve a categoria com acento, maiúscula ou espaço ("Paciente antigo", "agendou "). Padroniza a
  // escrita; origem fora da lista vira "desconhecida" (nunca chutar origem). Etapa fora da lista continua inválida.
  const chaveIA = (v: unknown) => (typeof v === "string" ? v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[\s-]+/g, "_") : v);
  r.origem = chaveIA(r.origem);
  if (r.origem == null || (typeof r.origem === "string" && !(ORIGENS as readonly string[]).includes(r.origem))) r.origem = "desconhecida";
  r.etapa = chaveIA(r.etapa);
  if (r.comercial === false) {
    r.recuperavel = false;
    r.proximo_passo = null;
  }
  return r;
}

/** JSON do provedor é dado externo: só entra no banco depois de validar o contrato. */
export const conversationSummarySchema = z.object({
  motivo: texto.min(1), resumo: texto.min(1), comercial: z.boolean(), interesse: texto.nullable(),
  origem: z.enum(ORIGENS),
  etapa: z.enum(["so_robo", "sem_resposta_paciente", "engajou", "qualificacao", "preco_apresentado", "agendamento_em_curso", "agendou", "nao_e_paciente"]),
  preco_pedido: z.boolean(), preco_apresentado: z.boolean(),
  objecoes: z.array(z.enum(["preco", "convenio", "distancia", "adiamento", "agenda", "medo", "desconfianca", "outro"])).max(8),
  falhas: z.array(z.enum(["sem_resposta", "demora", "desvio_preco", "preco_sem_ancoragem", "sem_cta", "sem_follow_up", "nome_errado", "informacao_inconsistente", "pressao", "so_emoji", "desconto_reativo", "excesso_audio"])).max(12),
  situacao: z.enum(["agendou", "em_negociacao", "aguardando_clinica", "aguardando_paciente", "desistiu", "so_informacao", "outro"]),
  recuperavel: z.boolean(), atendente: texto.nullable(),
  atendimento: z.object({ nota: z.enum(["bom", "regular", "ruim"]), nota_0a10: z.number().min(0).max(10), pontos_fortes: lista, pontos_a_melhorar: lista }),
  evidencia: texto, como_deveria: texto, proximo_passo: texto.nullable(), alerta: texto.nullable(),
}).superRefine((value, ctx) => {
  if (!value.comercial && (value.recuperavel || value.proximo_passo !== null)) ctx.addIssue({ code: "custom", message: "Conversa administrativa não pode gerar ação comercial" });
});

export const sessionDraftSchema = z.object({
  resumo: texto.min(1), decisoes: lista, kpis: lista, acoes_clinica: lista, acoes_dc: lista,
  citacoes: lista, conferir: lista, riscos: lista, mensagem: texto,
});
