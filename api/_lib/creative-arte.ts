/**
 * Gera a arte dos slides de uma adaptação da Inteligência Criativa (OpenAI gpt-image-1), como RASCUNHO para revisão.
 * Arquivo no bucket privado nexo-creative-private (pasta artes/), lido só por URL assinada que este servidor cria
 * depois de conferir a permissão. Custo em ia_execucoes (finalidade arte_criativa) com teto diário por clínica.
 * Nada é publicado nem enviado a ninguém.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CUSTO_ARTE, TETO_DIARIO_ARTE_USD, promptArte, slidesPedidos, type UnidadeArte } from "../../src/lib/creative-intelligence/arte.js";

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

async function gastoHoje(admin: Admin, clientId: string): Promise<number> {
  const inicio = new Date(); inicio.setUTCHours(0, 0, 0, 0);
  const { data, error } = await admin.from("ia_execucoes").select("custo_usd").eq("client_id", clientId).eq("finalidade", "arte_criativa").gte("criado_em", inicio.toISOString());
  if (error) throw new Error("Não foi possível conferir o orçamento de artes");
  return ((data ?? []) as { custo_usd: number | null }[]).reduce((s, r) => s + Number(r.custo_usd ?? 0), 0);
}

async function gerarUma(admin: Admin, a: Adaptacao, u: UnidadeArte, userId: string): Promise<void> {
  const t0 = Date.now();
  let ok = false, erro: string | null = null;
  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(150_000),
      body: JSON.stringify({ model: MODELO, prompt: promptArte(u, { tema: a.document.theme, total: a.document.units.length }), size: "1024x1536", quality: QUALIDADE, n: 1 }),
    });
    if (!r.ok) throw new Error(`OpenAI respondeu ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
    const j = (await r.json()) as { data?: { b64_json?: string }[] };
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error("A geração não devolveu imagem");
    const caminho = `artes/${a.client_id}/${a.id}/${u.position}-${Date.now()}.png`;
    const { error: erroUp } = await admin.storage.from(BUCKET).upload(caminho, Buffer.from(b64, "base64"), { contentType: "image/png", upsert: false });
    if (erroUp) throw new Error("Não foi possível guardar a arte");
    const { error: erroIns } = await admin.from("creative_artes").insert({ client_id: a.client_id, adaptation_id: a.id, position: u.position, storage_path: caminho, modelo: MODELO, qualidade: QUALIDADE, custo_usd: CUSTO_ARTE[QUALIDADE], criado_por: userId });
    if (erroIns) throw new Error("Não foi possível registrar a arte");
    ok = true;
  } catch (e) {
    erro = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    throw e;
  } finally {
    await admin.from("ia_execucoes").insert({ client_id: a.client_id, finalidade: "arte_criativa", modelo: MODELO, tokens_entrada: 0, tokens_saida: 0, custo_usd: ok ? CUSTO_ARTE[QUALIDADE] : 0, ok, erro, ms: Date.now() - t0 });
  }
}

/** Gera a arte dos slides pedidos (ou de todos), respeitando o teto diário. Devolve quantas saíram e os erros. */
export async function gerarArtes(admin: Admin, clientId: string, adaptacaoId: string, userId: string, pedidos?: unknown): Promise<{ geradas: number; erros: string[] }> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Servidor sem OPENAI_API_KEY");
  const a = await carregar(admin, clientId, adaptacaoId);
  const slides = slidesPedidos(a.document.units, pedidos);
  const previsto = slides.length * CUSTO_ARTE[QUALIDADE];
  const gasto = await gastoHoje(admin, clientId);
  if (gasto + previsto > TETO_DIARIO_ARTE_USD) throw new Error(`Teto diário de artes atingido (US$ ${gasto.toFixed(2)} de US$ ${TETO_DIARIO_ARTE_USD} hoje)`);
  const fila = slides.map((p) => a.document.units.find((u) => u.position === p)!);
  let geradas = 0;
  const erros: string[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(PARALELO, fila.length) }, async () => {
    while (i < fila.length) {
      const u = fila[i++];
      try { await gerarUma(admin, a, u, userId); geradas++; }
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
  if (erroUrl) throw new Error("Não foi possível abrir as artes");
  return linhas.map((l, k) => ({ id: l.id, position: l.position, status: l.status, criado_em: l.criado_em, url: urls?.[k]?.signedUrl ?? "" }));
}

/** Revisão: aprovada (pode ir para produção depois da revisão médica) ou descartada. */
export async function revisarArte(admin: Admin, clientId: string, arteId: string, status: string, userId: string): Promise<void> {
  if (status !== "aprovada" && status !== "descartada") throw new Error("Status inválido");
  const { error } = await admin.from("creative_artes").update({ status, revisado_por: userId, revisado_em: new Date().toISOString() }).eq("id", arteId).eq("client_id", clientId);
  if (error) throw new Error("Não foi possível salvar a revisão");
}
