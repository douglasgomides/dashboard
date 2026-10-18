import { z } from "zod";

const n = z.number().nonnegative();
const fonte = z.object({
  conexao_id: z.string().uuid(),
  provider: z.string(),
  ativa: z.boolean(),
  registros_historicos: n,
  historico_desde: z.string().nullable(),
  ultima_gravacao: z.string().nullable(),
  backfill_concluido: z.boolean().nullable(),
  ultimo_sucesso_compartilhado: z.string().nullable(),
  erro_sync_compartilhado: z.boolean().nullable(),
  sem_origem: n,
  sem_data_origem: n,
});
export type FonteComercial = z.infer<typeof fonte>;
export const qualidadeComercialSchema = z.object({
  versao: z.literal(1),
  periodo: z.object({
    de: z.string(),
    ate: z.string(),
    fuso: z.string(),
    base: z.string(),
  }),
  resumo: z.object({
    registros_crm: n,
    com_conversa_verificada: n,
    com_saida_observada: n,
    sem_origem: n,
    data_origem_ausente: n,
    referencias_rastreadas: n,
    sinal_agendamento_crm: n,
    negocios_ganhos: n,
    valor_negocios_ganhos: z.number().nullable(),
    ganhos_sem_valor: n,
    comparecimentos: z.null(),
    receita_faturada: z.null(),
    receita_recebida: z.null(),
    receita_atribuida: z.null(),
  }),
  conversas: z.object({
    total_periodo: n,
    conflitos: n,
    vinculos_invalidos: n,
    sessoes_sem_provedor: n,
  }),
  por_fonte: z.array(
    z.object({
      provider: z.string(),
      registros: n,
      sem_origem: n,
      sem_data_origem: n,
      sem_etapa_mapeada: n,
      com_conversa_verificada: n,
      somente_identidade_legada: n,
    }),
  ),
  fontes: z.array(fonte),
  registros: z.array(
    z.object({
      id: z.string().uuid(),
      provider: z.string(),
      etapa: z.string().nullable(),
      desfecho: z.string().nullable(),
      origem_crm: z.string(),
      entrada_em: z.string().nullable(),
      data_origem_ausente: z.boolean(),
      conversas_verificadas: n,
      com_saida: n,
      referencias_rastreadas: n,
      identidade_legada: z.boolean(),
    }),
  ),
  paginacao: z.object({ offset: n, limite: n, total: n }),
  limitacoes: z.array(z.string()),
});
export const eventosComerciaisSchema = z.object({
  lead_id: z.string().uuid(),
  provider: z.string(),
  origem_crm: z.string().nullable(),
  total_eventos: n,
  limitado: z.boolean(),
  eventos: z.array(
    z.object({
      chave: z.string(),
      ocorreu_em: z.string().nullable(),
      fonte: z.string(),
      tipo: z.string(),
      certeza: z.enum(["verificado", "estimado"]),
      associacao: z.string(),
      observacao: z.string(),
    }),
  ),
});

export function saudeFonteComercial(f: FonteComercial): string {
  if (!f.ativa) return "Desativada · histórico preservado";
  if (f.erro_sync_compartilhado) return "Erro na sincronização do cliente";
  if (f.registros_historicos === 0) return "Sem registros para conferir";
  if (f.backfill_concluido === false) return "Carga histórica incompleta";
  if (f.sem_origem > 0 || f.sem_data_origem > 0)
    return "Lacunas no preenchimento";
  return "Cobertura externa ainda não comprovada";
}

export const PROVEDORES: Record<string, string> = {
  kommo: "Kommo",
  clint: "Clint",
  flwchat: "FlwChat",
  digisac: "Digisac",
  rdstation: "RD Station",
  planilha: "Planilha",
  wts: "WTS",
};
export const EVENTOS_COMERCIAIS: Record<string, string> = {
  entrou: "Entrada no CRM",
  entrada_crm: "Entrada no CRM",
  mudou_etapa: "Mudança de etapa",
  ganhou: "Negócio ganho no CRM",
  perdeu: "Negócio perdido no CRM",
  reabriu: "Negócio reaberto",
  conversa: "Conversa vinculada",
  primeira_saida_observada: "Primeira mensagem de saída armazenada",
};
