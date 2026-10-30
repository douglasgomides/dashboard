// Confiabilidade do rastreio de conversas dos anúncios: roda ANTES de qualquer diagnóstico de campanha.
//
// Caso Dr. Sergio Maia (90 dias): 9.558 cliques no link, CTR 7%, só 2 conversas atribuídas
// (R$ 987,83 por conversa) e 915 atendimentos no WhatsApp no mesmo período. A conversa não está sendo
// contada (campanha de tráfego com link de WhatsApp não registra "conversa iniciada"), e o diagnóstico
// mandava cortar campanha boa. Com rastreio suspeito:
//   - custo por conversa não aparece como verdade;
//   - nenhuma campanha é classificada como "não converte" / "caras";
//   - o diagnóstico de campanhas só volta quando o rastreio ficar confiável.
//
// Clique que leva ao PERFIL do Instagram (destino INSTAGRAM_PROFILE, otimização VISIT_INSTAGRAM_PROFILE) não é
// clique para conversar: não entra na regra (auditoria de 30/10/2026). Doctor Creator, outubro: 25.644 de 26.338
// cliques iam para o perfil e o alarme apagava o diagnóstico; Dra. Marcella: 9.473 de 9.473. Só contam os cliques
// de campanha com destino WhatsApp, Messenger, Direct ou site, e os de campanha sem destino informado (não dá para
// saber, então continuam contando, como no caso do Dr. Sergio). Quando todo clique vai para o perfil, não há alarme.

export const RASTREIO_MIN_CLIQUES = 200;
export const RASTREIO_MIN_CONVERSAS_POR_CLIQUE = 0.01; // menos de 1 conversa a cada 100 cliques
export const RASTREIO_WHATSAPP_VEZES = 10; // WhatsApp com mais de 10x as conversas atribuídas

export interface EntradaRastreio {
  /** Cliques que levam para fora (WhatsApp, site) ou de campanha sem destino informado. Visitas ao perfil ficam fora. */
  cliquesLink: number;
  /** Cliques de campanhas que levam ao perfil do Instagram (só para a mensagem e para não dar alarme falso). */
  cliquesPerfil?: number;
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
  const perfil = Math.max(0, e.cliquesPerfil ?? 0);
  // Todo clique foi para o perfil: a campanha não pede conversa, então não há o que estar mal rastreado.
  if (perfil > 0 && e.cliquesLink <= 0) return { suspeito: false, motivos, mensagem: null };
  if (e.cliquesLink > RASTREIO_MIN_CLIQUES && e.conversas / e.cliquesLink < RASTREIO_MIN_CONVERSAS_POR_CLIQUE) motivos.push("poucas_conversas_por_clique");
  const w = e.atendimentosWhatsapp;
  if (w != null && w > 0 && w > RASTREIO_WHATSAPP_VEZES * e.conversas && w >= RASTREIO_WHATSAPP_VEZES) motivos.push("whatsapp_muito_maior");
  if (!motivos.length) return { suspeito: false, motivos, mensagem: null };
  const whats = w != null && w > 0 ? `, enquanto o WhatsApp recebeu ${n(w)} atendimentos` : "";
  return {
    suspeito: true,
    motivos,
    mensagem:
      `Provável problema de rastreio: ${n(e.cliquesLink)} cliques${perfil > 0 ? ` para WhatsApp ou site (as ${n(perfil)} visitas ao perfil ficam de fora)` : ""} e só ${n(e.conversas)} ${e.conversas === 1 ? "conversa atribuída" : "conversas atribuídas"}${whats}. ` +
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

// Destinos e metas de otimização da Meta, com as mesmas listas de ads_finalidade (banco).
const DESTINO_FORA = /(WHATSAPP|MESSENGER|DIRECT|MESSAGING|ON_AD|WEBSITE|PHONE|APP|LEAD)/;
const DESTINO_PERFIL = /(INSTAGRAM_PROFILE|ON_POST|ON_VIDEO|ON_PAGE|ON_EVENT|FACEBOOK_PAGE)/;
const OTIMIZACAO_PERFIL = new Set(["PROFILE_VISIT", "VISIT_INSTAGRAM_PROFILE", "INSTAGRAM_PROFILE_REACH"]);
const normaliza = (v: string) => v.trim().toUpperCase().replace(/\s+/g, "_");

export interface DestinoCampanha {
  destinos?: string[] | null;
  otimizacoes?: string[] | null;
}

/**
 * A campanha leva o clique ao perfil do Instagram (e não ao WhatsApp ou ao site)? Pelo destino dos conjuntos;
 * sem destino, pela meta de otimização. Sem nenhum dos dois, não dá para saber: false (o clique conta).
 */
export function cliqueLevaAoPerfil(c: DestinoCampanha | null | undefined): boolean {
  if (!c) return false;
  const d = (c.destinos ?? []).map(normaliza).filter(Boolean);
  if (d.length) return d.some((x) => DESTINO_PERFIL.test(x)) && !d.some((x) => DESTINO_FORA.test(x));
  const o = (c.otimizacoes ?? []).map(normaliza).filter(Boolean);
  return o.length > 0 && o.every((x) => OTIMIZACAO_PERFIL.has(x));
}

/** Separa os cliques no link das linhas diárias em "para fora" e "para o perfil", pelo cadastro das campanhas. */
export function separarCliques(
  linhas: { campaign_id: string; link_clicks?: number | string | null }[],
  cadastro: ({ campaign_id: string } & DestinoCampanha)[],
): { paraFora: number; paraPerfil: number } {
  const perfil = new Set(cadastro.filter((c) => cliqueLevaAoPerfil(c)).map((c) => c.campaign_id));
  let paraFora = 0;
  let paraPerfil = 0;
  for (const l of linhas) {
    const v = Number(l.link_clicks) || 0;
    if (perfil.has(l.campaign_id)) paraPerfil += v;
    else paraFora += v;
  }
  return { paraFora, paraPerfil };
}
