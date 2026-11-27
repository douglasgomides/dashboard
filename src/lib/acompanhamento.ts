import { z } from "zod";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Confira a data");
const texto = (max = 6000) => z.string().trim().max(max);
const link = z.string().url().max(2000).refine(v => new URL(v).protocol === "https:", "Use um link HTTPS");
export const ESTADOS_ACAO = ["A validar", "Planejado", "Em andamento", "Aguardando cliente", "Concluído"] as const;
export const acaoSchema = z.object({
  id: z.string().uuid(), titulo: texto(200).min(1), descricao: texto(), responsavel: texto(200),
  prazo: data.nullable(), estado: z.enum(ESTADOS_ACAO), criterio: texto(2000), resultado: texto(3000),
});
export const fichaSchema = z.object({
  balanco: z.enum(["Melhorou", "Piorou", "Estável", "Sem conclusão"]).optional(),
  acertos: texto(3000).optional(), problemas: texto(3000).optional(), anuncios: texto(3000).optional(), cliques: texto(3000).optional(), decisao: texto(3000).optional(),
  objetivo: texto(1500), instagram: texto(), conteudo: texto(), leads: texto(), hipotese: texto(3000),
  periodo_de: data, periodo_ate: data, notas: texto(30000), transcricao: texto(60000),
  fontes: z.array(link).max(20), acoes: z.array(acaoSchema).max(20),
  conversas: z.array(z.object({ papel: z.enum(["equipe", "ia"]), texto: texto(8000), em: z.string().datetime() })).max(40),
}).refine(v => v.periodo_de <= v.periodo_ate && Date.parse(v.periodo_ate) - Date.parse(v.periodo_de) <= 366 * 86400000, "Confira o período");
export const revisaoSchema = z.object({
  id: z.string().uuid(), client_id: z.string().uuid(), data,
  titulo: texto(200).min(1), prioridade: z.enum(["Alta", "Média", "Baixa"]),
  proxima_checagem: data.nullable(), versao: z.number().int().nonnegative(), dados: fichaSchema,
});
export type AcaoRevisao = z.infer<typeof acaoSchema>;
export type FichaRevisao = z.infer<typeof fichaSchema>;
export type Revisao = z.infer<typeof revisaoSchema> & { atualizado_em?: string; criado_em?: string; clients?: { name: string } | null };
export type EnvioClickUp = { revisao_id: string; acao_id: string; estado: "enviando" | "criada" | "incerta"; tarefa_url: string | null };
export const perguntaSchema = z.object({ resposta: texto(8000).min(1), fontes: z.array(z.number().int().positive()).min(1).max(20), sugestoes: z.array(texto(500)).max(5) });
export function fichaVazia(): FichaRevisao {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
  return { objetivo: "", instagram: "", conteudo: "", leads: "", hipotese: "", periodo_de: hoje, periodo_ate: hoje, notas: "", transcricao: "", fontes: [], acoes: [], conversas: [] };
}
export function novaAcao(): AcaoRevisao {
  return { id: crypto.randomUUID(), titulo: "Nova ação", descricao: "", responsavel: "", prazo: null, estado: "A validar", criterio: "", resultado: "" };
}
export function tarefaDaAcao(revisao: Revisao, acao: AcaoRevisao, cliente: string): { name: string; description: string } {
  return { name: `${cliente} | ${acao.titulo}`.slice(0, 250), description: [
    `Revisão de ${revisao.data} · ${revisao.titulo}`, `Objetivo\n${revisao.dados.objetivo}`,
    `Ação\n${acao.descricao}`, `Responsável\n${acao.responsavel || "A definir"}`,
    `Critério de conclusão\n${acao.criterio || "A definir"}`, `Contexto\n${revisao.dados.hipotese}`,
    `Fontes\n${revisao.dados.fontes.join("\n")}`, `Referência Nexo\n${revisao.id}/${acao.id}`,
  ].join("\n\n") };
}
export function atrasoDaAcao(acao: AcaoRevisao, hoje: string): boolean {
  return acao.estado !== "Concluído" && acao.prazo !== null && acao.prazo < hoje;
}
