import fs from "node:fs"; import os from "node:os";
import { createClient } from "@supabase/supabase-js";
import { runMetaGraphSync } from "./api/_lib/meta-graph-sync.js";
import { recordSyncStatusPorCliente } from "./api/_lib/sync-status.js";
const cofre = fs.readFileSync(os.homedir() + "/doctor-creator-infra.md", "utf8");
const SK = cofre.match(/Dashboards de Clientes[\s\S]*?service_role[^`]*`(eyJ[\w.-]+)`/)![1];
const URL = "https://cvdnzoqduliopscfsrkc.supabase.co";
const sb = createClient(URL, SK, { auth: { persistSession: false } });
for (const nome of ["Doctor Creator", "Douglas Gomides"]) {
  const { data: c } = await sb.from("clients").select("id").eq("name", nome).single();
  const { data: a } = await sb.from("instagram_accounts").select("id").eq("client_id", (c as any).id).single();
  const aid = (a as any).id;
  await sb.from("instagram_backfill_state").upsert({ instagram_account_id: aid, next_cursor: null, backfill_done: false, updated_at: new Date().toISOString() }, { onConflict: "instagram_account_id" });
  let rodada = 0, done = false, total = 0, errosAcum: string[] = [];
  while (!done && rodada < 60) {
    rodada++;
    const r = await runMetaGraphSync({ accessToken: "", supabaseUrl: URL, supabaseServiceRoleKey: SK, onlyAccountId: aid, maxPages: 3 });
    const x = r[0]; total += x?.posts ?? 0; done = !!x?.done; errosAcum.push(...(x?.errors ?? []));
    const { count } = await sb.from("instagram_posts").select("id", { count: "exact", head: true }).eq("instagram_account_id", aid);
    console.log(nome, `rodada ${rodada}`, "lidos:", x?.posts, "| no banco:", count, "| fim:", done);
    if (!x?.posts && x?.errors?.length) { console.log("  parou:", x.errors[0].slice(0, 120)); break; }
  }
  await recordSyncStatusPorCliente(sb as any, "instagram", [{ clientId: (c as any).id, rows: total, errors: [] }], {});
  console.log(nome, "erros de insights (não derrubam):", errosAcum.length);
}
console.log("FIM");
