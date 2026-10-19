/**
 * Links rastreados próprios (/r/<slug>, src/lib/rastreio.ts): registra o clique sem dado pessoal e devolve o destino
 * (WhatsApp da clínica com a frase pronta, ou o site com UTM). Robôs de prévia (Instagram, WhatsApp, Facebook) não contam.
 * Também liga as conversas novas ao link que as originou (atribuirLinks), rodando junto da leitura das conversas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { atribuirConversa, dispositivo, ehRobo, origemReferer, slugValido, type CliqueAtrib, type LinkAtrib } from "../../src/lib/rastreio.js";

type Admin = SupabaseClient<any, any, any>;

export async function redirecionarLink(admin: Admin, slug: string, userAgent: string | null, referer: string | null): Promise<string | null> {
  if (!slugValido(slug)) return null;
  // Final antigo (antes de a equipe renomear) continua levando ao mesmo destino: o link na bio não quebra.
  const { data: l, error } = await admin.from("links_rastreados").select("id, client_id, destino_url").or(`slug.eq.${slug},slugs_antigos.cs.{${slug}}`).limit(1).maybeSingle();
  if (error) throw new Error("Não foi possível conferir o link rastreado");
  if (!l) return null;
  let destino: URL;
  try { destino = new URL(l.destino_url); } catch { return null; }
  if (destino.protocol !== "https:" || destino.username || destino.password) return null;
  if (!ehRobo(userAgent)) {
    // Falha ao registrar não pode impedir o paciente de chegar ao WhatsApp.
    await admin.from("link_cliques").insert({ link_id: l.id, client_id: l.client_id, dispositivo: dispositivo(userAgent), origem: origemReferer(referer) }).then(() => null, () => null);
  }
  return destino.toString();
}

/** Final de link livre: nenhum outro link usa como final atual nem antigo. */
export async function slugLivre(admin: Admin, slug: string, exceto?: string): Promise<boolean> {
  const { data, error } = await admin.from("links_rastreados").select("id").or(`slug.eq.${slug},slugs_antigos.cs.{${slug}}`).limit(5);
  if (error) throw new Error("Não foi possível conferir o final do link");
  return ((data ?? []) as { id: string }[]).every((r) => r.id === exceto);
}

/** Conversas dos últimos 3 dias ainda sem origem: tenta ligar a um link (ref → frase → horário). */
export async function atribuirLinks(admin: Admin, onlyClientId?: string): Promise<{ clinicas: number; atribuidas: number; por: Record<string, number> }> {
  const tres = new Date(Date.now() - 3 * 86_400_000).toISOString();
  let consulta = admin.from("links_rastreados").select("id, client_id, codigo_ref, mensagem_modelo, criado_em, destino_tipo").not("slug", "is", null).limit(5000);
  if (onlyClientId) consulta = consulta.eq("client_id", onlyClientId);
  const { data: ativos, error: erroLinks } = await consulta;
  if (erroLinks) throw new Error("Não foi possível ler os links para atribuição");
  const porCliente = new Map<string, LinkAtrib[]>();
  for (const l of (ativos ?? []) as (LinkAtrib & { client_id: string })[]) porCliente.set(l.client_id, [...(porCliente.get(l.client_id) ?? []), l]);
  let atribuidas = 0;
  const por: Record<string, number> = {};
  for (const [clientId, links] of porCliente) {
    const desde = links.reduce((m, l) => (l.criado_em < m ? l.criado_em : m), links[0].criado_em);
    const corte = desde > tres ? desde : tres;
    const [{ data: convs, error: erroConversas }, { data: cliques, error: erroCliques }] = await Promise.all([
      admin.from("conversas").select("id, iniciada_em").eq("client_id", clientId).is("link_id", null).gte("iniciada_em", corte).limit(500),
      admin.from("link_cliques").select("link_id, em").eq("client_id", clientId).gte("em", new Date(Date.parse(corte) - 3_600_000).toISOString()).limit(5000),
    ]);
    if (erroConversas || erroCliques) throw new Error("Não foi possível conferir as conversas e cliques para atribuição");
    for (const c of (convs ?? []) as { id: string; iniciada_em: string }[]) {
      const { data: msgs, error: erroMensagens } = await admin.from("mensagens").select("texto").eq("client_id", clientId).eq("conversa_id", c.id).eq("direcao", "entrada").order("enviada_em").limit(3);
      if (erroMensagens) throw new Error("Não foi possível ler as mensagens para atribuição");
      const primeira = ((msgs ?? []) as { texto: string | null }[]).map((m) => m.texto ?? "").join("\n");
      const a = atribuirConversa(primeira, c.iniciada_em, links, (cliques ?? []) as CliqueAtrib[]);
      if (!a) continue;
      const ref = a.como === "ref" ? links.find((l) => l.id === a.link_id)?.codigo_ref ?? null : null;
      const { data: gravada, error: erroAtribuir } = await admin.from("conversas").update({ link_id: a.link_id, atribuicao: a.como, ...(ref ? { codigo_ref: ref } : {}) }).eq("client_id", clientId).eq("id", c.id).is("link_id", null).select("id").maybeSingle();
      if (erroAtribuir) throw new Error("Não foi possível persistir a atribuição da conversa");
      if (!gravada) continue;
      atribuidas++;
      por[a.como] = (por[a.como] ?? 0) + 1;
    }
  }
  return { clinicas: porCliente.size, atribuidas, por };
}
