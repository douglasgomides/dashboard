import assert from "node:assert/strict";
import { discoveryInput, publicationUrl, discoveryFormat, apifyRunCost } from "../src/lib/creative-intelligence/discovery";
import { runActor } from "../workers/creative/providers";
import { discover } from "../workers/creative/pipeline";
import { type JobContext } from "../workers/creative/runtime";

assert.deepEqual(discoveryInput("instagram", "#marketingmedico"), { directUrls: ["https://www.instagram.com/explore/tags/marketingmedico/"], resultsType: "posts", resultsLimit: 20 });
assert.throws(() => discoveryInput("instagram", "marketing médico"), /sem espaços/);
assert.throws(() => discoveryInput("instagram", "@perfil"), /sem espaços/);
assert.equal(publicationUrl("https://www.instagram.com/explore/tags/chadson", "instagram"), null);
assert.equal(publicationUrl("https://www.instagram.com/perfil/", "instagram"), null);
assert.equal(publicationUrl("https://instagram.com.evil.invalid/p/123/", "instagram"), null);
assert.equal(publicationUrl("https://www.instagram.com/p/ABC123/?utm_source=qa", "instagram"), "https://www.instagram.com/p/ABC123/");
assert.equal(publicationUrl("https://www.tiktok.com/@qa/video/123456?tracking=x", "tiktok"), "https://www.tiktok.com/@qa/video/123456");
assert.equal(discoveryFormat({ type: "Image" }, "instagram", "https://instagram.com/p/QA/"), null);
assert.equal(discoveryFormat({ type: "Sidecar" }, "instagram", "https://instagram.com/p/QA/"), "carrossel");
const terminal = { status: "SUCCEEDED", usageTotalUsd: 0, pricingInfo: { pricingModel: "PAY_PER_EVENT", pricingPerEvent: { actorChargeEvents: { result: { eventPriceUsd: 0.0023, isPrimaryEvent: true } } } }, chargedEventCounts: { result: 1 } };
assert.equal(apifyRunCost({ ...terminal, chargedEventCounts: { result: 6 }, usageTotalUsd: 0.0138 }, 20), null, "partial event counters must not settle the final cost");
assert.equal(apifyRunCost({ ...terminal, chargedEventCounts: undefined, usageTotalUsd: 0.0138 }, 20), null, "missing counters must not settle a partial total");
assert.equal(apifyRunCost({ ...terminal, chargedEventCounts: { result: 20 }, usageTotalUsd: 0.0138 }, 20), 0.046);
assert.equal(apifyRunCost(terminal), 0.0023, "metering delay must not turn a paid event into zero cost");
assert.equal(apifyRunCost({ ...terminal, usageTotalUsd: 0.01 }), 0.01);
assert.equal(apifyRunCost({ ...terminal, pricingInfo: { pricingModel: "PAY_PER_EVENT" } }), null);
assert.equal(apifyRunCost({ usageTotalUsd: -1 }), null);
const oldFetch = globalThis.fetch, env = { ...process.env };
let mode = "ok", requests = 0, settlements: number[] = [], saves: any[] = [], finished: any;
let platform: "instagram" | "tiktok" = "instagram", budget = 0.2477;
function context(): JobContext {
  const cache = new Map<string, unknown>();
  const admin = { from(table: string) {
    let phase = "";
    const q = { select() { return q; }, eq(k: string,v: string) { if(k === "phase") phase=v; return q; },
      async maybeSingle() { return { data: cache.has(phase) ? { result: cache.get(phase) } : null, error: null }; },
      async upsert(row: any) { if(table === "creative_checkpoints") cache.set(row.phase,row.result); else saves.push(row); return { data:null,error:null }; },
    }; return q;
  } };
  return { admin, signal: new AbortController().signal, job: { id:"fictional-job",client_id:"fictional-clinic",account_id:"fictional-account",budget_usd:budget,cost_usd:0,reserved_usd:0,input:{platform,query:"marketingmedico"} },
    async reserve(_k:string,_m:string,_p:string,ceiling:number) { assert.equal(ceiling, platform === "instagram" ? 0.2477 : 0.5); return "fictional-reservation"; },
    async settle(_id:string,cost:number) { settlements.push(cost); }, async beat() {}, async finish(output:any) { finished=output; },
  } as unknown as JobContext;
}
try {
  process.env.APIFY_API_TOKEN="fictional-api-key";process.env.CREATIVE_ENABLE_APIFY="true";
  globalThis.fetch=async(input,init)=>{
    const u=new URL(String(input)); assert.equal(u.origin,"https://api.apify.com");requests++;
    if(init?.method==="POST") {
      assert.equal(Number(u.searchParams.get("maxTotalChargeUsd")),platform === "instagram" ? 0.2477 : 0.5);
      assert.equal(u.searchParams.get("memory"),platform === "instagram" ? "1024" : "4096");
      if(mode === "reject") return Response.json({error:{type:"max-charge-too-low",message:"fictional-api-key must never appear in UI"}},{status:400});
      if(mode === "server") return Response.json({error:{type:"server-error"}},{status:503});
      return Response.json({data:{id:"fictional-run"}});
    }
    if(u.pathname.includes("actor-runs")) return Response.json({data:{...terminal,defaultDatasetId:"fictional-dataset"}});
    if(!u.pathname.includes("/items")) return Response.json({data:{itemCount:1}});
    return Response.json(mode === "invalid" ? [{url:"https://www.instagram.com/explore/tags/chadson",id:"chadson"}] : [{id:"qa",url:platform === "instagram" ? "https://www.instagram.com/p/QA/" : "https://www.tiktok.com/@qa/video/123456",type:"Sidecar",caption:"Referência fictícia"}]);
  };
  await discover(context());assert.equal(finished.count,1);assert.equal(saves.length,1);assert.equal(settlements[0],0.0023);
  mode="invalid";saves=[];await assert.rejects(()=>discover(context()),e=>e instanceof Error && /publicações válidas/.test(e.message));assert.equal(saves.length,0,"hashtag metadata must never be persisted as a post");
  mode="reject";settlements=[];await assert.rejects(()=>runActor(context(),platform,{}),e=>e instanceof Error && e.message.includes("400") && !e.message.includes("fictional-api-key"));assert.deepEqual(settlements,[0],"explicitly rejected starts release the reservation as zero");
  mode="server";settlements=[];await assert.rejects(()=>runActor(context(),platform,{}));assert.deepEqual(settlements,[],"uncertain provider outcomes keep the reservation");
  platform="tiktok";const before=requests;await assert.rejects(()=>runActor(context(),platform,{}),/orçamento mínimo/);assert.equal(requests,before);
  process.env.CREATIVE_ENABLE_APIFY_TIKTOK="true";budget=0.5;mode="ok";await discover(context());assert.equal(finished.count,1);
  console.log("creative-discovery ok (real post URLs, hashtag input, provider minimums, rejection vs uncertainty, PPE metering, no false references)");
} finally {globalThis.fetch=oldFetch;for(const k of Object.keys(process.env)) if(!(k in env)) delete process.env[k];Object.assign(process.env,env);}
