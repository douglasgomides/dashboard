import { z } from "zod";

const texto = z.string().max(4000);
const lista = z.array(z.string().max(2000)).max(100);

/** JSON do provedor é dado externo: só entra no banco depois de validar o contrato. */
export const conversationSummarySchema = z.object({
  motivo: texto.min(1), resumo: texto.min(1), comercial: z.boolean(), interesse: texto.nullable(),
  origem: z.enum(["anuncio", "instagram", "indicacao", "paciente_antigo", "desconhecida"]),
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
