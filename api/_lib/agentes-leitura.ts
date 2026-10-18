/**
 * Leitura de contexto dos agentes Recuperação de pacientes, Gestor de anúncios e Roteirista de conteúdo
 * (src/lib/agentes-catalogo.ts). Tudo puxado do banco, sem preenchimento manual. Lê direto as tabelas com a chave de
 * serviço (as funções do Hub conferem auth.uid(), que aqui é nulo).
 * Aprendizado: cada leitura inclui o resultado do que o próprio agente propôs antes (medido sozinho quando dá), para a
 * IA repetir o que funcionou e evitar o que foi descartado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { padroesComerciais } from "../../src/lib/brand-brain.js";
import { escolherRecuperaveis, diagnosticarAnuncios, type Candidato, type LinhaAds, type SinalAds } from "../../src/lib/agentes-sugestoes.js";
import { CALENDARIO } from "../../src/lib/campanhas.js";
import { grupoEspecialidade } from "../../src/lib/benchmark-estrategico.js";

type Admin = SupabaseClient<any, any, any>;
const DIA = 86_400_000;
const desde = (d: number) => new Date(Date.now() - d * DIA).toISOString();
const corta = (t: unknown, n: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Brain aprovado em texto + as chaves (para a IA citar e o servidor conferir). */
export async function lerBrain(admin: Admin, clientId: string, memorias?: string[]) {
  let q = admin.from("brain_itens").select("memoria, chave, valor").eq("client_id", clientId).eq("estado", "aprovado");
  if (memorias) q = q.in("memoria", memorias);
  const { data } = await q;
  const itens = (data ?? []) as { memoria: string; chave: string; valor: string }[];
  return { texto: itens.map((i) => `- ${i.memoria}.${i.chave}: ${corta(i.valor, 280)}`).join("\n"), chaves: itens.map((i) => `${i.memoria}.${i.chave}`), n: itens.length };
}

async function ficha(admin: Admin, clientId: string) {
  const { data: cliente } = await admin.from("clients").select("name, specialty").eq("id", clientId).maybeSingle();
  const { data: cli } = await admin.from("sap_clinicas").select("especialidade, cidade, servicos").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const esp = (cli?.especialidade as string) ?? (cliente?.specialty as string) ?? null;
  const linhas = [cliente?.name && `Clínica: ${cliente.name}`, esp && `Especialidade: ${esp}`, cli?.cidade && `Cidade: ${cli.cidade}`,
    cli?.servicos && `Serviços: ${corta(Array.isArray(cli.servicos) ? cli.servicos.join(", ") : JSON.stringify(cli.servicos), 300)}`].filter(Boolean);
  return { texto: linhas.join("\n"), especialidade: esp, nome: (cliente?.name as string) ?? "" };
}

/** Taxas das sugestões anteriores do agente (medidas sozinhas ou marcadas), por tipo. */
async function aprendizado(admin: Admin, clientId: string, agente: string, dias = 60) {
  const { data } = await admin.from("sugestoes_agentes").select("tipo, estado, resultado, titulo").eq("client_id", clientId).eq("agente", agente).gte("criado_em", desde(dias)).limit(500);
  const xs = (data ?? []) as { tipo: string; estado: string; resultado: string | null; titulo: string }[];
  return xs;
}

// ---------------------------------------------------------------- Recuperação de pacientes

