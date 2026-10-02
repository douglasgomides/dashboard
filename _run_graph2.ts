import { createClient } from "@supabase/supabase-js";
import { runMetaAdsGraphSync } from "./api/_lib/meta-ads-graph-sync.ts";
import { runMetaGraphSync } from "./api/_lib/meta-graph-sync.ts";
const url = process.env.SUPABASE_URL!, key = process.env.SK!;
const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: clientes } = await sb.from("clients").select("id,name").in("name", ["Doctor Creator", "Douglas Gomides", "Juliana Carrion"]);
// 2) posts (Graph) — até o backfill terminar
for (const nome of ["Juliana Carrion","Doctor Creator","Douglas Gomides"]) {
  const c = (clientes ?? []).find((x) => x.name === nome)!;
  const { data: contas } = await sb.from("instagram_accounts").select("id").eq("client_id", c.id).eq("active", true);
  for (const a of contas ?? []) {
    let total = 0, rodada = 0, ultima: any = null;
    for (; rodada < 200; rodada++) {
      const r = await runMetaGraphSync({ accessToken: "", supabaseUrl: url, supabaseServiceRoleKey: key, onlyAccountId: a.id, maxPages: 2 });
      ultima = r[r.length - 1]; total += ultima?.posts ?? 0;
      console.log(`  ${c.name} rodada ${rodada}: +${ultima?.posts ?? 0} (acum ${total}) feito=${ultima?.done} erros=${(ultima?.errors ?? []).length}`);
      if (!ultima || ultima.done || (ultima.errors ?? []).length > 0) break;
    }
    console.log("POSTS", c.name, "rodadas", rodada + 1, "total gravado/atualizado", total, "| concluído:", ultima?.done, "| erros:", JSON.stringify((ultima?.errors ?? []).slice(0, 2)).slice(0, 300));
  }
}
