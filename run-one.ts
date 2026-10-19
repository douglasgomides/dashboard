import fs from "node:fs"; import os from "node:os";
import { createClient } from "@supabase/supabase-js";
import { runMetaGraphSync } from "./api/_lib/meta-graph-sync.js";
import { recordSyncStatusPorCliente } from "./api/_lib/sync-status.js";
const cofre = fs.readFileSync(os.homedir() + "/doctor-creator-infra.md", "utf8");
const SK = cofre.match(/Dashboards de Clientes[\s\S]*?service_role[^`]*`(eyJ[\w.-]+)`/)![1];
const URL = "https://cvdnzoqduliopscfsrkc.supabase.co";
const sb = createClient(URL, SK, { auth: { persistSession: false } });
const alvo = process.argv[2];
const { data: nomes } = await sb.from("clients").select("id,name");
const { data: contas } = await sb.from("instagram_accounts").select("id,client_id").eq("active", true).eq("sync_source", "meta_graph");
for (const a of contas as any[]) {
  const nome = nomes!.find((c) => c.id === a.client_id)?.name ?? "?";
  if (alvo && !nome.toLowerCase().includes(alvo.toLowerCase())) continue;
  const t0 = Date.now();
  const r = await runMetaGraphSync({ accessToken: "", supabaseUrl: URL, supabaseServiceRoleKey: SK, onlyAccountId: a.id, maxPages: 2 });
  const x = r[0];
  await recordSyncStatusPorCliente(sb as any, "instagram", [{ clientId: a.client_id, rows: x?.posts ?? 0, errors: x?.errors ?? [] }], {});
  console.log(nome.padEnd(30), `${Math.round((Date.now() - t0) / 1000)}s`, "posts:", x?.posts, "| erros:", x?.errors.length ? x.errors.slice(0, 2).map((e) => e.slice(0, 110)).join(" || ") : "nenhum");
}
