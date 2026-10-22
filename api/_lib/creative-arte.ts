/**
 * Gera a arte dos slides de uma adaptação da Inteligência Criativa (OpenAI gpt-image-1), como RASCUNHO para revisão.
 * Arquivo no bucket privado nexo-creative-private (pasta artes/), lido só por URL assinada que este servidor cria
 * depois de conferir a permissão. Custo em ia_execucoes (finalidade arte_criativa) com teto diário por clínica.
 * Nada é publicado nem enviado a ninguém.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { custoArte, reservaArte, promptArte, slidesPedidos, type UnidadeArte } from "../../src/lib/creative-intelligence/arte.js";
import { composeSlide, layoutSlide, type SlideLayout } from "./creative-compositor.js";

type Admin = SupabaseClient<any, any, any>;
const BUCKET = "nexo-creative-private";
const MODELO = process.env.ARTE_MODELO || "gpt-image-1";
const QUALIDADE: "low" | "medium" | "high" = (["low", "medium", "high"] as const).find((q) => q === process.env.ARTE_QUALIDADE) ?? "medium";
const PARALELO = 4;

interface Adaptacao { id: string; client_id: string; document: { theme: string; units: UnidadeArte[] } }

async function carregar(admin: Admin, clientId: string, adaptacaoId: string): Promise<Adaptacao> {
  const { data, error } = await admin.from("creative_adaptations").select("id, client_id, document").eq("id", adaptacaoId).eq("client_id", clientId).maybeSingle();
  if (error) throw new Error("Não foi possível ler a adaptação");
  if (!data) throw new Error("Adaptação não encontrada para esta clínica");
  return data as Adaptacao;
}

async function gerarUma(admin: Admin, a: Adaptacao, u: UnidadeArte, userId: string, reservaId: string, valorReservado: number, prompt: string, prazo: number, layout: SlideLayout): Promise<void> {
  const t0 = Date.now();
  let ok = false, erro: string | null = null;
  let custo = 0;
  try {
    if (prazo - Date.now() < 5000) throw new Error("Tempo desta solicitação encerrado. Solicite apenas os slides que faltaram.");
    // Timeout ou queda da conexão pode ocorrer depois de o provedor aceitar.
    // Mantém estimativa conservadora até existir uma rejeição explícita.
    custo = valorReservado;
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(Math.min(150_000, prazo - Date.now())),
      body: JSON.stringify({ model: MODELO, prompt, size: "1024x1536", quality: QUALIDADE, background: "opaque", output_format: "png", n: 1 }),
    });
    if (!r.ok) { if (r.status < 500) custo = 0; throw new Error(`O serviço de imagens recusou a solicitação (${r.status}). Tente novamente mais tarde.`); }
    const j = (await r.json()) as { data?: { b64_json?: string }[]; usage?: unknown };
    custo = custoArte(j.usage, valorReservado);
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error("A geração não devolveu imagem");
    const caminho = `artes/${a.client_id}/${a.id}/${u.position}-${Date.now()}.png`;
    const composed = composeSlide(u, a.document.units.length, Buffer.from(b64, "base64"), layout);
    const { error: erroUp } = await admin.storage.from(BUCKET).upload(caminho, composed, { contentType: "image/png", upsert: false });
    if (erroUp) throw new Error("Não foi possível guardar a arte");
    const { error: erroIns } = await admin.from("creative_artes").insert({ client_id: a.client_id, adaptation_id: a.id, position: u.position, storage_path: caminho, modelo: MODELO, qualidade: QUALIDADE, custo_usd: custo, criado_por: userId });
    if (erroIns) {
      const { error: limpeza } = await admin.storage.from(BUCKET).remove([caminho]);
      if (limpeza) console.error(JSON.stringify({ code: "CREATIVE_ART_STORAGE_CLEANUP_FAILED" }));
      throw new Error("A imagem foi gerada, mas não foi possível registrar a arte. A geração pode ter custo; confira com a equipe antes de repetir.");
    }
    ok = true;
  } catch (e) {
    erro = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    throw e;
  } finally {
    const { data, error } = await admin.rpc("creative_arte_finalizar", { p_reserva: reservaId, p_custo_usd: custo, p_modelo: MODELO, p_ok: ok, p_erro: erro, p_ms: Date.now() - t0 });
    if (error || data !== true) throw new Error("O registro do custo não foi confirmado. O orçamento permanece reservado; confira a arte e procure a equipe antes de repetir.");
  }
}

/** Gera a arte dos slides pedidos (ou de todos), respeitando o teto diário. Devolve quantas saíram e os erros. */
export async function gerarArtes(admin: Admin, clientId: string, adaptacaoId: string, userId: string, pedidos?: unknown): Promise<{ geradas: number; erros: string[] }> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Servidor sem OPENAI_API_KEY");
  if (MODELO !== "gpt-image-1") throw new Error("O custo do modelo de imagens configurado precisa ser validado pela equipe antes de gerar.");
  const a = await carregar(admin, clientId, adaptacaoId);
  const slides = slidesPedidos(a.document.units, pedidos);
  if (!slides.length) throw new Error("Nenhum slide válido para gerar.");
  const fila = slides.map((p) => a.document.units.find((u) => u.position === p)!);
  // Font availability, unsupported glyphs and overflow fail before reserving or spending.
  const layouts = fila.map(layoutSlide);
  const prompts = fila.map((u) => promptArte(u, { tema: a.document.theme, total: a.document.units.length }));
  const valorReservado = Math.max(...prompts.map((prompt) => reservaArte(prompt, QUALIDADE)));
  const { data: reservas, error: erroReserva } = await admin.rpc("creative_arte_reservar", { p_client_id: clientId, p_adaptation_id: adaptacaoId, p_positions: slides, p_valor_usd: valorReservado });
  if (erroReserva) throw new Error(erroReserva.code === "P0001" ? erroReserva.message : "Não foi possível reservar o orçamento de imagens. Nenhuma geração foi iniciada.");
  const porPosicao = new Map<number, string>(((reservas ?? []) as { id: string; position: number }[]).map((r) => [r.position, r.id]));
  if (fila.some((u) => !porPosicao.has(u.position))) throw new Error("A reserva dos slides não foi confirmada. Nenhuma geração foi iniciada.");
  const prazo = Date.now() + 230_000;
  let geradas = 0;
  const erros: string[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(PARALELO, fila.length) }, async () => {
    while (i < fila.length) {
      const indice = i++, u = fila[indice];
      try { await gerarUma(admin, a, u, userId, porPosicao.get(u.position)!, valorReservado, prompts[indice], prazo, layouts[indice]); geradas++; }
      catch (e) { erros.push(`Slide ${u.position}: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`); }
    }
  }));
  return { geradas, erros };
}

