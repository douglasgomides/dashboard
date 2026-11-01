// Contrato da API do Short.io (links e estatísticas). Doc: docs/apis/shortio.md.
// Ao vivo: CONTRATO_AO_VIVO=1 CONTRATO_SHORTIO_KEY=... npx tsx scripts/test-contrato-shortio.ts
import assert from "node:assert/strict";
import { campos, rodarContrato } from "./contrato/comum";
import { atribuir } from "../api/_lib/shortio-sync";

const HOSTS = /^api(-v2)?\.short\.io$/;
const auth = (env: NodeJS.ProcessEnv) => (env.CONTRATO_SHORTIO_KEY ? { authorization: env.CONTRATO_SHORTIO_KEY, accept: "application/json" } : null);

await rodarContrato({
  api: "shortio",
  variaveis: ["CONTRATO_SHORTIO_KEY"],
  endpoints: [
    {
      nome: "dominios",
      hosts: HOSTS,
      campos: campos(["[].id: number|string", "[].hostname: string"]),
      aoVivo: (env) => { const h = auth(env); return h ? { url: "https://api.short.io/api/domains", headers: h } : null; },
    },
    {
      nome: "links",
      hosts: HOSTS,
      campos: campos([
        "links: array",
        "nextPageToken?: string|null",
        "links[].idString: string",
        "links[].secureShortURL?: string",
        "links[].originalURL: string",
        "links[].title?: string|null",
        "links[].path: string",
        "links[].tags?: array",
        "links[].createdAt?: string",
      ]),
      aoVivo: (env, ant) => {
        const h = auth(env);
        if (!h) return null;
        const id = (ant.dominios as any)?.[0]?.id;
        return id != null ? { url: `https://api.short.io/api/links?domain_id=${encodeURIComponent(String(id))}&limit=5`, headers: h } : "sem domínio de exemplo";
      },
    },
    {
      nome: "estatisticas",
      hosts: HOSTS,
      campos: campos(["totalClicks: number|string", "humanClicks: number|string", "clickStatistics?: object", "clickStatistics.datasets?: array", "clickStatistics.datasets[].data[].x: string", "clickStatistics.datasets[].data[].y: string|number"]),
      aoVivo: (env, ant) => {
        const h = auth(env);
        if (!h) return null;
        const id = (ant.links as any)?.links?.[0]?.idString;
        return id ? { url: `https://api-v2.short.io/statistics/link/${encodeURIComponent(id)}?period=last30&tzOffset=-180`, headers: h } : "sem link de exemplo";
      },
    },
  ],
  normalizadores: (f: any) => {
    const clientes = [
      { id: "cli-1", name: "Dr. Exemplo Teste", handles: ["drexemplo"], bio: "https://exemplo.short.gy/drexemplo-bio" },
      { id: "cli-2", name: "Dra. Outra Pessoa", handles: ["draoutra"], bio: null },
    ];
    const [bio, solto] = f.links.links;
    const a = atribuir({ titulo: bio.title, caminho: bio.path, tags: bio.tags, original: bio.originalURL, short: bio.secureShortURL }, clientes);
    assert.deepEqual(a && [a.client_id, a.como], ["cli-1", "bio"]);
    assert.equal(atribuir({ titulo: solto.title, caminho: solto.path, tags: solto.tags, original: solto.originalURL, short: solto.secureShortURL }, clientes), null, "sem dono fica para o Admin");
    // Estatística: número pode vir como texto; o código aceita qualquer valor finito >= 0.
    for (const k of ["totalClicks", "humanClicks"]) assert.ok(Number.isFinite(Number(f.estatisticas[k])) && Number(f.estatisticas[k]) >= 0, k);
    assert.ok(Number(f.estatisticas.humanClicks) <= Number(f.estatisticas.totalClicks), "humanos ≤ total");
    const dias = f.estatisticas.clickStatistics.datasets[0].data.map((p: any) => String(p.x).slice(0, 10));
    assert.ok(dias.every((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  },
});
