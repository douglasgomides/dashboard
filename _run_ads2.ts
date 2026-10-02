import { createClient } from "@supabase/supabase-js";
import { runMetaAdsGraphSync } from "./api/_lib/meta-ads-graph-sync.ts";
const url = process.env.SUPABASE_URL!, key = process.env.SK!;
const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: c } = await sb.from("clients").select("id").eq("name", "Douglas Gomides").single();
for (const dias of [14, 30, 60, 90]) {
  const r = await runMetaAdsGraphSync({ accessToken: "", supabaseUrl: url, supabaseServiceRoleKey: key, syncDays: dias, clientId: c!.id });
  console.log("DOUGLAS anúncios", dias, "dias:", JSON.stringify(r.map((x: any) => ({ linhas: x.rows, erros: (x.errors ?? []).map((e: string) => e.slice(0, 90)) }))));
  if (r.some((x: any) => (x.errors ?? []).length > 0)) break;
}