export async function lerRecuperacao(admin: Admin, clientId: string) {
  const resumos: { conversa_id: string; resumo: any; ate_msg_em: string | null }[] = [];
  for (let de = 0; de < 4000; de += 1000) {
    const { data } = await admin.from("conversas_resumos").select("conversa_id, resumo, ate_msg_em").eq("client_id", clientId).gte("gerado_em", desde(25)).order("gerado_em", { ascending: false }).range(de, de + 999);
    resumos.push(...((data ?? []) as any[]));
    if ((data ?? []).length < 1000) break;
  }
  const pre = resumos.filter((r) => r.resumo && r.resumo.comercial !== false && (r.resumo.recuperavel === true || r.resumo.situacao === "aguardando_clinica") && r.resumo.etapa !== "agendou" && r.resumo.situacao !== "agendou");
  const ids = pre.map((r) => r.conversa_id).slice(0, 400);
  const ult = new Map<string, string | null>();
  const ja = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const parte = ids.slice(i, i + 100);
    const [{ data: cs }, { data: ss }] = await Promise.all([
      admin.from("conversas").select("id, ultima_msg_em").in("id", parte),
      admin.from("sugestoes_agentes").select("conversa_id").in("conversa_id", parte).gte("criado_em", desde(14)),
    ]);
    for (const c of (cs ?? []) as { id: string; ultima_msg_em: string | null }[]) ult.set(c.id, c.ultima_msg_em);
    for (const s of (ss ?? []) as { conversa_id: string }[]) ja.add(s.conversa_id);
  }
  const candidatos = escolherRecuperaveis(pre.map((r) => ({ conversa_id: r.conversa_id, ultima_msg_em: ult.get(r.conversa_id) ?? null, ate_msg_em: r.ate_msg_em, resumo: r.resumo })), ja);
  const porId = new Map(pre.map((r) => [r.conversa_id, r.resumo]));
  const casos = candidatos.map((c: Candidato) => {
    const r = porId.get(c.conversa_id) ?? {};
    return { ...c, texto: [`conversa_id: ${c.conversa_id}`, `parada há ${c.dias} dia(s); motivo da lista: ${c.motivo}`, r.motivo && `Por que chamou: ${corta(r.motivo, 120)}`,
      r.resumo && `O que aconteceu: ${corta(r.resumo, 420)}`, r.interesse && `Interesse: ${corta(r.interesse, 80)}`,
      Array.isArray(r.objecoes) && r.objecoes.length ? `Objeções: ${r.objecoes.join(", ")}` : null, r.como_deveria && `O que a clínica deveria ter dito: ${corta(r.como_deveria, 240)}`].filter(Boolean).join("\n") };
  });
  const [brain, f, hist] = await Promise.all([lerBrain(admin, clientId, ["identidade", "comercial", "audiencia"]), ficha(admin, clientId), aprendizado(admin, clientId, "recuperacao")]);
  const feitas = hist.filter((h) => h.estado !== "descartada" && h.resultado);
  const taxa = (t: string) => { const xs = feitas.filter((h) => h.tipo === t); const resp = xs.filter((h) => h.resultado === "respondeu" || h.resultado === "agendou").length; return xs.length >= 5 ? `${t}: ${resp} de ${xs.length} responderam (${Math.round((100 * resp) / xs.length)}%)` : null; };
  const aprendeu = ["aguardando_clinica", "pediu_preco", "interesse"].map(taxa).filter(Boolean);
  return { casos, brain, ficha: f.texto, aprendizado: aprendeu.length ? `Resultado das mensagens anteriores (60 dias): ${aprendeu.join("; ")}.` : "" };
}

// ---------------------------------------------------------------- Gestor de anúncios

export async function lerAnuncios(admin: Admin, clientId: string) {
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const { data: linhas } = await admin.from("meta_ads_daily").select("campaign_id, date, spend, impressions, reach, frequency, leads, conversations, link_clicks")
    .eq("client_id", clientId).gte("date", desde(15).slice(0, 10)).limit(10_000);
  const { data: camps } = await admin.from("meta_ads_campaigns").select("campaign_id, name, objective").eq("client_id", clientId);
  const nomes: Record<string, string> = {};
  for (const c of (camps ?? []) as { campaign_id: string; name: string; objective: string | null }[]) nomes[c.campaign_id] = corta(c.name, 90) + (c.objective ? ` (${c.objective})` : "");
  const sinais: SinalAds[] = diagnosticarAnuncios((linhas ?? []) as LinhaAds[], nomes, hoje);
  const [brain, f, hist] = await Promise.all([lerBrain(admin, clientId, ["identidade", "audiencia", "criativa"]), ficha(admin, clientId), aprendizado(admin, clientId, "anuncios", 30)]);
  const anteriores = hist.slice(0, 15).map((h) => `- [${h.estado}${h.resultado ? `, ${h.resultado}` : ""}] ${corta(h.titulo, 120)}`).join("\n");
  return { sinais, brain, ficha: f.texto, anteriores };
}

// ---------------------------------------------------------------- Roteirista de conteúdo

