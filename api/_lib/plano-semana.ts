/**
 * Plano da semana (servidor): confere as ações das últimas semanas e monta a da semana atual, 3 a 5 ações por
 * clínica priorizadas pelo dinheiro em jogo. Regras puras em src/lib/plano-semana.ts.
 *   Responder: paciente esperando a clínica (7 dias, sem mensagem nova depois).
 *   Recuperar: interesse real, não agendou, conversa parada de 1 a 21 dias.
 *   Preço: perguntou o valor e não recebeu (14 dias).
 *   Anúncio: sinal mais recente do gestor de anúncios pedindo correção, valorado pelo gasto de 7 dias.
 *   Conteúdo: tema mais pedido pelos pacientes em 14 dias sem post em 21 dias.
 * Conferência: respondeu a maior parte da lista? agendou? (pacientes; no preço, o valor foi apresentado?); gasto caiu
 * com a campanha ainda no ar ou com mudança registrada? (anúncio); publicou? (conteúdo). A taxa de agendamento
 * aprendida na clínica (pacientes atendidos, ações com 14+ dias) substitui a padrão no valor em jogo.
 * Nada é enviado a paciente: a ação aponta a lista e a equipe executa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { estadoConferido, ordenar, resultadoConversas, semanaDe, TAXA_PADRAO, taxaAprendida, valorEmJogo, type MedicaoHistorico, type OrigemPlano } from "../../src/lib/plano-semana.js";

type Admin = SupabaseClient<any, any, any>;
type Resumo = { conversa_id: string; ate_msg_em: string; resumo: Record<string, unknown> };
interface Item { id: string; client_id: string; semana: string; origem: OrigemPlano; estado: string; criado_em: string; refs: Record<string, unknown>; n: number; decidido_por: string | null }

const DIA = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const sim = (v: unknown) => v === true || v === "true";

async function ticketDe(admin: Admin, clientId: string): Promise<number | null> {
  const { data, error } = await admin.rpc("plano_ticket", { p_client: clientId });
  if (error) throw new Error("Não foi possível ler o ticket médio");
  return data == null ? null : Number(data);
}

async function taxaDe(admin: Admin, clientId: string, origem: "responder" | "recuperar" | "preco", semana: string): Promise<{ taxa: number; aprendida: boolean }> {
  const { data, error } = await admin.from("plano_itens").select("medicao, criado_em, semana, estado").eq("client_id", clientId).eq("origem", origem)
    .lt("semana", semana).gte("semana", iso(Date.now() - 120 * DIA).slice(0, 10)).not("medido_em", "is", null);
  if (error) throw new Error("Não foi possível ler o histórico do plano");
  return taxaAprendida((data ?? []) as MedicaoHistorico[], TAXA_PADRAO[origem]);
}

/** Conversas paradas desde a última leitura (nenhuma mensagem depois). */
async function semMensagemNova(admin: Admin, resumos: Resumo[]): Promise<Resumo[]> {
  const ult = new Map<string, string>();
  for (let i = 0; i < resumos.length; i += 200) {
    const { data, error } = await admin.from("conversas").select("id, ultima_msg_em").in("id", resumos.slice(i, i + 200).map((r) => r.conversa_id));
    if (error) throw new Error("Não foi possível ler as conversas");
    for (const c of (data ?? []) as { id: string; ultima_msg_em: string | null }[]) if (c.ultima_msg_em) ult.set(c.id, c.ultima_msg_em);
  }
  return resumos.filter((r) => { const u = ult.get(r.conversa_id); return !u || Date.parse(u) <= Date.parse(r.ate_msg_em) + 60_000; });
}