/** Última arte de cada slide, com URL assinada de 10 minutos. */
export async function listarArtes(admin: Admin, clientId: string, adaptacaoId: string): Promise<{ id: string; position: number; status: string; url: string; criado_em: string }[]> {
  const { data, error } = await admin.from("creative_artes").select("id, position, status, storage_path, criado_em").eq("client_id", clientId).eq("adaptation_id", adaptacaoId).neq("status", "descartada").order("criado_em", { ascending: false }).limit(200);
  if (error) throw new Error("Não foi possível listar as artes");
  const ultima = new Map<number, { id: string; position: number; status: string; storage_path: string; criado_em: string }>();
  for (const r of (data ?? []) as { id: string; position: number; status: string; storage_path: string; criado_em: string }[]) if (!ultima.has(r.position)) ultima.set(r.position, r);
  const linhas = [...ultima.values()].sort((x, y) => x.position - y.position);
  if (!linhas.length) return [];
  const { data: urls, error: erroUrl } = await admin.storage.from(BUCKET).createSignedUrls(linhas.map((l) => l.storage_path), 600);
  if (erroUrl || linhas.some((_l, k) => !urls?.[k]?.signedUrl)) throw new Error("Não foi possível abrir as artes. Tente carregar novamente.");
  return linhas.map((l, k) => ({ id: l.id, position: l.position, status: l.status, criado_em: l.criado_em, url: urls?.[k]?.signedUrl ?? "" }));
}

/** Revisão: aprovada (pode ir para produção depois da revisão médica) ou descartada. */
export async function revisarArte(admin: Admin, clientId: string, arteId: string, status: string, userId: string): Promise<void> {
  if (status !== "aprovada" && status !== "descartada") throw new Error("Status inválido");
  const { data, error } = await admin.from("creative_artes").update({ status, revisado_por: userId, revisado_em: new Date().toISOString() }).eq("id", arteId).eq("client_id", clientId).select("id").maybeSingle();
  if (error) throw new Error("Não foi possível salvar a revisão");
  if (!data) throw new Error("Arte não encontrada nesta clínica. A revisão não foi salva.");
}
