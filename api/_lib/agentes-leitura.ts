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
import { filtrarComentarios, filtrarConversas, filtrarPosts, somarFiltros, textoFiltro, type ResumoConversa } from "../../src/lib/aprendizado.js";
import { lerLicoes, resultadosRecuperacao } from "./aprendizado.js";
import { limitarTexto } from "./texto-ia.js";
import { etapaDaCampanha, seguidoresEstimados, type Etapa, type PostEtapa } from "../../src/lib/funil-anuncios.js";

type Admin = SupabaseClient<any, any, any>;
const DIA = 86_400_000;
const desde = (d: number) => new Date(Date.now() - d * DIA).toISOString();
const corta = (t: unknown, n: number) => limitarTexto(String(t ?? "").replace(/\s+/g, " ").trim(), n);

/** Brain aprovado em texto + as chaves (para a IA citar e o servidor conferir). */
export async function lerBrain(admin: Admin, clientId: string, memorias?: string[]) {
  let q = admin.from("brain_itens").select("memoria, chave, valor").eq("client_id", clientId).eq("estado", "aprovado");
  if (memorias) q = q.in("memoria", memorias);
  const { data, error } = await q;
  if (error) throw new Error("Não foi possível ler o Brand Brain aprovado");
  const itens = (data ?? []) as { memoria: string; chave: string; valor: string }[];
  return { texto: itens.map((i) => `- ${i.memoria}.${i.chave}: ${corta(i.valor, 280)}`).join("\n"), chaves: itens.map((i) => `${i.memoria}.${i.chave}`), n: itens.length };
}

async function ficha(admin: Admin, clientId: string) {
  const { data: cliente, error: erroCliente } = await admin.from("clients").select("name, specialty").eq("id", clientId).maybeSingle();
  const { data: cli, error: erroClinica } = await admin.from("sap_clinicas").select("especialidade, cidade, servicos").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (erroCliente || erroClinica) throw new Error("Não foi possível ler a ficha da clínica");
  const esp = (cli?.especialidade as string) ?? (cliente?.specialty as string) ?? null;
  const linhas = [cliente?.name && `Clínica: ${cliente.name}`, esp && `Especialidade: ${esp}`, cli?.cidade && `Cidade: ${cli.cidade}`,
    cli?.servicos && `Serviços: ${corta(Array.isArray(cli.servicos) ? cli.servicos.join(", ") : JSON.stringify(cli.servicos), 300)}`].filter(Boolean);
  return { texto: linhas.join("\n"), especialidade: esp, nome: (cliente?.name as string) ?? "" };
}

/** Taxas das sugestões anteriores do agente (medidas sozinhas ou marcadas), por tipo. */
async function aprendizado(admin: Admin, clientId: string, agente: string, dias = 60) {
  if (agente === "recuperacao") return resultadosRecuperacao(admin,clientId);
  const { data, error } = await admin.from("sugestoes_agentes").select("tipo, estado, resultado, titulo").eq("client_id", clientId).eq("agente", agente).gte("criado_em", desde(dias)).limit(500);
  if (error) throw new Error("Não foi possível ler as sugestões anteriores");
  const xs = (data ?? []) as { tipo: string; estado: string; resultado: string | null; titulo: string }[];
  return xs;
}

// ---------------------------------------------------------------- Recuperação de pacientes

