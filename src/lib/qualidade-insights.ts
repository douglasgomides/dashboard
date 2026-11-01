// Problemas de dado (qualidade_dados) como recomendações operacionais (Oportunidades e Início).
// A contagem é direta no banco; a causa é a hipótese da regra, nunca um fato sobre a equipe da clínica
// (auditoria de 01/11/2026: "A equipe encerrou o funil inteiro marcando tudo como ganho" aparecia como diagnóstico
// com confiança alta). Lógica pura, testada em scripts/test-tela-honesta.ts.
import type { ProblemaDado } from "@/lib/client-data";
import type { Insight, Responsavel } from "@/lib/insight";

/** Prefixo de toda causa nos cartões de ação: deixa claro que é hipótese. */
export const PREFIXO_CAUSA = "Causa provável (hipótese da regra, não confirmada com a clínica): ";

/** Afinal, "deixou de ser preenchido" só é verdade se um dia foi: quando a evidência diz "só 0 com valor", nunca foi. */
export function causaHonesta(p: Pick<ProblemaDado, "causa" | "evidencia">): string {
  const causa = (p.causa ?? "").trim();
  const nuncaTeveValor = /\bsó 0 (com valor|têm valor|tem valor)/i.test(p.evidencia ?? "");
  if (nuncaTeveValor && /deixou de ser preenchido/i.test(causa))
    return causa.replace(/O valor da venda deixou de ser preenchido/i, "O valor da venda não está preenchido em nenhum desses ganhos");
  return causa;
}

export function problemasParaInsights(ps: ProblemaDado[]): Insight[] {
  return ps.map((p) => ({
    id: `dado-${p.id}`,
    area: "resumo" as const,
    tom: (p.severidade === "alta" ? "ruim" : "atencao") as "ruim" | "atencao",
    titulo: p.titulo,
    diagnostico: `${PREFIXO_CAUSA}${causaHonesta(p)} Até corrigir, fica distorcido: ${p.afeta}`,
    evidencia: p.evidencia,
    // A contagem é direta, mas a causa é suposição: a confiança do cartão é a da causa.
    confianca: "media" as const,
    motivoConfianca: "A contagem é direta no banco, sem estimativa. A causa é uma hipótese da regra: confirme com a equipe da clínica antes de agir.",
    impacto: (p.severidade === "alta" ? "alto" : "medio") as "alto" | "medio",
    acao: { texto: p.correcao, rota: p.fonte === "crm" ? "/$clientId/crm-painel" : p.fonte === "anuncios" ? "/$clientId/anuncios" : undefined, botao: p.fonte === "crm" ? "Ver o funil do CRM" : p.fonte === "anuncios" ? "Ver anúncios" : undefined },
    responsavel: ((p.responsavel as Responsavel | undefined) ?? "equipe_hub") as Responsavel,
    regra: "Verificação fixa de qualidade dos dados (função qualidade_dados no banco): leads abertos parados há 90+ dias, CRM sem lead novo enquanto chegam conversas, origem vazia, ganho não registrado, CRM compartilhado, erro de sincronização, Instagram ou anúncio parado. A causa escrita é a explicação mais comum para o padrão encontrado, não uma confirmação.",
    fonte: "Banco do Nexo (CRM, Instagram, Meta Ads, WhatsApp): contagem; causa: regra fixa do Nexo",
    risco: "Recomendação sobre o dado de entrada: não diz se o resultado foi bom ou ruim, diz que a leitura está comprometida. A causa pode ser outra.",
  }));
}
