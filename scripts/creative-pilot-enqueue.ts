// Executa somente sobre a branch de homologação e a conta autorizada do piloto.
import { loadEnvFile } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { createAdmin, checked } from "../workers/creative/runtime";
loadEnvFile(".env.creative.local");
if (
  new URL(process.env.SUPABASE_URL!).hostname !==
  "tezpmowkupeoabzzbxpf.supabase.co"
)
  throw new Error("Ambiente não autorizado");
const admin = createAdmin(),
  auth = JSON.parse(await readFile(".creative-pilot-auth.local", "utf8"));
const { error } = await admin.auth.signInWithPassword({
  email: auth.email,
  password: auth.password,
});
if (error) throw new Error("Falha ao autenticar QA");
const accountId = "ee34dfdc-7177-45b3-a477-ec516f9653a5";
const saved: Record<string, string> = {};
for (const [kind, postId] of Object.entries({
  carousel: "a47ffdda-8b1e-4855-a416-be7d4d2a7741",
  reel: "04b5666a-4079-4186-841d-8e041acb291e",
})) {
  saved[kind] = await checked(
    admin.rpc("creative_enqueue", {
      p_client_id: auth.clientId,
      p_kind: "analyse",
      p_input: { account_id: accountId, post_id: postId },
      p_request_key: `real-pilot-${kind}-20261018`,
    }),
  );
}
await writeFile(
  "work/creative-pilot/jobs.json",
  JSON.stringify(saved, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(saved));
