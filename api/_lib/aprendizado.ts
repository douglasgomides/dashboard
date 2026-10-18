/**
 * Aprendizado contínuo dos agentes (regras em src/lib/aprendizado.ts). Roda no agendamento (enfileirarAgendados),
 * antes de pôr os agentes na fila, para que cada rodada já use o que foi aprendido:
 *  1. mede sozinho o resultado das sugestões de conteúdo (foi publicado? como foi?) e de anúncios (o que aconteceu com
 *     a campanha 7 dias depois);
 *  2. recalcula as lições de cada clínica com o dado real e grava em agentes_aprendizados; lição que deixou de valer
 *     expira, lição vetada pela equipe nunca volta.
 * Tudo com a chave de serviço; nada sai do banco.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  casarPublicacao, taxaSalvamento, licoesAnuncios, licoesComerciais, licoesConteudo, licoesParaPrompt, licoesResultados, mediana, resultadoCampanha, resultadoPublicacao,
  type AgenteLicao, type LinhaCampanha, type Licao, type PostMetricas, type ResumoConversa, type SugestaoMedida,
} from "../../src/lib/aprendizado.js";

type Admin = SupabaseClient<any, any, any>;
const DIA = 86_400_000;
const desde = (d: number) => new Date(Date.now() - d * DIA).toISOString();

async function postsDaClinica(admin: Admin, clientId: string, dias: number) {
  const { data } = await admin.from("instagram_posts").select("format, tema, caption, reach, saved, shares, posted_at")
    .eq("client_id", clientId).gte("posted_at", desde(dias)).order("posted_at", { ascending: false }).limit(500);
  return (data ?? []) as (PostMetricas & { posted_at: string | null })[];
}

/** Lições de uma clínica, calculadas agora. */
export async function calcularLicoes(admin: Admin, clientId: string): Promise<Licao[]> {
  const resumos: ResumoConversa[] = [];
  for (let de = 0; de < 4000; de += 1000) {
    const { data } = await admin.from("conversas_resumos").select("resumo").eq("client_id", clientId).gte("gerado_em", desde(120)).order("gerado_em").range(de, de + 999);
    resumos.push(...((data ?? []) as { resumo: ResumoConversa }[]).map((r) => r.resumo));
    if ((data ?? []).length < 1000) break;
  }
  const [posts, ads, camps, sugs] = await Promise.all([
    postsDaClinica(admin, clientId, 180),
    admin.from("meta_ads_daily").select("campaign_id, spend, leads, conversations").eq("client_id", clientId).gte("date", desde(30).slice(0, 10)).limit(10_000),
    admin.from("meta_ads_campaigns").select("campaign_id, name").eq("client_id", clientId),
    admin.from("sugestoes_agentes").select("agente, tipo, estado, resultado, conteudo").eq("client_id", clientId).gte("criado_em", desde(90)).limit(2000),
  ]);
  const nomes: Record<string, string> = {};
  for (const c of (camps.data ?? []) as { campaign_id: string; name: string }[]) nomes[c.campaign_id] = String(c.name ?? "").slice(0, 80);
  const conteudo = licoesConteudo(posts);
  // O Estrategista de campanhas usa as lições de conteúdo e de atendimento também.
  const comerciais = licoesComerciais(resumos);
  return [
    ...conteudo,
    ...comerciais,
    ...comerciais.slice(0, 4).map((l) => ({ ...l, agente: "campanhas" as AgenteLicao, chave: `campanhas:${l.chave}` })),
    ...conteudo.slice(0, 3).map((l) => ({ ...l, agente: "campanhas" as AgenteLicao, chave: `campanhas:${l.chave}` })),
    ...licoesAnuncios((ads.data ?? []) as LinhaCampanha[], nomes),
    ...licoesResultados((sugs.data ?? []) as SugestaoMedida[]),
  ];
}

/** Grava as lições: atualiza as que continuam valendo, cria as novas e expira as que sumiram. Vetadas ficam vetadas. */
export async function aprenderClinica(admin: Admin, clientId: string): Promise<{ ativas: number; novas: number; expiradas: number }> {
  const licoes = await calcularLicoes(admin, clientId);
  const { data: atuais, error } = await admin.from("agentes_aprendizados").select("id, chave, estado").eq("client_id", clientId);
  if (error) throw new Error(error.message);
  const porChave = new Map(((atuais ?? []) as { id: string; chave: string; estado: string }[]).map((a) => [a.chave, a]));
  const agora = new Date().toISOString();
  const linhas = licoes.filter((l) => porChave.get(l.chave)?.estado !== "vetado").map((l) => ({
    client_id: clientId, agente: l.agente, chave: l.chave, texto: l.texto, evidencia: l.evidencia, n: l.n, efeito: l.efeito, sinal: l.sinal,
    confianca: l.confianca, origem: l.origem, estado: "ativo", atualizado_em: agora,
  }));
  if (linhas.length) {
    const { error: e } = await admin.from("agentes_aprendizados").upsert(linhas, { onConflict: "client_id,chave" });
    if (e) throw new Error(e.message);
  }
  const vivas = new Set(licoes.map((l) => l.chave));
  const sumiram = [...porChave.values()].filter((a) => a.estado === "ativo" && !vivas.has(a.chave)).map((a) => a.id);
  if (sumiram.length) await admin.from("agentes_aprendizados").update({ estado: "expirado", atualizado_em: agora }).in("id", sumiram);
  return { ativas: linhas.length, novas: linhas.filter((l) => !porChave.has(l.chave)).length, expiradas: sumiram.length };
}

