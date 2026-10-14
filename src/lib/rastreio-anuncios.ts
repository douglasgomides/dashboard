// Confiabilidade do rastreio de conversas dos anúncios: roda ANTES de qualquer diagnóstico de campanha.
//
// Caso Dr. Sergio Maia (90 dias): 9.558 cliques no link, CTR 7%, só 2 conversas atribuídas
// (R$ 987,83 por conversa) e 915 atendimentos no WhatsApp no mesmo período. A conversa não está sendo
// contada (campanha de tráfego com link de WhatsApp não registra "conversa iniciada"), e o diagnóstico
// mandava cortar campanha boa. Com rastreio suspeito:
//   - custo por conversa não aparece como verdade;
//   - nenhuma campanha é classificada como "não converte" / "caras";
//   - o diagnóstico de campanhas só volta quando o rastreio ficar confiável.

export const RASTREIO_MIN_CLIQUES = 200;
export const RASTREIO_MIN_CONVERSAS_POR_CLIQUE = 0.01; // menos de 1 conversa a cada 100 cliques
export const RASTREIO_WHATSAPP_VEZES = 10; // WhatsApp com mais de 10x as conversas atribuídas

export interface EntradaRastreio {
  cliquesLink: number;
  conversas: number; // conversas iniciadas atribuídas pela Meta
  atendimentosWhatsapp?: number | null; // atendimentos no WhatsApp do cliente no mesmo período (null = sem WhatsApp ligado)
}

export interface Rastreio {
  suspeito: boolean;
  motivos: ("poucas_conversas_por_clique" | "whatsapp_muito_maior")[];
  mensagem: string | null; // o alerta que substitui o diagnóstico
}

const n = (v: number) => Math.round(v).toLocaleString("pt-BR");

export function avaliarRastreio(e: EntradaRastreio): Rastreio {
  const motivos: Rastreio["motivos"] = [];
  if (e.cliquesLink > RASTREIO_MIN_CLIQUES && e.conversas / e.cliquesLink < RASTREIO_MIN_CONVERSAS_POR_CLIQUE) motivos.push("poucas_conversas_por_clique");
  const w = e.atendimentosWhatsapp;
  if (w != null && w > 0 && w > RASTREIO_WHATSAPP_VEZES * e.conversas && w >= RASTREIO_WHATSAPP_VEZES) motivos.push("whatsapp_muito_maior");
  if (!motivos.length) return { suspeito: false, motivos, mensagem: null };
  const whats = w != null && w > 0 ? `, enquanto o WhatsApp recebeu ${n(w)} atendimentos` : "";
  return {
    suspeito: true,
    motivos,
    mensagem:
      `Provável problema de rastreio: ${n(e.cliquesLink)} cliques e só ${n(e.conversas)} ${e.conversas === 1 ? "conversa atribuída" : "conversas atribuídas"}${whats}. ` +
      "Verifique se a campanha usa objetivo de mensagens e se o link de WhatsApp tem código de rastreio.",
  };
}

/** Nome curto do objetivo da Meta para mostrar ao lado de cada campanha. */
export function nomeObjetivo(objetivo: string | null | undefined): string {
  const o = (objetivo ?? "").toUpperCase();
  if (["LINK_CLICKS", "OUTCOME_TRAFFIC"].includes(o)) return "Tráfego";
  if (o === "MESSAGES") return "Mensagens";
  if (["OUTCOME_SALES", "CONVERSIONS", "PRODUCT_CATALOG_SALES"].includes(o)) return "Conversão (vendas)";
  if (["OUTCOME_LEADS", "LEAD_GENERATION"].includes(o)) return "Cadastro (leads)";
  if (["OUTCOME_ENGAGEMENT", "POST_ENGAGEMENT", "VIDEO_VIEWS", "PAGE_LIKES", "EVENT_RESPONSES"].includes(o)) return "Engajamento";
  if (["OUTCOME_AWARENESS", "REACH", "BRAND_AWARENESS"].includes(o)) return "Reconhecimento";
  return o ? o : "Não informado";
}

/** Objetivo que não registra "conversa iniciada" mesmo quando o link leva ao WhatsApp. */
export function objetivoNaoContaConversa(objetivo: string | null | undefined): boolean {
  const o = (objetivo ?? "").toUpperCase();
  return ["LINK_CLICKS", "OUTCOME_TRAFFIC", "OUTCOME_AWARENESS", "REACH", "BRAND_AWARENESS", "OUTCOME_SALES", "CONVERSIONS"].includes(o);
}
