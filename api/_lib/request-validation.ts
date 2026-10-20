import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data inválida");

const id = z.string().uuid();
const vazioOpcional = (v: unknown) => typeof v === "string" && !v.trim() ? undefined : v;
export const manualRequestSchema = z.object({
  client_id: id.optional(),
  alvo: z.enum(["posts", "anuncios", "atendimento", "comentarios", "crm", "historico", "tudo", "audiencia", "classificar", "link_rastreado", "links_stats", "jornada", "sonda_conversas", "conversas", "kommo_contatos", "conferencia", "periodo_instagram", "resumo_conversa", "sessao_ia", "agentes", "sap_redigir", "creative_worker", "creative_arte", "plano_semana", "plano_item"]),
  acao: z.string().max(40).optional(), execucao_id: id.optional(),
  adaptacao_id: id.optional(), arte_id: id.optional(),
  slides: z.array(z.number().int().positive()).max(12).optional(),
  status: z.enum(["aprovada", "descartada"]).optional(),
  etapa: z.string().max(80).optional(), conferencia_id: id.optional(),
  de: isoDate.optional(), ate: isoDate.optional(),
  sessao: z.string().regex(/^[A-Z0-9]{1,6}$/).optional(), titulo: z.string().trim().min(1).max(200).optional(),
  entregas: z.array(z.string().max(500)).max(20).optional(),
  rotulos: z.record(z.string().max(200)).refine((v) => Object.keys(v).length <= 100).optional(),
  transcricao: z.string().max(60_000).optional(), conversa_id: id.optional(),
  limite: z.number().int().min(1).max(300).optional(), dias: z.number().int().min(1).max(365).optional(),
  refazer: z.boolean().optional(), pagina: z.number().int().min(1).max(1_000_000).optional(), paginas: z.number().int().min(1).max(60).optional(),
  tipo: z.string().min(1).max(40).optional(), id: id.optional(),
  campanha: z.string().max(80).optional(), destino_tipo: z.enum(["site", "whatsapp"]).optional(),
  frase: z.string().max(200).optional(), site_url: z.preprocess(vazioOpcional, z.string().url().max(2048).optional()),
  dica: z.string().max(600).optional(), texto_atual: z.string().max(60_000).optional(),
  turnos: z.array(z.object({ papel: z.enum(["ia", "equipe"]), texto: z.string().max(6000) })).max(12).optional(),
  numero_whatsapp: z.preprocess(vazioOpcional, z.string().max(30).refine((v) => /^\d{10,15}$/.test(v.replace(/\D/g, ""))).optional()),
  mensagem: z.string().trim().min(1).max(2000).optional(), instagram_post_id: id.nullable().optional(), ad_campaign_id: id.nullable().optional(),
  antes_de: z.string().datetime({ offset: true }).nullable().optional(),
  slug: z.string().max(60).optional(),
  estado: z.enum(["proposta", "feita", "nao_feita", "descartada"]).optional(), nota: z.string().max(500).optional(),
}).strip().superRefine((value, ctx) => {
  if (value.alvo !== "conferencia" && value.alvo !== "agentes" && !value.client_id) ctx.addIssue({ code: "custom", path: ["client_id"], message: "Informe client_id" });
  if (value.alvo === "creative_arte") {
    if (!["listar", "gerar", "revisar"].includes(value.acao ?? "")) ctx.addIssue({ code: "custom", path: ["acao"], message: "Ação de arte inválida" });
    if ((value.acao === "listar" || value.acao === "gerar") && !value.adaptacao_id) ctx.addIssue({ code: "custom", path: ["adaptacao_id"], message: "Informe adaptacao_id" });
    if (value.acao === "revisar") {
      if (!value.arte_id) ctx.addIssue({ code: "custom", path: ["arte_id"], message: "Informe arte_id" });
      if (!value.status) ctx.addIssue({ code: "custom", path: ["status"], message: "Informe status" });
    }
  }
  if (value.alvo === "plano_item" && (!value.id || !value.estado)) ctx.addIssue({ code: "custom", path: ["estado"], message: "Informe id e estado" });
  if (value.de && value.ate && (value.de > value.ate || Date.parse(value.ate) - Date.parse(value.de) > 366 * 86_400_000)) {
    ctx.addIssue({ code: "custom", path: ["ate"], message: "Período inválido ou maior que um ano" });
  }
});

export const createUserSchema = z.object({ email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()), client_id: id, role: z.enum(["owner", "strategist", "viewer"]) });
export const createAdminSchema = z.object({ email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()), password: z.string().min(8).max(1024).optional() });
