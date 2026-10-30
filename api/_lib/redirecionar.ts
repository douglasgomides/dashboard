/**
 * Links rastreados próprios (/r/<nome>, src/lib/rastreio.ts): registra o clique sem dado pessoal e devolve o destino
 * (WhatsApp da clínica com a frase pronta e o código, ou o site com UTM). Robôs de prévia (Instagram, WhatsApp, Facebook)
 * não contam. Link desativado não registra clique e mostra uma página simples (paginaLinkDesativado).
 * Também liga as conversas novas ao link que as originou (atribuirLinks), rodando junto da leitura das conversas, e grava
 * o toque "clique_link" da pessoa para a jornada enxergar a origem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { atribuirConversa, dispositivo, ehRobo, numeroDoDestino, origemReferer, slugValido, type CliqueAtrib, type ComoAtribuiu, type LinkAtrib } from "../../src/lib/rastreio.js";

type Admin = SupabaseClient<any, any, any>;

export type Redirecionamento = { tipo: "destino"; url: string } | { tipo: "inativo"; whatsapp: string | null } | null;

export async function redirecionarLink(admin: Admin, slug: string, userAgent: string | null, referer: string | null): Promise<Redirecionamento> {
  if (!slugValido(slug)) return null;
  // Final antigo (antes de a equipe renomear) continua levando ao mesmo destino: o link na bio não quebra.
  const { data: l, error } = await admin.from("links_rastreados").select("id, client_id, destino_url, destino_tipo, ativo").or(`slug.eq.${slug},slugs_antigos.cs.{${slug}}`).limit(1).maybeSingle();
  if (error) throw new Error("Não foi possível conferir o link rastreado");
  if (!l) return null;
  let destino: URL;
  try { destino = new URL(l.destino_url); } catch { return null; }
  if (destino.protocol !== "https:" || destino.username || destino.password) return null;
  if (l.ativo === false) {
    // Desativado: não conta clique nem leva a mensagem com código (a conversa não seria do link). O paciente ainda
    // acha a clínica: a página oferece o WhatsApp sem mensagem pronta.
    const numero = l.destino_tipo === "site" ? null : numeroDoDestino(destino.toString());
    return { tipo: "inativo", whatsapp: numero ? `https://wa.me/${numero}` : null };
  }
  if (!ehRobo(userAgent)) {
    // Falha ao registrar não pode impedir o paciente de chegar ao WhatsApp, mas precisa aparecer no log.
    try {
      const { error: erroClique } = await admin.from("link_cliques").insert({ link_id: l.id, client_id: l.client_id, dispositivo: dispositivo(userAgent), origem: origemReferer(referer) });
      if (erroClique) console.error("[links] clique não registrado", { link_id: l.id, client_id: l.client_id, codigo: erroClique.code ?? null, erro: erroClique.message });
    } catch (e) {
      console.error("[links] clique não registrado", { link_id: l.id, client_id: l.client_id, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return { tipo: "destino", url: destino.toString() };
}

/** Página do link desativado: curta, sem script, com o WhatsApp da clínica quando houver. */
export function paginaLinkDesativado(whatsapp: string | null): string {
  const botao = whatsapp && /^https:\/\/wa\.me\/\d{12,13}$/.test(whatsapp)
    ? `<p><a href="${whatsapp}" style="display:inline-block;margin-top:8px;padding:12px 20px;border-radius:10px;background:#1f7a4d;color:#fff;text-decoration:none;font-weight:600">Falar com a clínica no WhatsApp</a></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Link desativado</title></head>`
    + `<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f6f6f4;color:#1d1d1b"><main style="max-width:420px;margin:15vh auto;padding:24px;text-align:center">`
    + `<h1 style="font-size:22px;margin:0 0 8px">Este link foi desativado</h1><p style="margin:0;color:#555">A clínica não usa mais este endereço.</p>${botao}</main></body></html>`;
}

/** Final de link livre: nenhum outro link usa como final atual nem antigo. */
export async function slugLivre(admin: Admin, slug: string, exceto?: string): Promise<boolean> {
  const { data, error } = await admin.from("links_rastreados").select("id").or(`slug.eq.${slug},slugs_antigos.cs.{${slug}}`).limit(5);
  if (error) throw new Error("Não foi possível conferir o final do link");
  return ((data ?? []) as { id: string }[]).every((r) => r.id === exceto);
}

/** Primeiro código curto livre entre os candidatos (o código é único entre todas as clínicas). */
export async function codigoLivre(admin: Admin, candidatos: string[]): Promise<string | null> {
  const { data, error } = await admin.from("links_rastreados").select("codigo_ref").in("codigo_ref", candidatos).limit(candidatos.length);
  if (error) throw new Error("Não foi possível conferir o código do link");
  const usados = new Set(((data ?? []) as { codigo_ref: string }[]).map((r) => r.codigo_ref));
  return candidatos.find((c) => !usados.has(c)) ?? null;
}

