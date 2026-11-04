/**
 * Transcrição da fala dos Reels: os agentes passam a entender o ROTEIRO (gancho falado, estrutura, chamada), não só a
 * legenda. Pega o arquivo do vídeo pela Graph API da Meta (media_url, mesmo token do sync de Instagram), envia para a
 * transcrição da OpenAI e grava em instagram_posts.transcricao. Conteúdo público do próprio perfil; nada de paciente.
 * Roda junto da leitura das conversas (api/sync/wts.ts), poucos vídeos por vez, mais recentes primeiro.
 * Vídeo acima de 25 MB (limite da transcrição) fica marcado e não é tentado de novo.
 * O vídeo é pedido com o token da PRÓPRIA conta (instagram_account_secrets), como no resto do sync; o token do
 * ambiente é só a reserva. Antes só o do ambiente era usado e contas de outra Business Manager recebiam 400, marcado
 * como permanente (Dra. Fernanda Nunes: 0 de 70 Reels). Erro de token, permissão ou chave da transcrição é passageiro:
 * fica com transcricao_proxima_em (nova tentativa em 24 h), sem travar a fila dos outros vídeos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { META_GRAPH_URL } from "./meta-graph-versao.js";
import { semChave } from "./ia.js";

type Admin = SupabaseClient<any, any, any>;
const GRAPH = META_GRAPH_URL;
const MODELO = process.env.TRANSCRICAO_MODELO || "gpt-4o-mini-transcribe";
const LIMITE_BYTES = 25 * 1024 * 1024;
const USD_POR_MIN = 0.003;
const NOVA_TENTATIVA_MS = 24 * 3600_000;

/** Erro que não muda tentando de novo (o vídeo em si). O resto (token, permissão, chave, 5xx, 429) volta depois. */
export function erroPermanenteDeTranscricao(msg: string): boolean {
  return /sem arquivo|vídeo acima de|Origem do vídeo não permitida|post não existe mais|Graph respondeu (404|410)\b|transcrição respondeu (400|413|415)\b/.test(msg);
}

/** Mensagem do erro da Graph ao pedir o vídeo, separando "post não existe" (código 100/subcódigo 33) do resto. */
async function erroDaGraph(r: Response): Promise<string> {
  let codigo: number | undefined, sub: number | undefined;
  try { const e = (await r.json())?.error; codigo = e?.code; sub = e?.error_subcode; } catch { /* corpo inválido */ }
  if (codigo === 100 && sub === 33) return "post não existe mais na Meta";
  return `Graph respondeu ${r.status}${codigo != null ? ` (código ${codigo})` : ""} ao pedir o vídeo`;
}

