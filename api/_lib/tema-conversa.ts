/**
 * Leitura do lado do paciente em TODAS as conversas (WTS, Digisac, FlwChat e Kommo): tema (do vocabulário de posts da
 * clínica), assunto, intenção, pedido de preço e objeções. Grava em conversas_tema, separada de conversas_resumos para
 * não mexer na auditoria do atendimento. Lotes de 15 conversas por chamada (modelo barato), texto do paciente mascarado,
 * cada conversa registrada em acessos_conversas (acao = 'tema_ia_automatico') ANTES do envio ao provedor de IA.
 * Roda junto da leitura das conversas (api/sync/wts.ts, so_analisar). Conversa sem texto do paciente fica marcada
 * (sem_texto) para não ser buscada de novo; volta para a fila quando chega mensagem nova.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chamarIAJson, iaDisponivel } from "./ia.js";
import { SISTEMA_TEMA, lerRespostaTema, montarEntradaTema } from "../../src/lib/tema-conversa.js";

type Admin = SupabaseClient<any, any, any>;
const LOTE = 15;
const DIAS = 60;
const PARALELO = 3;

async function temasDoCliente(admin: Admin, clientId: string): Promise<string[]> {
  const { data, error } = await admin.from("instagram_posts").select("tema").eq("client_id", clientId).not("tema", "is", null)
    .gte("posted_at", new Date(Date.now() - 365 * 86_400_000).toISOString()).order("posted_at", { ascending: false }).limit(2000);
  if (error) throw new Error("Não foi possível ler os temas dos posts");
  const conta = new Map<string, number>();
  for (const r of (data ?? []) as { tema: string }[]) { const t = r.tema.trim(); if (t) conta.set(t, (conta.get(t) ?? 0) + 1); }
  return [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => t);
}

async function pendentesDoCliente(admin: Admin, clientId: string, maximo: number): Promise<{ id: string; ultima_msg_em: string }[]> {
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();
  const convs: { id: string; ultima_msg_em: string }[] = [];
  for (let de = 0; de < 6000; de += 1000) {
    const { data, error } = await admin.from("conversas").select("id, ultima_msg_em").eq("client_id", clientId).gte("ultima_msg_em", desde)
      .order("ultima_msg_em", { ascending: false }).range(de, de + 999);
    if (error) throw new Error("Não foi possível listar as conversas");
    convs.push(...((data ?? []) as { id: string; ultima_msg_em: string }[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  const feitos = new Map<string, string | null>();
  for (let i = 0; i < convs.length; i += 200) {
    const { data, error } = await admin.from("conversas_tema").select("conversa_id, ate_msg_em").in("conversa_id", convs.slice(i, i + 200).map((c) => c.id));
    if (error) throw new Error("Não foi possível ler os temas já gravados");
    for (const r of (data ?? []) as { conversa_id: string; ate_msg_em: string | null }[]) feitos.set(r.conversa_id, r.ate_msg_em);
  }
  return convs.filter((c) => { const ate = feitos.get(c.id); return ate === undefined || ate == null || c.ultima_msg_em > ate; }).slice(0, maximo);
}

async function lerLote(admin: Admin, clientId: string, temas: string[], lote: { id: string; ultima_msg_em: string }[]): Promise<number> {
  const textos = await Promise.all(lote.map(async (c) => {
    const { data, error } = await admin.from("mensagens").select("texto").eq("conversa_id", c.id).eq("direcao", "entrada").not("texto", "is", null)
      .order("enviada_em", { ascending: true }).limit(12);
    if (error) throw new Error("Não foi possível ler as mensagens");
    return ((data ?? []) as { texto: string }[]).map((m) => m.texto).filter((t) => t.trim().length > 0);
  }));
  const agora = new Date().toISOString();
  const comTexto = lote.map((c, k) => ({ c, msgs: textos[k], i: k + 1 })).filter((x) => x.msgs.length > 0);
  const semTexto = lote.filter((_, k) => textos[k].length === 0);
  if (semTexto.length) {
    const { error } = await admin.from("conversas_tema").upsert(semTexto.map((c) => ({ conversa_id: c.id, client_id: clientId, sem_texto: true, tema: null, assunto: null, intencao: null, comercial: null, preco_pedido: null, objecoes: [], ate_msg_em: c.ultima_msg_em, gerado_em: agora, modelo: null })), { onConflict: "conversa_id" });
    if (error) throw new Error("Não foi possível gravar conversas sem texto");
  }
  if (comTexto.length === 0) return 0;
  // Registro obrigatório antes de enviar o conteúdo ao provedor de IA.
  const { error: erroAcesso } = await admin.from("acessos_conversas").insert(comTexto.map((x) => ({ user_id: null, client_id: clientId, conversa_id: x.c.id, acao: "tema_ia_automatico" })));
  if (erroAcesso) throw new Error("Não foi possível registrar o acesso às conversas");
  const resposta = await chamarIAJson(admin, {
    sistema: SISTEMA_TEMA,
    entrada: montarEntradaTema(temas, comTexto.map((x) => ({ i: x.i, mensagens: x.msgs }))),
    finalidade: "tema_conversa",
    clientId,
    maxTokens: 2000,
  });
  const itens = lerRespostaTema(resposta.json, temas, comTexto.map((x) => x.i));
  const porIndice = new Map(comTexto.map((x) => [x.i, x.c]));
  const linhas = itens.map((t) => {
    const c = porIndice.get(t.i)!;
    return { conversa_id: c.id, client_id: clientId, sem_texto: false, tema: t.tema, assunto: t.assunto, intencao: t.intencao, comercial: t.comercial, preco_pedido: t.preco_pedido, objecoes: t.objecoes, ate_msg_em: c.ultima_msg_em, gerado_em: agora, modelo: resposta.modelo };
  });
  if (linhas.length) {
    const { error } = await admin.from("conversas_tema").upsert(linhas, { onConflict: "conversa_id" });
    if (error) throw new Error("Não foi possível gravar os temas das conversas");
  }
  return linhas.length;
}

/** Percorre os clientes (começando por um diferente a cada rodada, para nenhum ficar sempre por último) até o orçamento. */
export async function classificarTemasConversas(admin: Admin, clientes: string[], orcamentoMs = 120_000): Promise<{ lidas: number; pendentes: Record<string, number>; erros: string[] }> {
  if (!iaDisponivel()) return { lidas: 0, pendentes: {}, erros: ["Servidor sem chave de IA"] };
  const fim = Date.now() + orcamentoMs;
  const erros: string[] = [];
  const pendentes: Record<string, number> = {};
  let lidas = 0;
  const n = clientes.length;
  const ini = n ? Math.floor(Date.now() / 1_200_000) % n : 0;
  for (let k = 0; k < n && fim - Date.now() > 20_000; k++) {
    const clientId = clientes[(ini + k) % n];
    try {
      const temas = await temasDoCliente(admin, clientId);
      const fila = await pendentesDoCliente(admin, clientId, 1500);
      const lotes: { id: string; ultima_msg_em: string }[][] = [];
      for (let i = 0; i < fila.length; i += LOTE) lotes.push(fila.slice(i, i + LOTE));
      let cursor = 0, feitos = 0;
      const trabalhador = async () => {
        while (cursor < lotes.length && fim - Date.now() > 20_000) {
          const lote = lotes[cursor++];
          try { lidas += await lerLote(admin, clientId, temas, lote); feitos += lote.length; }
          catch (e) {
            const msg = (e instanceof Error ? e.message : String(e)).slice(0, 160);
            erros.push(msg);
            if (/respondeu 4\d\d|registrar/.test(msg)) { cursor = lotes.length; } // chave recusada ou falha de registro: não insiste
          }
        }
      };
      await Promise.all(Array.from({ length: PARALELO }, trabalhador));
      pendentes[clientId] = fila.length - feitos;
    } catch (e) {
      erros.push((e instanceof Error ? e.message : String(e)).slice(0, 160));
    }
  }
  return { lidas, pendentes, erros: [...new Set(erros)].slice(0, 5) };
}
