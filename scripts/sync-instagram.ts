/**
 * Sync manual dos dados de Instagram da Windsor.ai pro Supabase. Roda com
 * `npm run sync:instagram`. A lógica em si mora em api/_lib/instagram-sync.ts
 * (compartilhada com o endpoint HTTP api/sync/instagram.ts, que o n8n chama
 * todo dia) — este script é só um wrapper de linha de comando.
 *
 * Precisa de WINDSOR_API_KEY, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no
 * ambiente. O endpoint e os nomes de campo seguem a API pública da Windsor.ai
 * (https://windsor.ai/api-fields/) — confira lá se algum campo mudar.
 */
import { runInstagramSync } from "../api/_lib/instagram-sync.js";

const WINDSOR_API_KEY = process.env.WINDSOR_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// 365 dias por padrão — todo cliente novo entra com o histórico completo de
// 1 ano, não só os últimos meses. O sync diário do n8n continua passando
// sync_days=3 explicitamente (não precisa reprocessar o ano inteiro todo dia).
const SYNC_DAYS = Number(process.env.SYNC_DAYS ?? 365);

if (!WINDSOR_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing WINDSOR_API_KEY, SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

async function main() {
  const results = await runInstagramSync({
    windsorApiKey: WINDSOR_API_KEY!,
    supabaseUrl: SUPABASE_URL!,
    supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY!,
    syncDays: SYNC_DAYS,
  });

  if (results.length === 0) {
    console.log("Nenhuma conta Instagram ativa em instagram_accounts. Cadastre os 2 clientes piloto primeiro.");
    return;
  }

  for (const r of results) {
    console.log(`[posts] synced ${r.posts} posts for account ${r.windsorAccountId}`);
    console.log(`[daily] synced ${r.dailyMetrics} days for account ${r.windsorAccountId}`);
    console.log(`[tema] classified ${r.temasClassified} posts for account ${r.windsorAccountId}`);
    for (const err of r.errors) console.error(`[${r.windsorAccountId}] ${err}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