async function resumosDesde(admin: Admin, clientId: string, desdeMs: number): Promise<Resumo[]> {
  const todos: Resumo[] = [];
  for (let de = 0; de < 10_000; de += 1000) {
    const { data, error } = await admin.from("conversas_resumos").select("conversa_id, ate_msg_em, resumo").eq("client_id", clientId)
      .gte("ate_msg_em", iso(desdeMs)).order("ate_msg_em", { ascending: false }).range(de, de + 999);
    if (error) throw new Error("Não foi possível ler as leituras das conversas");
    todos.push(...((data ?? []) as Resumo[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return todos;
}

async function medirConversas(admin: Admin, it: Item, ticket: number | null) {
  const ids = (Array.isArray(it.refs.conversas) ? it.refs.conversas : []) as string[];
  if (!ids.length) return null;
  const respondidas = new Set<string>(), agendaram = new Set<string>(), precoDado = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const [{ data: msgs, error: e1 }, { data: res, error: e2 }, { data: convs, error: e3 }] = await Promise.all([
      admin.from("mensagens").select("conversa_id").in("conversa_id", lote).eq("direcao", "saida").gt("enviada_em", it.criado_em).limit(5000),
      admin.from("conversas_resumos").select("conversa_id, resumo").in("conversa_id", lote).gt("ate_msg_em", it.criado_em),
      admin.from("conversas").select("id, lead_id").in("id", lote).not("lead_id", "is", null),
    ]);
    if (e1 || e2 || e3) throw new Error("Não foi possível conferir as conversas");
    for (const m of (msgs ?? []) as { conversa_id: string }[]) respondidas.add(m.conversa_id);
    for (const r of (res ?? []) as { conversa_id: string; resumo: Record<string, unknown> }[]) {
      if (r.resumo?.situacao === "agendou" || r.resumo?.etapa === "agendou") agendaram.add(r.conversa_id);
      if (sim(r.resumo?.preco_apresentado)) precoDado.add(r.conversa_id);
    }
    const porLead = new Map(((convs ?? []) as { id: string; lead_id: string }[]).map((c) => [c.lead_id, c.id]));
    if (porLead.size) {
      const { data: leads, error: e4 } = await admin.from("crm_leads").select("id").in("id", [...porLead.keys()]).eq("outcome", "won").gt("occurred_at", it.criado_em);
      if (e4) throw new Error("Não foi possível conferir o CRM");
      for (const l of (leads ?? []) as { id: string }[]) agendaram.add(porLead.get(l.id)!);
    }
  }
  // Preço: só conta quem recebeu o valor (releitura da conversa depois da ação), não qualquer mensagem da equipe.
  const atendidas = it.origem === "preco" ? [...respondidas].filter((id) => precoDado.has(id)).length : respondidas.size;
  return resultadoConversas(ids.length, atendidas, agendaram.size, ticket, it.origem);
}

async function medirItem(admin: Admin, it: Item, ticket: number | null, semanaAtual: string): Promise<void> {
  const desde = Date.parse(it.criado_em);
  const conferir = (feita: boolean) => estadoConferido(it.estado, feita, it.decidido_por != null, it.semana < semanaAtual);
  let upd: Record<string, unknown> | null = null;
  if (it.origem === "responder" || it.origem === "recuperar" || it.origem === "preco") {
    const r = await medirConversas(admin, it, ticket);
    if (r) upd = { medicao: r.medicao, resultado_brl: r.resultado_brl, resultado_texto: r.resultado_texto, ...conferir(r.feita) };
  } else if (it.origem === "anuncio") {
    const camp = String(it.refs.campanha ?? "");
    const dia = (ms: number) => iso(ms).slice(0, 10);
    const soma = async (de: number, ate: number) => {
      const { data, error } = await admin.from("meta_ads_daily").select("spend").eq("client_id", it.client_id).eq("campaign_id", camp).gte("date", dia(de)).lte("date", dia(ate));
      if (error) throw new Error("Não foi possível conferir o anúncio");
      return ((data ?? []) as { spend: number | null }[]).reduce((s, r) => s + Number(r.spend ?? 0), 0);
    };
    const antes = await soma(desde - 7 * DIA, desde - DIA), depois = await soma(desde, desde + 6 * DIA);
    // Gasto que só caiu porque a campanha acabou não é resultado: exige campanha ainda no ar ou mudança aprovada.
    const { count: mudancas, error: eM } = await admin.from("anuncios_mudancas").select("id", { count: "exact", head: true })
      .eq("client_id", it.client_id).eq("campanha_id", camp).eq("estado", "aplicada").gte("aplicado_em", it.criado_em);
    if (eM) throw new Error("Não foi possível conferir as mudanças no anúncio");
    const caiu = antes > 0 && depois < antes * 0.7 && (depois > 0 || (mudancas ?? 0) > 0);
    upd = {
      medicao: { gasto_antes: Math.round(antes), gasto_depois: Math.round(depois), mudancas: mudancas ?? 0 },
      resultado_brl: caiu ? Math.round(antes - depois) : null,
      resultado_texto: `Gasto na campanha: R$ ${Math.round(antes)} nos 7 dias antes, R$ ${Math.round(depois)} nos 7 dias depois`
        + (antes > 0 && depois === 0 && !mudancas ? " (a campanha parou sem mudança registrada: não conta como gasto evitado)" : ""),
      ...conferir(caiu),
    };
  } else if (it.origem === "conteudo") {
    const tema = String(it.refs.tema ?? "");
    const [{ count: posts, error: e1 }, { count: conv, error: e2 }] = await Promise.all([
      admin.from("instagram_posts").select("id", { count: "exact", head: true }).eq("client_id", it.client_id).is("removido_em", null).eq("tema", tema).gt("posted_at", it.criado_em),
      admin.from("conversas_tema").select("conversa_id", { count: "exact", head: true }).eq("client_id", it.client_id).eq("tema", tema).gt("gerado_em", it.criado_em),
    ]);
    if (e1 || e2) throw new Error("Não foi possível conferir o conteúdo");
    upd = {
      medicao: { posts: posts ?? 0, conversas_depois: conv ?? 0, conversas_antes: Number(it.refs.n ?? 0) },
      resultado_texto: `${posts ?? 0} post(s) sobre o tema publicados; ${conv ?? 0} conversas pediram esse tema depois`,
      ...conferir((posts ?? 0) > 0),
    };
  }
  if (!upd) return;
  const { error } = await admin.from("plano_itens").update({ ...upd, medido_em: new Date().toISOString() }).eq("id", it.id);
  if (error) throw new Error("Não foi possível gravar a conferência");
}

type Novo = { origem: OrigemPlano; titulo: string; porque: string; acao: string; onde: string; n: number; valor_brl: number | null; valor_calculo: string; refs: Record<string, unknown> };

async function candidatos(admin: Admin, clientId: string, semana: string, ticket: number | null): Promise<Novo[]> {
  const agora = Date.now();
  const novos: Novo[] = [];
  const usados = new Set<string>();
  const resumos = await semMensagemNova(admin, (await resumosDesde(admin, clientId, agora - 21 * DIA)).filter((r) => (r.resumo?.comercial as unknown) !== false));

  const lista = (f: (r: Resumo) => boolean) => resumos.filter((r) => !usados.has(r.conversa_id) && f(r)).slice(0, 100).map((r) => r.conversa_id);
  const porPaciente = async (origem: "responder" | "recuperar" | "preco", ids: string[], textos: { titulo: string; porque: string; acao: string; onde: string }) => {
    if (!ids.length) return;
    ids.forEach((id) => usados.add(id));
    const t = await taxaDe(admin, clientId, origem, semana);
    const v = valorEmJogo(ids.length, t.taxa, ticket, t.aprendida);
    novos.push({ origem, ...textos, n: ids.length, valor_brl: v.valor, valor_calculo: v.calculo, refs: { conversas: ids } });
  };

  const responder = lista((r) => r.resumo?.situacao === "aguardando_clinica" && Date.parse(r.ate_msg_em) > agora - 7 * DIA);
  await porPaciente("responder", responder, {
    titulo: `Responder ${responder.length} paciente(s) que estão esperando a clínica`,
    porque: "Eles mandaram a última mensagem e ninguém respondeu. Quem espera esfria rápido: cada dia sem resposta reduz a chance de agendar.",
    acao: "Abra a lista, responda cada um hoje e ofereça um horário concreto.",
    onde: "/atendimento",
  });
  const recuperar = lista((r) => sim(r.resumo?.recuperavel) && !["agendou", "aguardando_clinica"].includes(String(r.resumo?.situacao ?? "")) && Date.parse(r.ate_msg_em) < agora - DIA);
  await porPaciente("recuperar", recuperar, {
    titulo: `Retomar ${recuperar.length} paciente(s) que demonstraram interesse e sumiram`,
    porque: "Perguntaram de preço, procedimento ou disseram que queriam, mas não agendaram. É o dinheiro mais rápido: o paciente já existe.",
    acao: "Use a mensagem sugerida em Agentes → Recuperação (uma por paciente) e registre quem respondeu.",
    onde: "/agentes",
  });
  const preco = lista((r) => sim(r.resumo?.preco_pedido) && !sim(r.resumo?.preco_apresentado) && r.resumo?.situacao !== "agendou" && Date.parse(r.ate_msg_em) > agora - 14 * DIA);
  await porPaciente("preco", preco, {
    titulo: `Responder o valor para ${preco.length} paciente(s) que perguntaram e não receberam`,
    porque: "Quem pergunta preço está perto de decidir. Sem resposta clara, vai para outra clínica.",
    acao: "Responda o valor com o que está incluído (consulta, retorno, exames) e já ofereça dois horários.",
    onde: "/atendimento",
  });

  // Anúncio: sinal do gestor de anúncios ainda aberto, valorado pelo gasto da campanha em 7 dias.
  const { data: sug, error: eSug } = await admin.from("sugestoes_agentes").select("titulo, detalhe, campanha_id, tipo")
    .eq("client_id", clientId).eq("agente", "anuncios").eq("estado", "proposta").not("campanha_id", "is", null)
    .in("tipo", ["sem_resultado", "custo_subiu", "fadiga", "seguidor_caro"]).gte("criado_em", iso(agora - 10 * DIA))
    .order("prioridade", { ascending: false, nullsFirst: false }).order("criado_em", { ascending: false }).limit(1);
  if (eSug) throw new Error("Não foi possível ler os sinais de anúncios");
  const s = (sug ?? [])[0] as { titulo: string; detalhe: string | null; campanha_id: string; tipo: string } | undefined;
  if (s) {
    const { data: gastos, error: eG } = await admin.from("meta_ads_daily").select("spend").eq("client_id", clientId).eq("campaign_id", s.campanha_id).gt("date", iso(agora - 7 * DIA).slice(0, 10));
    if (eG) throw new Error("Não foi possível ler o gasto da campanha");
    const gasto = Math.round(((gastos ?? []) as { spend: number | null }[]).reduce((a, r) => a + Number(r.spend ?? 0), 0));
    if (gasto > 0) novos.push({
      origem: "anuncio", titulo: s.titulo.slice(0, 200), porque: (s.detalhe ?? "").slice(0, 600),
      acao: "Revise a campanha com o gestor de tráfego e decida: pausar, trocar o criativo ou mudar o público. Nada muda sem aprovação.",
      onde: "/anuncios", n: 1, valor_brl: gasto, valor_calculo: `Gasto da campanha nos últimos 7 dias: R$ ${gasto} (dinheiro em risco se o problema continuar)`,
      refs: { campanha: s.campanha_id, tipo: s.tipo },
    });
  }

  // Conteúdo: tema mais pedido sem post recente.
  const { data: temas, error: eT } = await admin.from("conversas_tema").select("tema, comercial").eq("client_id", clientId).not("tema", "is", null).gte("gerado_em", iso(agora - 14 * DIA)).limit(5000);
  if (eT) throw new Error("Não foi possível ler os temas das conversas");
  const conta = new Map<string, number>();
  for (const t of (temas ?? []) as { tema: string; comercial: boolean | null }[]) if (t.comercial !== false) conta.set(t.tema, (conta.get(t.tema) ?? 0) + 1);
  const { data: postados, error: eP } = await admin.from("instagram_posts").select("tema").eq("client_id", clientId).is("removido_em", null).not("tema", "is", null).gte("posted_at", iso(agora - 21 * DIA));
  if (eP) throw new Error("Não foi possível ler os posts recentes");
  const recentes = new Set(((postados ?? []) as { tema: string }[]).map((p) => p.tema));
  const top = [...conta.entries()].filter(([t, n]) => n >= 3 && !recentes.has(t)).sort((a, b) => b[1] - a[1])[0];
  if (top) novos.push({
    origem: "conteudo", titulo: `Postar sobre "${top[0]}": ${top[1]} pacientes pediram e não teve post`,
    porque: "O conteúdo que responde ao que o paciente já está perguntando traz conversa mais pronta para agendar.",
    acao: "Peça o roteiro em Ideias (ou use uma estrutura da Inteligência Criativa) e publique esta semana.",
    onde: "/ideias", n: top[1], valor_brl: null, valor_calculo: `${top[1]} conversas nos últimos 14 dias pediram este tema`,
    refs: { tema: top[0], n: top[1] },
  });
  return ordenar(novos);
}

/** Confere as ações das últimas 3 semanas e, se ainda não houver, monta o plano desta semana. */
export async function atualizarPlano(admin: Admin, clientId: string): Promise<{ semana: string; criados: number; conferidos: number }> {
  const semana = semanaDe(new Date());
  const ticket = await ticketDe(admin, clientId);
  const { data: abertos, error } = await admin.from("plano_itens").select("id, client_id, semana, origem, estado, criado_em, refs, n, decidido_por")
    .eq("client_id", clientId).gte("semana", iso(Date.parse(semana) - 21 * DIA).slice(0, 10)).neq("estado", "descartada");
  if (error) throw new Error("Não foi possível ler o plano");
  for (const it of (abertos ?? []) as Item[]) await medirItem(admin, it, ticket, semana);
  const { error: eVenc } = await admin.from("plano_itens").update({ estado: "nao_feita" }).eq("client_id", clientId).lt("semana", semana).eq("estado", "proposta");
  if (eVenc) throw new Error("Não foi possível fechar a semana anterior");
  if (((abertos ?? []) as Item[]).some((i) => i.semana === semana)) return { semana, criados: 0, conferidos: abertos?.length ?? 0 };
  const novos = await candidatos(admin, clientId, semana, ticket);
  if (novos.length) {
    const { error: eIns } = await admin.from("plano_itens").upsert(novos.map((n, i) => ({ ...n, client_id: clientId, semana, ordem: i + 1 })), { onConflict: "client_id,semana,origem", ignoreDuplicates: true });
    if (eIns) throw new Error("Não foi possível gravar o plano");
  }
  return { semana, criados: novos.length, conferidos: abertos?.length ?? 0 };
}

/** Todas as clínicas com conversa ou anúncio no último mês (chamado pelo agendador). */
export async function atualizarPlanos(admin: Admin, orcamentoMs = 120_000): Promise<{ clinicas: number; criados: number; erros: string[] }> {
  const fim = Date.now() + orcamentoMs;
  const { data, error } = await admin.from("clients").select("id").eq("active", true);
  if (error) throw new Error("Não foi possível listar as clínicas");
  let clinicas = 0, criados = 0;
  const erros: string[] = [];
  for (const c of (data ?? []) as { id: string }[]) {
    if (Date.now() > fim) break;
    try { const r = await atualizarPlano(admin, c.id); clinicas++; criados += r.criados; }
    catch (e) { erros.push((e instanceof Error ? e.message : String(e)).slice(0, 120)); }
  }
  return { clinicas, criados, erros: [...new Set(erros)].slice(0, 5) };
}
