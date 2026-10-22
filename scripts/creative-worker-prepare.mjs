import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Sem dependências npm ou ferramentas de mídia: informa a preparação enquanto o trabalho ainda está na fila.
export async function prepareWorker(env = process.env, request = fetch) {
  const jobId = env.CREATIVE_JOB_ID || "";
  if (jobId && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(jobId)) throw new Error("Identificador de trabalho inválido");
  const base = new URL(env.SUPABASE_URL);
  if (base.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(base.hostname)) throw new Error("Projeto Supabase inválido");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Configuração de processamento ausente");
  const url = new URL("/rest/v1/creative_jobs", base);
  url.searchParams.set("select", "id,kind,status");
  if (jobId) url.searchParams.set("id", `eq.${jobId}`);
  else {
    url.searchParams.set("status", "in.(queued,retry)");
    url.searchParams.set("run_after", `lte.${new Date().toISOString()}`);
  }
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const response = await request(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Não foi possível conferir a fila de processamento");
  const jobs = await response.json();
  if (!Array.isArray(jobs) || (jobId && jobs.length !== 1)) throw new Error("Trabalho não encontrado");
  const needsMedia = jobs.some(j => j.kind === "analyse" && ["queued", "retry"].includes(j.status));
  if (jobId && jobs.some(j => ["queued", "retry"].includes(j.status))) {
    const update = new URL("/rest/v1/creative_jobs", base);
    update.searchParams.set("id", `eq.${jobId}`);
    update.searchParams.set("status", "in.(queued,retry)");
    const result = await request(update, {
      method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message: needsMedia ? "Preparando leitura da mídia original. A análise ainda não começou." : "Preparando adaptação e conexão com a IA. O processamento começará em seguida." }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!result.ok) throw new Error("Não foi possível atualizar a preparação do trabalho");
  }
  return { needsMedia };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await prepareWorker();
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `needs_media=${result.needsMedia}\n`);
    console.log(result.needsMedia ? "Preparação de mídia necessária" : "Processamento sem instalação de mídia");
  } catch {
    // Não imprimir respostas, URLs ou exceções que possam conter segredos.
    console.error("Não foi possível preparar o processamento da Inteligência Criativa");
    process.exitCode = 1;
  }
}
