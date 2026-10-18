/**
 * Transcrição da fala dos Reels: os agentes passam a entender o ROTEIRO (gancho falado, estrutura, chamada), não só a
 * legenda. Pega o arquivo do vídeo pela Graph API da Meta (media_url, mesmo token do sync de Instagram), envia para a
 * transcrição da OpenAI e grava em instagram_posts.transcricao. Conteúdo público do próprio perfil; nada de paciente.
 * Roda junto da leitura das conversas (api/sync/wts.ts), poucos vídeos por vez, mais recentes primeiro.
 * Vídeo acima de 25 MB (limite da transcrição) fica marcado e não é tentado de novo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient<any, any, any>;
const GRAPH = "https://graph.facebook.com/v21.0";
const MODELO = process.env.TRANSCRICAO_MODELO || "gpt-4o-mini-transcribe";
const LIMITE_BYTES = 25 * 1024 * 1024;
const USD_POR_MIN = 0.003;

async function transcreverUm(admin: Admin, token: string, chave: string, p: { id: string; client_id: string; windsor_media_id: string; reel_avg_watch_time_ms?: number | null }): Promise<string | null> {
  const meta = await fetch(`${GRAPH}/${p.windsor_media_id}?fields=media_url,media_type&access_token=${token}`, { signal: AbortSignal.timeout(20_000) });
  if (!meta.ok) throw new Error(`Graph respondeu ${meta.status} ao pedir o vídeo`);
  const m = (await meta.json()) as { media_url?: string; media_type?: string };
  if (!m.media_url || m.media_type !== "VIDEO") throw new Error("sem arquivo de vídeo disponível");
  const v = await fetch(m.media_url, { signal: AbortSignal.timeout(60_000) });
  if (!v.ok) throw new Error(`download do vídeo respondeu ${v.status}`);
  const tamanho = Number(v.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_BYTES) throw new Error("vídeo acima de 25 MB");
  const buf = await v.arrayBuffer();
  if (buf.byteLength > LIMITE_BYTES) throw new Error("vídeo acima de 25 MB");
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "video/mp4" }), "reel.mp4");
  form.append("model", MODELO);
  form.append("language", "pt");
  form.append("response_format", "json");
  const t0 = Date.now();
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${chave}` }, body: form, signal: AbortSignal.timeout(120_000) });
  const corpo = await r.text();
  // Custo estimado pela duração (a resposta json não traz a duração; o tamanho médio de um reel de 1 min fica ~8 MB).
  const minutos = Math.max(0.25, buf.byteLength / (8 * 1024 * 1024));
  await admin.from("ia_execucoes").insert({ client_id: p.client_id, finalidade: "transcricao_reels", modelo: MODELO, tokens_entrada: 0, tokens_saida: 0, custo_usd: Number((minutos * USD_POR_MIN).toFixed(5)), ok: r.ok, erro: r.ok ? null : corpo.slice(0, 300), ms: Date.now() - t0 });
  if (!r.ok) throw new Error(`transcrição respondeu ${r.status}: ${corpo.slice(0, 160)}`);
  const texto = String((JSON.parse(corpo) as { text?: string }).text ?? "").replace(/\s+/g, " ").trim();
  return texto || null;
}

export async function transcreverReels(admin: Admin, orcamentoMs = 90_000, maximo = 8): Promise<{ feitas: number; sem_fala: number; erros: string[] }> {
  const token = process.env.META_ACCESS_TOKEN, chave = process.env.OPENAI_API_KEY;
  if (!token || !chave) return { feitas: 0, sem_fala: 0, erros: ["META_ACCESS_TOKEN ou OPENAI_API_KEY ausente"] };
  const fim = Date.now() + orcamentoMs;
  const { data } = await admin.from("instagram_posts").select("id, client_id, windsor_media_id").eq("format", "reels").is("transcricao_em", null)
    .not("windsor_media_id", "is", null).gte("posted_at", new Date(Date.now() - 180 * 86_400_000).toISOString()).order("posted_at", { ascending: false }).limit(maximo);
  let feitas = 0, sem_fala = 0;
  const erros: string[] = [];
  for (const p of (data ?? []) as { id: string; client_id: string; windsor_media_id: string }[]) {
    if (Date.now() > fim) break;
    try {
      const texto = await transcreverUm(admin, token, chave, p);
      await admin.from("instagram_posts").update({ transcricao: texto, transcricao_em: new Date().toISOString(), transcricao_erro: texto ? null : "sem fala" }).eq("id", p.id);
      if (texto) feitas++; else sem_fala++;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      // Erro do vídeo (sem arquivo, grande demais, sem permissão) marca para não tentar de novo a cada 20 min.
      // Erro passageiro da transcrição (5xx, 429) fica para a próxima rodada.
      const passageiro = /respondeu (429|5\d\d)/.test(msg) || /timeout|aborted/i.test(msg);
      if (!passageiro) await admin.from("instagram_posts").update({ transcricao_em: new Date().toISOString(), transcricao_erro: msg }).eq("id", p.id);
      erros.push(msg);
    }
  }
  return { feitas, sem_fala, erros: erros.slice(0, 5) };
}