export async function lerRecuperacao(admin: Admin, clientId: string) {
  const { data: saude, error: erroFontes } = await admin.rpc("operacao_fontes", { p_client_id: clientId });
  if (erroFontes) throw new Error(`Não foi possível verificar a cobertura da recuperação: ${erroFontes.message}`);
  if (!saude?.apto) return { casos: [], brain: { texto: "", chaves: [] as string[], n: 0 }, ficha: "", aprendizado: "", bloqueio: "Atualizar a coleta de mensagens e o CRM antes de preparar novos contatos." };
  const resumos: { conversa_id: string; resumo: any; ate_msg_em: string | null }[] = [];
  for (let de = 0; de < 4000; de += 1000) {
    const { data, error } = await admin.from("conversas_resumos").select("conversa_id, resumo, ate_msg_em").eq("client_id", clientId).gte("gerado_em", desde(25)).order("gerado_em", { ascending: false }).range(de, de + 999);
    if (error) throw new Error("Não foi possível ler as conversas para recuperação");
    resumos.push(...((data ?? []) as any[]));
    if ((data ?? []).length < 1000) break;
  }
  const pre = resumos.filter((r) => r.resumo && r.resumo.comercial !== false && (r.resumo.recuperavel === true || r.resumo.situacao === "aguardando_clinica") && r.resumo.etapa !== "agendou" && r.resumo.situacao !== "agendou");
  const ids = pre.map((r) => r.conversa_id).slice(0, 400);
  const ult = new Map<string, string | null>();
  const ja = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const parte = ids.slice(i, i + 100);
    const [{ data: cs, error: erroConversas }, { data: ss, error: erroSugestoes }] = await Promise.all([
      admin.from("conversas").select("id, ultima_msg_em").in("id", parte),
      admin.from("sugestoes_agentes").select("conversa_id").in("conversa_id", parte).gte("criado_em", desde(14)),
    ]);
    if (erroConversas || erroSugestoes) throw new Error("Não foi possível conferir a atividade e as propostas de recuperação");
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
  const [brain, f, hist, licoes] = await Promise.all([lerBrain(admin, clientId, ["identidade", "comercial", "audiencia"]), ficha(admin, clientId), aprendizado(admin, clientId, "recuperacao"), lerLicoes(admin, clientId, "recuperacao")]);
  const filtro = filtrarConversas(resumos.map((r) => r.resumo as ResumoConversa)).filtro;
  const feitas = hist.filter((h) => h.estado !== "descartada" && h.resultado);
  const taxa = (t: string) => { const xs = feitas.filter((h) => h.tipo === t); const resp = xs.filter((h) => h.resultado === "respondeu" || h.resultado === "agendou").length; return xs.length >= 5 ? `${t}: ${resp} de ${xs.length} responderam (${Math.round((100 * resp) / xs.length)}%)` : null; };
  const aprendeu = ["aguardando_clinica", "pediu_preco", "interesse"].map(taxa).filter(Boolean);
  return { casos, brain, ficha: f.texto, bloqueio: null, licoes: licoes.texto, n_licoes: licoes.n, filtro: textoFiltro(filtro),
    aprendizado: aprendeu.length ? `Atividade observada após propostas anteriores (60 dias, sem atribuição causal às mensagens): ${aprendeu.join("; ")}.` : "" };
}

// ---------------------------------------------------------------- Gestor de anúncios

export async function lerAnuncios(admin: Admin, clientId: string) {
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const { data: linhas, error: erroMetricas } = await admin.from("meta_ads_daily").select("campaign_id, date, spend, impressions, reach, frequency, leads, conversations, link_clicks")
    .eq("client_id", clientId).gte("date", desde(15).slice(0, 10)).limit(10_000);
  const { data: camps, error: erroCampanhas } = await admin.from("meta_ads_campaigns").select("campaign_id, name, objective").eq("client_id", clientId);
  if (erroMetricas || erroCampanhas) throw new Error("Não foi possível ler as métricas e campanhas de anúncios");
  const nomes: Record<string, string> = {};
  for (const c of (camps ?? []) as { campaign_id: string; name: string; objective: string | null }[]) nomes[c.campaign_id] = corta(c.name, 90) + (c.objective ? ` (${c.objective})` : "");
  // Etapa do funil de cada campanha (C1/C2 = visita ao perfil, julgada por seguidor; C3 = conversa). Seguidor por
  // campanha é estimado pelo rateio dos novos seguidores do dia (src/lib/funil-anuncios.ts).
  const [{ data: posts }, { data: segs }] = await Promise.all([
    admin.from("instagram_posts").select("caption, funnel_stage").eq("client_id", clientId).gte("posted_at", desde(400)).not("funnel_stage", "is", null).limit(2000),
    admin.from("instagram_account_daily_metrics").select("date, new_followers").eq("client_id", clientId).gte("date", desde(15).slice(0, 10)).limit(200),
  ]);
  const etapas = new Map<string, Etapa>();
  for (const c of (camps ?? []) as { campaign_id: string; name: string; objective: string | null }[]) {
    const e = etapaDaCampanha(c.name ?? "", c.objective, (posts ?? []) as PostEtapa[]).etapa;
    if (e) etapas.set(c.campaign_id, e);
  }
  const perfilIds = new Set([...etapas].filter(([, e]) => e === "C1" || e === "C2").map(([id]) => id));
  const novosPorDia = new Map<string, number>();
  for (const x of (segs ?? []) as { date: string; new_followers: number | null }[]) if (x.new_followers != null) novosPorDia.set(x.date, (novosPorDia.get(x.date) ?? 0) + Number(x.new_followers));
  const ini7 = desde(7).slice(0, 10);
  const linhas7 = ((linhas ?? []) as LinhaAds[]).filter((l) => l.campaign_id && l.date >= ini7 && l.date <= hoje)
    .map((l) => ({ campaign_id: l.campaign_id as string, date: l.date, spend: Number(l.spend ?? 0), link_clicks: Number(l.link_clicks ?? 0) }));
  const seguidores7 = seguidoresEstimados(linhas7, [...novosPorDia].map(([date, novos]) => ({ date, novos })), perfilIds);
  const sinais: SinalAds[] = diagnosticarAnuncios((linhas ?? []) as LinhaAds[], nomes, hoje, { etapas, seguidores7 });
  const [brain, f, hist, licoes] = await Promise.all([lerBrain(admin, clientId, ["identidade", "audiencia", "criativa"]), ficha(admin, clientId), aprendizado(admin, clientId, "anuncios", 30), lerLicoes(admin, clientId, "anuncios")]);
  const anteriores = hist.slice(0, 15).map((h) => `- [${h.estado}${h.resultado ? `, ${h.resultado}` : ""}] ${corta(h.titulo, 120)}`).join("\n");
  return { sinais, brain, ficha: f.texto, anteriores, licoes: licoes.texto, n_licoes: licoes.n };
}