/** Mede sozinho o resultado das sugestões de conteúdo e de anúncios. Devolve quantas mudaram. */
export async function medirSugestoes(admin: Admin): Promise<{ conteudo: number; anuncios: number }> {
  let conteudo = 0, anuncios = 0;
  // Conteúdo: o roteiro virou post? (qualquer estado: a equipe às vezes publica sem marcar no painel)
  const { data: cs } = await admin.from("sugestoes_agentes").select("id, client_id, titulo, conteudo, criado_em, estado, resultado")
    .eq("agente", "conteudo").gte("criado_em", desde(45)).limit(3000);
  const pend = ((cs ?? []) as { id: string; client_id: string; titulo: string; conteudo: { gancho?: string } | null; criado_em: string; estado: string; resultado: string | null }[])
    .filter((s) => !(s.resultado ?? "").startsWith("publicado"));
  const porCliente = new Map<string, typeof pend>();
  for (const s of pend) porCliente.set(s.client_id, [...(porCliente.get(s.client_id) ?? []), s]);
  for (const [clientId, ss] of porCliente) {
    const posts = await postsDaClinica(admin, clientId, 120);
    const novos = posts.filter((p) => p.posted_at && p.posted_at >= ss.reduce((m, s) => (s.criado_em < m ? s.criado_em : m), ss[0].criado_em));
    if (!novos.length) continue;
    const comAlcance = posts.filter((p) => Number(p.reach ?? 0) >= 100);
    const med = mediana(comAlcance.map(taxaSalvamento));
    const usados = new Set<string>();
    for (const s of ss) {
      const p = casarPublicacao({ titulo: s.titulo, gancho: s.conteudo?.gancho ?? null, criado_em: s.criado_em }, novos.filter((x) => !usados.has(`${x.posted_at}|${x.caption?.slice(0, 40)}`)));
      if (!p) continue;
      usados.add(`${p.posted_at}|${p.caption?.slice(0, 40)}`);
      await admin.from("sugestoes_agentes").update({ estado: "feita", resultado: resultadoPublicacao(p, med), medido_em: new Date().toISOString() }).eq("id", s.id);
      conteudo++;
    }
  }
  // Anúncios: 7 dias depois da recomendação, o que aconteceu com a campanha.
  const { data: as } = await admin.from("sugestoes_agentes").select("id, client_id, campanha_id, criado_em")
    .eq("agente", "anuncios").is("medido_em", null).not("campanha_id", "is", null).lt("criado_em", desde(7)).gte("criado_em", desde(40)).limit(500);
  for (const s of (as ?? []) as { id: string; client_id: string; campanha_id: string; criado_em: string }[]) {
    const t = Date.parse(s.criado_em);
    const d = (x: number) => new Date(t + x * DIA).toISOString().slice(0, 10);
    const { data: linhas } = await admin.from("meta_ads_daily").select("date, campaign_id, spend, leads, conversations")
      .eq("client_id", s.client_id).eq("campaign_id", s.campanha_id).gte("date", d(-7)).lt("date", d(8)).limit(100);
    const xs = (linhas ?? []) as (LinhaCampanha & { date: string })[];
    const dia = d(0);
    const r = resultadoCampanha(xs.filter((l) => l.date < dia), xs.filter((l) => l.date > dia));
    await admin.from("sugestoes_agentes").update({ resultado: r ?? "sem dado suficiente para medir", medido_em: new Date().toISOString() }).eq("id", s.id);
    anuncios++;
  }
  return { conteudo, anuncios };
}

/** Mede e aprende para todas as clínicas com o Hub ativo, dentro de um prazo (não atrasa o agendamento). */
export async function aprenderTodas(admin: Admin, prazoMs = 120_000): Promise<{ clinicas: number; ativas: number; novas: number; expiradas: number; medidas: { conteudo: number; anuncios: number }; erros: string[] }> {
  const fim = Date.now() + prazoMs;
  const erros: string[] = [];
  let medidas = { conteudo: 0, anuncios: 0 };
  try { medidas = await medirSugestoes(admin); } catch (e) { erros.push(`medir: ${e instanceof Error ? e.message : String(e)}`); }
  const { data: mods } = await admin.from("cliente_modulos").select("client_id").eq("modulo", "hub").in("status", ["ativo", "beta"]);
  const clientes = [...new Set(((mods ?? []) as { client_id: string }[]).map((m) => m.client_id))];
  let clinicas = 0, ativas = 0, novas = 0, expiradas = 0;
  for (const id of clientes) {
    if (Date.now() > fim) { erros.push(`prazo: ${clientes.length - clinicas} clínica(s) ficaram para a próxima rodada`); break; }
    try { const r = await aprenderClinica(admin, id); clinicas++; ativas += r.ativas; novas += r.novas; expiradas += r.expiradas; }
    catch (e) { erros.push(`${id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)); }
  }
  return { clinicas, ativas, novas, expiradas, medidas, erros };
}

/** Lições ativas para o prompt de um agente. */
export async function lerLicoes(admin: Admin, clientId: string, agente: AgenteLicao): Promise<{ texto: string; n: number }> {
  const { data } = await admin.from("agentes_aprendizados").select("texto, evidencia, sinal, confianca").eq("client_id", clientId).eq("agente", agente).eq("estado", "ativo").limit(30);
  const xs = ((data ?? []) as { texto: string; evidencia: string[]; sinal: "faz" | "evita"; confianca: "alta" | "media" }[]).map((x) => ({ ...x, evidencia: Array.isArray(x.evidencia) ? x.evidencia : [] }));
  return { texto: licoesParaPrompt(xs), n: xs.length };
}