export interface LinkDoToque { id: string; tipo?: string | null; instagram_post_id?: string | null }
/** Toque "clique_link" da pessoa: a jornada (jornada_resumo, jornada_pessoa) lê toques.link_id. Um por conversa. */
export async function registrarToqueLink(admin: Admin, p: { clientId: string; conversaId: string; pessoaId: string; link: LinkDoToque; em: string; como: ComoAtribuiu }): Promise<string | null> {
  const { error } = await admin.from("toques").upsert({
    client_id: p.clientId, pessoa_id: p.pessoaId, tipo: "clique_link", origem_tipo: p.link.tipo ?? null, link_id: p.link.id,
    instagram_post_id: p.link.instagram_post_id ?? null, ocorreu_em: p.em, fonte: "link_proprio", externo_id: `conversa:${p.conversaId}`,
    utm: {}, bruto: { como: p.como },
  }, { onConflict: "client_id,fonte,externo_id", ignoreDuplicates: true });
  return error ? error.message : null;
}

/** Quantos dias para trás a atribuição procura conversas ainda sem origem. */
export const DIAS_ATRIBUICAO = 30;
// Conversa com mais de 2 horas já tem as primeiras mensagens: conferida sem achar link, não é lida de novo.
const PRIMEIRAS_MENSAGENS_MS = 2 * 3_600_000;

/** Conversas dos últimos 30 dias ainda sem origem: tenta ligar a um link (código → frase → horário). */
export async function atribuirLinks(admin: Admin, onlyClientId?: string): Promise<{ clinicas: number; atribuidas: number; por: Record<string, number>; erros?: string[] }> {
  const agora = Date.now();
  const limite = new Date(agora - DIAS_ATRIBUICAO * 86_400_000).toISOString();
  let consulta = admin.from("links_rastreados").select("id, client_id, codigo_ref, mensagem_modelo, criado_em, destino_tipo, tipo, instagram_post_id").not("slug", "is", null).limit(5000);
  if (onlyClientId) consulta = consulta.eq("client_id", onlyClientId);
  const { data: ativos, error: erroLinks } = await consulta;
  if (erroLinks) throw new Error("Não foi possível ler os links para atribuição");
  type L = LinkAtrib & LinkDoToque & { client_id: string };
  const porCliente = new Map<string, L[]>();
  for (const l of (ativos ?? []) as L[]) porCliente.set(l.client_id, [...(porCliente.get(l.client_id) ?? []), l]);
  let atribuidas = 0;
  const por: Record<string, number> = {};
  const erros: string[] = [];
  for (const [clientId, links] of porCliente) {
    const desde = links.reduce((m, l) => (l.criado_em < m ? l.criado_em : m), links[0].criado_em);
    const corte = desde > limite ? desde : limite;
    const [{ data: convs, error: erroConversas }, { data: cliques, error: erroCliques }] = await Promise.all([
      admin.from("conversas").select("id, iniciada_em, pessoa_id").eq("client_id", clientId).is("link_id", null).is("link_conferido_em", null).gte("iniciada_em", corte).order("iniciada_em", { ascending: false }).limit(500),
      admin.from("link_cliques").select("link_id, em").eq("client_id", clientId).gte("em", new Date(Date.parse(corte) - 3_600_000).toISOString()).limit(5000),
    ]);
    if (erroConversas || erroCliques) throw new Error("Não foi possível conferir as conversas e cliques para atribuição");
    const conferidas: string[] = [];
    for (const c of (convs ?? []) as { id: string; iniciada_em: string; pessoa_id?: string | null }[]) {
      const { data: msgs, error: erroMensagens } = await admin.from("mensagens").select("texto").eq("client_id", clientId).eq("conversa_id", c.id).eq("direcao", "entrada").order("enviada_em").limit(3);
      if (erroMensagens) throw new Error("Não foi possível ler as mensagens para atribuição");
      const primeira = ((msgs ?? []) as { texto: string | null }[]).map((m) => m.texto ?? "").join("\n");
      const a = atribuirConversa(primeira, c.iniciada_em, links, (cliques ?? []) as CliqueAtrib[]);
      if (!a) {
        if (agora - Date.parse(c.iniciada_em) > PRIMEIRAS_MENSAGENS_MS && (msgs ?? []).length > 0) conferidas.push(c.id);
        continue;
      }
      const link = links.find((l) => l.id === a.link_id);
      const ref = a.como === "ref" ? link?.codigo_ref ?? null : null;
      const { data: gravada, error: erroAtribuir } = await admin.from("conversas").update({ link_id: a.link_id, atribuicao: a.como, ...(ref ? { codigo_ref: ref } : {}) }).eq("client_id", clientId).eq("id", c.id).is("link_id", null).select("id").maybeSingle();
      if (erroAtribuir) throw new Error("Não foi possível persistir a atribuição da conversa");
      if (!gravada) continue;
      atribuidas++;
      por[a.como] = (por[a.como] ?? 0) + 1;
      if (c.pessoa_id && link) {
        const erro = await registrarToqueLink(admin, { clientId, conversaId: c.id, pessoaId: c.pessoa_id, link, em: c.iniciada_em, como: a.como });
        if (erro) { erros.push("Não foi possível registrar o toque do link na jornada"); console.error("[links] toque não registrado", { client_id: clientId, link_id: link.id, erro }); }
      }
    }
    for (let i = 0; i < conferidas.length; i += 100) {
      const { error: erroMarca } = await admin.from("conversas").update({ link_conferido_em: new Date(agora).toISOString() }).eq("client_id", clientId).in("id", conferidas.slice(i, i + 100)).is("link_id", null);
      if (erroMarca) { erros.push("Não foi possível marcar as conversas já conferidas"); break; }
    }
  }
  return { clinicas: porCliente.size, atribuidas, por, ...(erros.length ? { erros } : {}) };
}
