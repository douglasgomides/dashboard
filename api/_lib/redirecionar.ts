/**
 * Links rastreados próprios (/r/<slug>, src/lib/rastreio.ts): registra o clique sem dado pessoal e devolve o destino
 * (WhatsApp da clínica com a frase pronta, ou o site com UTM). Robôs de prévia (Instagram, WhatsApp, Facebook) não contam.
 * Também liga as conversas novas ao link que as originou (atribuirLinks), rodando junto da leitura das conversas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { atribuirConversa, dispositivo, ehRobo, origemReferer, type CliqueAtrib, type LinkAtrib } from "../../src/lib/rastreio.js";

type Admin = SupabaseClient<any, any, any>;

export async function redirecionarLink(admin: Admin, slug: string, userAgent: string | null, referer: string | null): Promise<string | null> {
  if (!/^[a-z0-9]{4,20}$/.test(slug)) return null;
  const { data: l } = await admin.from("links_rastreados").select("id, client_id, destino_url").eq("slug", slug).maybeSingle();
  if (!l) return null;
  if (!ehRobo(userAgent)) {
    // Falha ao registrar não pode impedir o paciente de chegar ao WhatsApp.
    await admin.from("link_cliques").insert({ link_id: l.id, client_id: l.client_id, dispositivo: dispositivo(userAgent), origem: origemReferer(referer) }).then(() => null, () => null);
  }
  return l.destino_url as string;
}

/** Conversas dos últimos 3 dias ainda sem origem: tenta ligar a um link (ref → frase → horário). */
export async function atribuirLinks(admin: Admin): Promise<{ clinicas: number; atribuidas: number; por: Record<string, number> }> {
  const tres = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data: ativos } = await admin.from("links_rastreados").select("id, client_id, codigo_ref, mensagem_modelo, criado_em, destino_tipo").not("slug", "is", null).limit(5000);
  const porCliente = new Map<string, LinkAtrib[]>();
  for (const l of (ativos ?? []) as (LinkAtrib & { client_id: string })[]) porCliente.set(l.client_id, [...(porCliente.get(l.client_id) ?? []), l]);
  let atribuidas = 0;
  const por: Record<string, number> = {};
  for (const [clientId, links] of porCliente) {
    const desde = links.reduce((m, l) => (l.criado_em < m ? l.criado_em : m), links[0].criado_em);
    const corte = desde > tres ? desde : tres;
    const [{ data: convs }, { data: cliques }] = await Promise.all([
      admin.from("conversas").select("id, iniciada_em").eq("client_id", clientId).is("link_id", null).gte("iniciada_em", corte).limit(500),
      admin.from("link_cliques").select("link_id, em").eq("client_id", clientId).gte("em", new Date(Date.parse(corte) - 3_600_000).toISOString()).limit(5000),
    ]);
    for (const c of (convs ?? []) as { id: string; iniciada_em: string }[]) {
      const { data: msgs } = await admin.from("mensagens").select("texto").eq("conversa_id", c.id).eq("direcao", "entrada").order("enviada_em").limit(3);
      const primeira = ((msgs ?? []) as { texto: string | null }[]).map((m) => m.texto ?? "").join("\n");
      const a = atribuirConversa(primeira, c.iniciada_em, links, (cliques ?? []) as CliqueAtrib[]);
      if (!a) continue;
      const ref = a.como === "ref" ? links.find((l) => l.id === a.link_id)?.codigo_ref ?? null : null;
      await admin.from("conversas").update({ link_id: a.link_id, atribuicao: a.como, ...(ref ? { codigo_ref: ref } : {}) }).eq("id", c.id);
      atribuidas++;
      por[a.como] = (por[a.como] ?? 0) + 1;
    }
  }
  return { clinicas: porCliente.size, atribuidas, por };
}