export async function lerConteudo(admin: Admin, clientId: string) {
  const [brain, f, posts, duvidas, hist, pautas] = await Promise.all([
    lerBrain(admin, clientId),
    ficha(admin, clientId),
    admin.from("instagram_posts").select("tema, format, caption, reach, saved, shares, engagement").eq("client_id", clientId).gte("posted_at", desde(120)).order("saved", { ascending: false, nullsFirst: false }).limit(10),
    admin.from("instagram_comments").select("text").eq("client_id", clientId).eq("is_question", true).gte("commented_at", desde(90)).order("commented_at", { ascending: false }).limit(60),
    aprendizado(admin, clientId, "conteudo", 90),
    admin.from("pautas_conteudo").select("titulo, status").eq("client_id", clientId).gte("criado_em", desde(60)).limit(60),
  ]);
  const blocos: string[] = [];
  if (f.texto) blocos.push(`### Ficha\n${f.texto}`);
  if (brain.n) blocos.push(`### Brand Brain aprovado (use o tom e cite as chaves em "brain")\n${brain.texto}`);
  const ps = (posts.data ?? []) as any[];
  if (ps.length) blocos.push(`### Posts que mais foram salvos (120 dias): o que o público valoriza\n${ps.map((p) => `- ${p.format ?? "post"} · tema ${p.tema ?? "?"} · alcance ${p.reach ?? "?"} · salvos ${p.saved ?? "?"} · compart. ${p.shares ?? "?"} · início: "${corta(p.caption, 140)}"`).join("\n")}`);
  const dv = [...new Set(((duvidas.data ?? []) as { text: string }[]).map((d) => corta(d.text, 140)).filter((t) => t.length >= 12))];
  if (dv.length) blocos.push(`### Perguntas reais nos comentários (90 dias)\n${dv.slice(0, 40).map((t) => `- ${t}`).join("\n")}`);
  const resumos: any[] = [];
  const { data: rs } = await admin.from("conversas_resumos").select("resumo").eq("client_id", clientId).gte("gerado_em", desde(45)).limit(1500);
  resumos.push(...((rs ?? []) as { resumo: any }[]).map((r) => r.resumo).filter((r) => r && typeof r === "object"));
  const padroes = padroesComerciais(resumos, 45);
  if (padroes) blocos.push(`### O que aparece nas conversas do WhatsApp (45 dias)\n${padroes}`);
  const motivos = new Map<string, number>();
  for (const r of resumos) { const k = corta(r.interesse, 60).toLowerCase(); if (k && k !== "null") motivos.set(k, (motivos.get(k) ?? 0) + 1); }
  const top = [...motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length) blocos.push(`### O que os pacientes procuram nas conversas\n${top.map(([k, n]) => `- ${k}: ${n}`).join("\n")}`);
  const area = grupoEspecialidade(f.especialidade);
  const hoje = new Date(Date.now() - 3 * 3_600_000);
  const meses = [hoje.getUTCMonth() + 1, ((hoje.getUTCMonth() + 1) % 12) + 1];
  const datas = CALENDARIO.filter((d) => meses.includes(d.mes) && (d.areas === "todas" || (d.areas as string[]).includes(area)));
  if (datas.length) blocos.push(`### Datas de saúde próximas\n${datas.map((d) => `- ${d.dia ? `${d.dia}/` : ""}${d.mes} ${d.nome}: ${d.angulo}${d.cuidado ? ` (cuidado: ${d.cuidado})` : ""}`).join("\n")}`);
  const usadas = hist.filter((h) => h.estado === "feita").map((h) => h.titulo), descartadas = hist.filter((h) => h.estado === "descartada").map((h) => h.titulo);
  const titulos = [...hist.map((h) => h.titulo), ...((pautas.data ?? []) as { titulo: string }[]).map((p) => p.titulo)];
  if (usadas.length || descartadas.length) blocos.push(`### Aprendizado com as peças anteriores\n${usadas.length ? `A equipe USOU: ${usadas.slice(0, 12).map((t) => `"${corta(t, 80)}"`).join("; ")}.\n` : ""}${descartadas.length ? `A equipe DESCARTOU (evite o estilo): ${descartadas.slice(0, 12).map((t) => `"${corta(t, 80)}"`).join("; ")}.` : ""}`);
  if (titulos.length) blocos.push(`### Já propostos ou no planejador (não repita)\n${titulos.slice(0, 40).map((t) => `- ${corta(t, 100)}`).join("\n")}`);
  return { texto: blocos.join("\n\n").slice(0, 16_000), chaves: brain.chaves, titulos, blocos: blocos.length, especialidade: f.especialidade };
}
