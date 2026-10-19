import fs from "node:fs"; import os from "node:os";
import { createClient } from "@supabase/supabase-js";
import { runMetaCommentsSync } from "./api/_lib/meta-comments-sync.js";
import { recordSyncStatusPorCliente } from "./api/_lib/sync-status.js";
const cofre = fs.readFileSync(os.homedir() + "/doctor-creator-infra.md", "utf8");
const SK = cofre.match(/Dashboards de Clientes[\s\S]*?service_role[^`]*`(eyJ[\w.-]+)`/)![1];
const URL = "https://cvdnzoqduliopscfsrkc.supabase.co";
const sb = createClient(URL, SK, { auth: { persistSession: false } });
for (const nome of ["Doctor Creator", "Douglas Gomides"]) {
  const { data: c } = await sb.from("clients").select("id").eq("name", nome).single();
  const { data: a } = await sb.from("instagram_accounts").select("id").eq("client_id", (c as any).id).single();
  const t0 = Date.now();
  const r = await runMetaCommentsSync({ accessToken: "", supabaseUrl: URL, supabaseServiceRoleKey: SK, onlyAccountId: (a as any).id });
  await recordSyncStatusPorCliente(sb as any, "comentarios", r.map((x) => ({ clientId: x.clientId, rows: x.comments, errors: x.errors })));
  console.log(nome, `${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(r.map((x) => ({ postsVerificados: x.postsChecked, comentarios: x.comments, erros: x.errors.slice(0, 2).map((e) => e.slice(0, 90)) }))));
}
