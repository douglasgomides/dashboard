// Contrato da Meta Graph API (Instagram). Doc: docs/apis/meta-graph-instagram.md.
// Ao vivo: CONTRATO_AO_VIVO=1 CONTRATO_META_TOKEN=... CONTRATO_META_IG_ID=... npx tsx scripts/test-contrato-meta-graph-instagram.ts
import assert from "node:assert/strict";
import { campos, rodarContrato } from "./contrato/comum";
import { normalizeFormat, numOrNull } from "../api/_lib/instagram-sync";
import { META_GRAPH_URL, META_GRAPH_VERSAO } from "../api/_lib/meta-graph-versao";

const HOSTS = /^graph\.facebook\.com$/;
const auth = (env: NodeJS.ProcessEnv) => ({ Authorization: `Bearer ${env.CONTRATO_META_TOKEN}` });
const pronto = (env: NodeJS.ProcessEnv) => !!env.CONTRATO_META_TOKEN && /^\d+$/.test(env.CONTRATO_META_IG_ID ?? "");
// Um dia já fechado na Califórnia (a Meta fecha o dia lá e leva ~2 dias): 4 dias atrás, janela de 24 h.
const diaFechado = () => {
  const fim = Math.floor(Date.now() / 1000 / 86400 - 3) * 86400;
  return { since: fim - 86400, until: fim };
};

await rodarContrato({
  api: "meta-graph-instagram",
  variaveis: ["CONTRATO_META_TOKEN", "CONTRATO_META_IG_ID"],
  endpoints: [
    {
      nome: "media",
      hosts: HOSTS,
      cabecalhos: ["facebook-api-version"],
      campos: campos([
        "data[].id: string",
        "data[].timestamp: string",
        "data[].media_type: string",
        "data[].media_product_type: string",
        "data[].permalink: string",
        "data[].caption?: string",
        "data[].media_url?: string",
        "data[].thumbnail_url?: string",
        "paging.cursors.after?: string",
        "paging.next?: string",
      ]),
      aoVivo: (env) => pronto(env)
        ? { url: `${META_GRAPH_URL}/${env.CONTRATO_META_IG_ID}/media?fields=id,caption,timestamp,media_type,media_product_type,permalink,thumbnail_url,media_url&limit=5`, headers: auth(env) }
        : null,
    },
    {
      // POST em lote no código; ao vivo não faz POST: o corpo de cada item é o mesmo de insights_post.
      nome: "insights_lote",
      campos: campos(["[].code: number", "[].body: string"]),
    },
    {
      nome: "insights_post",
      hosts: HOSTS,
      campos: campos(["data[].name: string", "data[].values[].value: number"]),
      aoVivo: (env, ant) => {
        if (!pronto(env)) return null;
        const id = (ant.media as { data?: { id?: string }[] } | undefined)?.data?.[0]?.id;
        if (!id) return "sem post de exemplo na leitura de media";
        return { url: `${META_GRAPH_URL}/${id}/insights?metric=reach,likes,comments,shares,saved,views,total_interactions`, headers: auth(env) };
      },
    },
    {
      nome: "conta_dia",
      hosts: HOSTS,
      campos: campos(["data[].name: string", "data[].total_value.value: number"]),
      aoVivo: (env) => {
        if (!pronto(env)) return null;
        const { since, until } = diaFechado();
        return { url: `${META_GRAPH_URL}/${env.CONTRATO_META_IG_ID}/insights?metric=reach,total_interactions,likes,comments,saves,shares,profile_links_taps&period=day&metric_type=total_value&since=${since}&until=${until}`, headers: auth(env) };
      },
    },
    {
      nome: "seguidores_dia",
      hosts: HOSTS,
      campos: campos([
        "data[].name: string",
        "data[].total_value.breakdowns[].results[].dimension_values[]: string",
        "data[].total_value.breakdowns[].results[].value: number",
      ]),
      avisos: (corpo) => {
        const valores = new Set<string>();
        for (const d of (corpo as any)?.data ?? []) for (const b of d?.total_value?.breakdowns ?? []) for (const r of b?.results ?? []) for (const v of r?.dimension_values ?? []) valores.add(String(v));
        const fora = [...valores].filter((v) => !["FOLLOWER", "NON_FOLLOWER", "UNKNOWN"].includes(v));
        return fora.length ? [`follow_type com valor novo: ${fora.join(", ")}`] : [];
      },
      aoVivo: (env) => {
        if (!pronto(env)) return null;
        const { since, until } = diaFechado();
        return { url: `${META_GRAPH_URL}/${env.CONTRATO_META_IG_ID}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=${since}&until=${until}`, headers: auth(env) };
      },
    },
    {
      nome: "perfil",
      hosts: HOSTS,
      campos: campos(["followers_count: number", "id: string"]),
      aoVivo: (env) => (pronto(env) ? { url: `${META_GRAPH_URL}/${env.CONTRATO_META_IG_ID}?fields=followers_count`, headers: auth(env) } : null),
    },
  ],
  normalizadores: (f: any) => {
    assert.match(META_GRAPH_VERSAO, /^v\d+\.0$/, "versão da Graph no formato vNN.0");
    // Cada mídia da amostra precisa virar um formato conhecido (senão o post some dos filtros por formato).
    assert.deepEqual(f.media.data.map((m: any) => normalizeFormat(m.media_type, m.media_product_type)), ["reels", "carrossel", "estatico"]);
    // Lote: item 200 traz o JSON em texto; o valor é lido de values[0].value (meta-graph-sync.ts, fetchInsightsBatch).
    const ok = JSON.parse(f.insights_lote[0].body);
    assert.equal(numOrNull(ok.data[0].values[0].value), 1200);
    // Item com erro 2108006 é "nunca medido", não falha do sync.
    assert.equal(JSON.parse(f.insights_lote[1].body).error.error_subcode, 2108006);
    // Métricas que o código pede no post: todas na amostra, com número.
    const nomes = f.insights_post.data.map((d: any) => d.name);
    for (const m of ["reach", "likes", "comments", "shares", "saved", "views", "total_interactions"]) assert.ok(nomes.includes(m), `métrica ${m}`);
    // Seguidores: FOLLOWER = seguiu, NON_FOLLOWER = deixou de seguir (leitura do código; significado não confirmado na doc).
    const res = f.seguidores_dia.data[0].total_value.breakdowns[0].results;
    const v = (k: string) => Number(res.find((x: any) => x.dimension_values?.[0] === k)?.value ?? 0);
    assert.deepEqual({ novos: v("FOLLOWER"), saidas: v("NON_FOLLOWER") }, { novos: 40, saidas: 7 });
    assert.equal(numOrNull(f.perfil.followers_count), 12000);
  },
});
