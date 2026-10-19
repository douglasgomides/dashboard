import fs from "node:fs"; import os from "node:os";
import { createClient } from "@supabase/supabase-js";
import { runClintSync } from "./api/_lib/clint-sync.js";
import { recordSyncStatusPorCliente } from "./api/_lib/sync-status.js";
const cofre = fs.readFileSync(os.homedir() + "/doctor-creator-infra.md", "utf8");
const SK = cofre.match(/Dashboards de Clientes[\s\S]*?service_role[^`]*`(eyJ[\w.-]+)`/)![1];
const URL = "https://cvdnzoqduliopscfsrkc.supabase.co";
const sb = createClient(URL, SK, { auth: { persistSession: false } });
for (const nome of ["Doctor Creator", "Douglas Gomides"]) {
  const { data: c } = await sb.from("clients").select("id").eq("name", nome).single();
  const t0 = Date.now();
  const r = await runClintSync({ supabaseUrl: URL, supabaseServiceRoleKey: SK, onlyClientId: (c as any).id } as any);
  await recordSyncStatusPorCliente(sb as any, "crm", r.map((x: any) => ({ clientId: x.clientId, rows: x.negocios, errors: x.errors })));
  const { count } = await sb.from("crm_leads").select("id", { count: "exact", head: true }).eq("client_id", (c as any).id).is("removido_na_origem", null);
  console.log(nome, `${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(r.map((x: any) => ({ origens: x.origens, negocios: x.negocios, erros: x.errors.slice(0, 2) }))), "| leads no dash:", count);
}
