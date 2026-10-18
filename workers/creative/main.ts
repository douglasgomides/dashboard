import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { createAdmin, checked, JobContext, CreativeError } from "./runtime.js";
import { processJob } from "./pipeline.js";
import {
  PIPELINE_VERSION,
  type CreativeJob,
} from "../../src/lib/creative-intelligence/contracts.js";

const env = process.argv.find((a) => a.startsWith("--env="))?.slice(6);
if (env) loadEnvFile(env);
const once = process.argv.includes("--once"),
  jobId = process.argv.find((a) => a.startsWith("--job="))?.slice(6);
if (jobId && !/^[a-f0-9-]{36}$/.test(jobId))
  throw new Error("Identificador de trabalho inválido");
const admin = createAdmin(),
  workerId = process.env.CREATIVE_WORKER_ID || randomUUID();
let stopping = false,
  current: JobContext | undefined;
const stop = () => {
  stopping = true;
  current?.controller.abort();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
async function health() {
  await checked(
    admin
      .from("creative_workers")
      .upsert({
        id: workerId,
        seen_at: new Date().toISOString(),
        version: PIPELINE_VERSION,
        capabilities: {
          vision:
            !!process.env.OPENAI_API_KEY &&
            process.env.OPENAI_API_KEY !== "[SENSITIVE]",
          transcription: !!process.env.OPENAI_API_KEY,
          external_search:
            process.env.CREATIVE_ENABLE_APIFY === "true" &&
            !!process.env.APIFY_API_TOKEN,
          native_video: false,
          semantic_search: !!process.env.OPENAI_API_KEY,
        },
      }),
  );
}
await health();
const healthTimer = setInterval(() => {
  void health().catch(() =>
    console.error(JSON.stringify({ code: "WORKER_HEALTH_FAILED" })),
  );
}, 30_000);
try {
  do {
    const jobs = (await checked(
      admin.rpc("creative_claim", { p_job_id: jobId ?? null }),
    )) as CreativeJob[];
    if (jobs?.[0]) {
      current = new JobContext(admin, jobs[0]);
      await processJob(current);
      current = undefined;
    } else if (!once && !stopping) await delay(5000);
  } while (!once && !stopping);
} finally {
  clearInterval(healthTimer);
}