async function transcreverUm(admin: Admin, token: string, chave: string, p: { id: string; client_id: string; windsor_media_id: string; reel_avg_watch_time_ms?: number | null }, fim: number): Promise<string | null> {
  const sinal = (limite: number) => { const restante = fim - Date.now(); if (restante <= 0) throw new Error("Tempo de transcrição esgotado"); return AbortSignal.timeout(Math.min(limite, restante)); };
  const meta = await fetch(`${GRAPH}/${encodeURIComponent(p.windsor_media_id)}?fields=media_url,media_type&access_token=${token}`, { signal: sinal(20_000), redirect: "error" });
  if (!meta.ok) throw new Error(await erroDaGraph(meta));
  const m = (await meta.json()) as { media_url?: string; media_type?: string };
  if (!m.media_url || m.media_type !== "VIDEO") throw new Error("sem arquivo de vídeo disponível");
  const videoUrl = new URL(m.media_url);
  if (videoUrl.protocol !== "https:" || videoUrl.port || videoUrl.username || videoUrl.password || !/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(videoUrl.hostname)) throw new Error("Origem do vídeo não permitida");
  const v = await fetch(videoUrl, { signal: sinal(60_000), redirect: "error" });
  if (!v.ok) throw new Error(`download do vídeo respondeu ${v.status}`);
  const tamanho = Number(v.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_BYTES) throw new Error("vídeo acima de 25 MB");
  const reader = v.body?.getReader();
  if (!reader) throw new Error("Download do vídeo vazio");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMITE_BYTES) throw new Error("vídeo acima de 25 MB");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { buf.set(chunk, offset); offset += chunk.byteLength; }
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "video/mp4" }), "reel.mp4");
  form.append("model", MODELO);
  form.append("language", "pt");
  form.append("response_format", "json");
  const t0 = Date.now();
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${chave}` }, body: form, signal: sinal(120_000), redirect: "error" });
  const corpo = await r.text();
  // Custo estimado pela duração (a resposta json não traz a duração; o tamanho médio de um reel de 1 min fica ~8 MB).
  const minutos = Math.max(0.25, buf.byteLength / (8 * 1024 * 1024));
  const { error: erroCusto } = await admin.from("ia_execucoes").insert({ client_id: p.client_id, finalidade: "transcricao_reels", modelo: MODELO, tokens_entrada: 0, tokens_saida: 0, custo_usd: Number((minutos * USD_POR_MIN).toFixed(5)), ok: r.ok, erro: r.ok ? null : semChave(corpo).slice(0, 300), ms: Date.now() - t0 });
  if (erroCusto) throw new Error("Não foi possível registrar o custo da transcrição");
  if (!r.ok) throw new Error(`transcrição respondeu ${r.status}`);
  const resposta: unknown = JSON.parse(corpo);
  if (!resposta || typeof resposta !== "object" || !("text" in resposta) || typeof resposta.text !== "string") throw new Error("Resposta de transcrição inválida");
  const texto = resposta.text.replace(/\s+/g, " ").trim();
  return texto || null;
}

export async function transcreverReels(admin: Admin, orcamentoMs = 90_000, maximo = 8, onlyClientId?: string): Promise<{ feitas: number; sem_fala: number; erros: string[] }> {
  const tokenGlobal = process.env.META_ACCESS_TOKEN, chave = process.env.OPENAI_API_KEY;
  if (!chave) return { feitas: 0, sem_fala: 0, erros: ["OPENAI_API_KEY ausente"] };
  const fim = Date.now() + orcamentoMs;
  const agoraIso = new Date().toISOString();
  let consulta = admin.from("instagram_posts").select("id, client_id, instagram_account_id, windsor_media_id").eq("format", "reels").is("transcricao_em", null)
    .is("removido_em", null).or(`transcricao_proxima_em.is.null,transcricao_proxima_em.lte.${agoraIso}`)
    .not("windsor_media_id", "is", null).gte("posted_at", new Date(Date.now() - 180 * 86_400_000).toISOString()).order("posted_at", { ascending: false }).limit(maximo);
  if (onlyClientId) consulta = consulta.eq("client_id", onlyClientId);
  const { data, error: erroLista } = await consulta;
  if (erroLista) throw new Error("Não foi possível listar os Reels para transcrição");
  const lista = (data ?? []) as { id: string; client_id: string; instagram_account_id: string | null; windsor_media_id: string }[];
  // Token por conta; o do ambiente é a reserva (mesma regra do sync de posts e de comentários).
  const tokens = new Map<string, string>();
  const contas = [...new Set(lista.map((p) => p.instagram_account_id).filter((x): x is string => !!x))];
  if (contas.length) {
    const { data: segredos, error: erroSegredos } = await admin.from("instagram_account_secrets").select("instagram_account_id, meta_access_token").in("instagram_account_id", contas);
    if (erroSegredos) throw new Error("Não foi possível carregar os tokens das contas para a transcrição");
    for (const s of (segredos ?? []) as { instagram_account_id: string; meta_access_token: string | null }[]) if (s.meta_access_token) tokens.set(s.instagram_account_id, s.meta_access_token);
  }
  let feitas = 0, sem_fala = 0;
  const erros: string[] = [];
  for (const p of lista) {
    if (Date.now() > fim) break;
    const token = (p.instagram_account_id && tokens.get(p.instagram_account_id)) || tokenGlobal;
    if (!token) { erros.push("Sem token da Meta para a conta do Reel"); continue; }
    try {
      const texto = await transcreverUm(admin, token, chave, p, fim);
      const { error: erroSalvar } = await admin.from("instagram_posts").update({ transcricao: texto, transcricao_em: new Date().toISOString(), transcricao_erro: texto ? null : "sem fala", transcricao_proxima_em: null }).eq("client_id", p.client_id).eq("id", p.id);
      if (erroSalvar) throw new Error("Não foi possível persistir a transcrição");
      if (texto) feitas++; else sem_fala++;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      // Erro do vídeo (sem arquivo, grande demais, post apagado) marca para não tentar de novo.
      // Erro passageiro (token, permissão, chave da transcrição, 5xx, 429) volta em 24 h, sem travar a fila.
      const permanente = erroPermanenteDeTranscricao(msg);
      // Tempo da rodada esgotado ou falha do próprio banco: não é problema do vídeo, nada é marcado.
      const naoMarca = /Tempo de transcrição esgotado|Não foi possível (persistir|registrar)/.test(msg);
      if (!naoMarca) {
        const patch = permanente
          ? { transcricao_em: new Date().toISOString(), transcricao_erro: msg, transcricao_proxima_em: null }
          : { transcricao_erro: msg, transcricao_proxima_em: new Date(Date.now() + NOVA_TENTATIVA_MS).toISOString() };
        const { error: erroSalvar } = await admin.from("instagram_posts").update(patch).eq("client_id", p.client_id).eq("id", p.id);
        if (erroSalvar) erros.push("Não foi possível registrar o erro do vídeo");
      }
      erros.push(msg);
    }
  }
  return { feitas, sem_fala, erros: erros.slice(0, 5) };
}
