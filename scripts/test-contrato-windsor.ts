// Contrato da API REST da Windsor.ai (conectores facebook e instagram). Doc: docs/apis/windsor.md.
// Ao vivo: CONTRATO_AO_VIVO=1 CONTRATO_WINDSOR_KEY=... CONTRATO_WINDSOR_CONTA_ANUNCIO=<id> [CONTRATO_WINDSOR_CONTA_IG=<id>] npx tsx scripts/test-contrato-windsor.ts
// A chave vai na query (api_key): o script nunca imprime a URL.
import assert from "node:assert/strict";
import { campos, rodarContrato } from "./contrato/comum";
import { juntarDestino } from "../api/_lib/meta-ads-sync";
import { normalizeFormat, numOrNull } from "../api/_lib/instagram-sync";

const HOSTS = /^connectors\.windsor\.ai$/;
const ANUNCIOS = ["date", "campaign_id", "campaign", "objective", "spend", "impressions", "reach", "clicks", "unique_clicks", "frequency", "actions_link_click", "actions_landing_page_view", "actions_lead", "actions_onsite_conversion_messaging_conversation_started_7d", "effective_instagram_media_id", "effective_instagram_media__permalink", "effective_instagram_media__thumbnail_url", "adset_destination_type"];
const POSTS = ["media_id", "media_type", "media_product_type", "media_permalink", "media_thumbnail_url", "media_url", "media_caption", "timestamp", "media_reach", "media_saved", "media_like_count", "media_comments_count", "media_shares", "media_engagement", "media_views", "media_reel_skip_rate", "media_reel_avg_watch_time", "media_reel_total_watch_time", "media_profile_visits", "media_follows"];
const DIA = ["date", "followers_count", "follower_count_1d", "follows_and_unfollows", "reach_1d", "likes", "comments", "saves", "shares", "total_interactions", "profile_links_taps"];
const NUM = "number|null";
const ontem = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

function pedido(env: NodeJS.ProcessEnv, conector: "facebook" | "instagram", conta: string | undefined, fields: string[]) {
  if (!env.CONTRATO_WINDSOR_KEY || !conta) return null;
  const q = new URLSearchParams({ api_key: env.CONTRATO_WINDSOR_KEY, date_from: ontem(4), date_to: ontem(2), fields: ["account_id", ...fields].join(","), filter: JSON.stringify([["account_id", "eq", conta]]), _max_rows: "20" });
  return { url: `https://connectors.windsor.ai/${conector}?${q}` };
}
// Conta que a Windsor não enxerga volta 200 com lista vazia, sem erro: o aviso deixa isso visível.
const vazio = (corpo: unknown) => (Array.isArray((corpo as any)?.data) && (corpo as any).data.length === 0 ? ["lista vazia: conta sem dado ou fora da Windsor (a API não diz qual)"] : []);

await rodarContrato({
  api: "windsor",
  variaveis: ["CONTRATO_WINDSOR_KEY", "CONTRATO_WINDSOR_CONTA_ANUNCIO", "CONTRATO_WINDSOR_CONTA_IG"],
  endpoints: [
    {
      nome: "anuncios",
      hosts: HOSTS,
      avisos: vazio,
      campos: campos([
        "data: array",
        "data[].date: string",
        "data[].campaign_id: string",
        "data[].campaign: string",
        "data[].objective?: string|null",
        `data[].spend: ${NUM}`,
        `data[].impressions: ${NUM}`,
        `data[].reach: ${NUM}`,
        `data[].clicks: ${NUM}`,
        `data[].unique_clicks?: ${NUM}`,
        `data[].frequency?: ${NUM}`,
        `data[].actions_link_click?: ${NUM}`,
        `data[].actions_landing_page_view?: ${NUM}`,
        `data[].actions_lead?: ${NUM}`,
        `data[].actions_onsite_conversion_messaging_conversation_started_7d?: ${NUM}`,
        "data[].effective_instagram_media_id?: string|null",
        "data[].effective_instagram_media__permalink?: string|null",
        "data[].adset_destination_type?: string|null",
      ]),
      aoVivo: (env) => pedido(env, "facebook", env.CONTRATO_WINDSOR_CONTA_ANUNCIO, ANUNCIOS),
    },
    {
      nome: "instagram_posts",
      hosts: HOSTS,
      avisos: vazio,
      campos: campos([
        "data: array",
        "data[].media_id: string",
        "data[].media_type: string",
        "data[].media_product_type?: string|null",
        "data[].media_permalink: string",
        "data[].timestamp: string",
        `data[].media_reach: ${NUM}`,
        `data[].media_views?: ${NUM}`,
        `data[].media_saved?: ${NUM}`,
        `data[].media_like_count?: ${NUM}`,
      ]),
      aoVivo: (env) => pedido(env, "instagram", env.CONTRATO_WINDSOR_CONTA_IG, POSTS),
    },
    {
      // Várias linhas por data (tabelas diferentes da Windsor); o código junta por data.
      nome: "instagram_dia",
      hosts: HOSTS,
      avisos: vazio,
      campos: campos(["data: array", "data[].date: string", `data[].followers_count?: ${NUM}`, `data[].follower_count_1d?: ${NUM}`, `data[].follows_and_unfollows?: ${NUM}`, `data[].reach_1d?: ${NUM}`, `data[].total_interactions?: ${NUM}`]),
      aoVivo: (env) => pedido(env, "instagram", env.CONTRATO_WINDSOR_CONTA_IG, DIA),
    },
  ],
  normalizadores: (f: any) => {
    const [a, b] = f.anuncios.data;
    // Destino por campanha: junta sem repetir, linha sem destino não apaga o que já havia.
    let d = juntarDestino(null, a.adset_destination_type);
    d = juntarDestino(d, b.adset_destination_type);
    d = juntarDestino(d, a.adset_destination_type);
    assert.deepEqual(d, ["WHATSAPP", "INSTAGRAM_DIRECT"]);
    assert.deepEqual(juntarDestino(d, null), d);
    assert.equal(numOrNull(b.frequency), null, "frequência ausente fica nula, não zero");
    assert.deepEqual(f.instagram_posts.data.map((p: any) => normalizeFormat(p.media_type, p.media_product_type)), ["reels", "carrossel"]);
    // Dia: só uma das linhas traz followers_count; as outras vêm nulas (o código não grava nulo por cima).
    assert.equal(f.instagram_dia.data.filter((r: any) => numOrNull(r.followers_count) !== null).length, 1);
  },
});
