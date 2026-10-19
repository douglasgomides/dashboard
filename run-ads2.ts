import fs from "node:fs"; import os from "node:os";
import { createClient } from "@supabase/supabase-js";
import { runMetaAdsGraphSync } from "./api/_lib/meta-ads-graph-sync.js";
import { recordSyncStatusPorCliente } from "./api/_lib/sync-status.js";
const cofre = fs.readFileSync(os.homedir() + "/doctor-creator-infra.md", "utf8");
const SK = cofre.match(/Dashboards de Clientes[\s\S]*?service_role[^`]*`(eyJ[\w.-]+)`/)![1];
const URL = "https://cvdnzoqduliopscfsrkc.supabase.co";
const sb = createClient(URL, SK, { auth: { persistSession: false } });
for (const nome of ["Douglas Gomides", "Doctor Creator"]) {
  const { data: c } = await sb.from("clients").select("id").eq("name", nome).single();
  const t0 = Date.now();
  const r = await runMetaAdsGraphSync({ accessToken: undefined, supabaseUrl: URL, supabaseServiceRoleKey: SK, syncDays: 30, clientId: (c as any).id } as any);
  await recordSyncStatusPorCliente(sb as any, "anuncios", r.map((x: any) => ({ clientId: x.client_id, rows: x.rows, errors: x.errors })), { okSeHouveLinhas: true });
  console.log(nome, `${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(r.map((x: any) => ({ conta: x.ad_account_id, linhas: x.rows, erros: x.errors.map((e: string) => e.slice(0, 80)) }))));
}
