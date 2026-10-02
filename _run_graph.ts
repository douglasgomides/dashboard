import { createClient } from "@supabase/supabase-js";
import { runMetaAdsGraphSync } from "./api/_lib/meta-ads-graph-sync.ts";
import { runMetaGraphSync } from "./api/_lib/meta-graph-sync.ts";
const url = process.env.SUPABASE_URL!, key = process.env.SK!;
const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: clientes } = await sb.from("clients").select("id,name").in("name", ["Doctor Creator", "Douglas Gomides", "Juliana Carrion"]);
// 1) anúncios (Graph, 90 dias) — Doctor Creator e Douglas
for (const c of (clientes ?? []).filter((x) => x.name !== "Juliana Carrion")) {
  const r = await runMetaAdsGraphSync({ accessToken: "", supabaseUrl: url, supabaseServiceRoleKey: key, syncDays: 90, clientId: c.id });
  console.log("ANÚNCIOS", c.name, JSON.stringify(r.map((x: any) => ({ conta: x.adAccountId ?? x.ad_account_id, linhas: x.rows, erros: x.errors }))));
}
// 2) posts (Graph) — até o backfill terminar
for (const c of clientes ?? []) {
  const { data: contas } = await sb.from("instagram_accounts").select("id").eq("client_id", c.id).eq("active", true);
  for (const a of contas ?? []) {
    let total = 0, rodada = 0, ultima: any = null;
    for (; rodada < 200; rodada++) {
      const r = await runMetaGraphSync({ accessToken: "", supabaseUrl: url, supabaseServiceRoleKey: key, onlyAccountId: a.id, maxPages: 5 });
      ultima = r[r.length - 1]; total += ultima?.posts ?? 0;
      if (rodada % 5 === 0) console.log(`  ${c.name} rodada ${rodada}: +${ultima?.posts ?? 0} (acum ${total}) feito=${ultima?.done} erros=${(ultima?.errors ?? []).length}`);
      if (!ultima || ultima.done || (ultima.errors ?? []).length > 0) break;
    }
    console.log("POSTS", c.name, "rodadas", rodada + 1, "total gravado/atualizado", total, "| concluído:", ultima?.done, "| erros:", JSON.stringify((ultima?.errors ?? []).slice(0, 2)).slice(0, 300));
  }
}