// ---------------------------------------------------------------- Roteirista de conteúdo

export async function lerConteudo(admin: Admin, clientId: string) {
  const [brain, f, posts, comentarios, hist, pautas, licoes] = await Promise.all([
    lerBrain(admin, clientId),
    ficha(admin, clientId),
    admin.from("instagram_posts").select("tema, format, caption, reach, saved, shares, engagement, transcricao").eq("client_id", clientId).gte("posted_at", desde(120)).order("saved", { ascending: false, nullsFirst: false }).limit(40),
    admin.from("instagram_comments").select("text").eq("client_id", clientId).gte("commented_at", desde(90)).order("commented_at", { ascending: false }).limit(800),
    aprendizado(admin, clientId, "conteudo", 90),
    admin.from("pautas_conteudo").select("titulo, status").eq("client_id", clientId).gte("criado_em", desde(60)).limit(60),
    lerLicoes(admin, clientId, "conteudo"),
  ]);
  if ([posts, comentarios, pautas].some((r) => r.error)) throw new Error("Não foi possível ler as fontes de conteúdo");
  const blocos: string[] = [];
  if (f.texto) blocos.push(`### Ficha\n${f.texto}`);
  if (brain.n) blocos.push(`### Brand Brain aprovado (use o tom e cite as chaves em "brain")\n${brain.texto}`);
  if (licoes.texto) blocos.push(licoes.texto);
  // Filtro de ruído: só post com alcance para comparar, só comentário que é pergunta ou relato, só conversa comercial.
  const fp = filtrarPosts((posts.data ?? []) as any[]);
  const ps = fp.uteis.slice(0, 10) as any[];
  if (ps.length) blocos.push(`### Posts que mais foram salvos (120 dias): o que o público valoriza\n${ps.map((p) => `- ${p.format ?? "post"} · tema ${p.tema ?? "?"} · alcance ${p.reach ?? "?"} · salvos ${p.saved ?? "?"} · compart. ${p.shares ?? "?"} · legenda: "${corta(p.caption, 140)}"`).join("\n")}`);
  // O roteiro falado dos Reels campeões (transcrição): estrutura real de gancho, desenvolvimento e chamada.
  const falados = ps.filter((p) => p.transcricao).slice(0, 4);
  if (falados.length) blocos.push(`### Roteiro falado dos Reels mais salvos (transcrição; use a estrutura, não copie)\n${falados.map((p) => `- (${p.saved ?? "?"} salvos) "${corta(p.transcricao, 700)}"`).join("\n")}`);
  const fc = filtrarComentarios((comentarios.data ?? []) as { text: string }[]);
  const perguntas = fc.uteis.filter((c) => c.tipo === "pergunta").map((c) => corta(c.text, 140));
  const relatos = fc.uteis.filter((c) => c.tipo === "relato").map((c) => corta(c.text, 140));
  if (perguntas.length) blocos.push(`### Perguntas reais nos comentários (90 dias, já sem elogio, emoji e marcação)\n${perguntas.slice(0, 35).map((t) => `- ${t}`).join("\n")}`);
  if (relatos.length) blocos.push(`### Relatos do público nos comentários (o que as pessoas vivem; bom para identificação)\n${relatos.slice(0, 12).map((t) => `- ${t}`).join("\n")}`);
  const brutos: any[] = [];
  const { data: rs, error: erroResumos } = await admin.from("conversas_resumos").select("resumo").eq("client_id", clientId).gte("gerado_em", desde(45)).limit(1500);
  if (erroResumos) throw new Error("Não foi possível ler as conversas para conteúdo");
  brutos.push(...((rs ?? []) as { resumo: any }[]).map((r) => r.resumo));
  const fr = filtrarConversas(brutos);
  const resumos = fr.uteis as any[];
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
  const filtro = textoFiltro(somarFiltros(fp.filtro, fc.filtro, fr.filtro));
  return { texto: limitarTexto(blocos.join("\n\n"), 16_000), chaves: brain.chaves, titulos, blocos: blocos.length, especialidade: f.especialidade, filtro, n_licoes: licoes.n };
}
