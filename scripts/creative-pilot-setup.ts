// Somente homologação: cria usuário de QA sem enviar e-mail e guarda a senha fora do Git.
import { loadEnvFile } from "node:process";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createAdmin, checked } from "../workers/creative/runtime";
loadEnvFile(".env.creative.local");
if (
  new URL(process.env.SUPABASE_URL!).hostname !==
  "tezpmowkupeoabzzbxpf.supabase.co"
)
  throw new Error("Script limitado à branch de teste autorizada");
const admin = createAdmin(),
  clientId = "f8ced257-8df7-4e1a-9e88-a7409fbd4b6b";
const email = `creative-qa-${Date.now()}@homologacao.example.invalid`,
  password = randomBytes(30).toString("base64url");
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error || !data.user)
  throw new Error("Não foi possível criar o usuário de homologação");
await checked(
  admin
    .from("client_members")
    .insert({ client_id: clientId, user_id: data.user.id, role: "owner" }),
);
await writeFile(
  ".creative-pilot-auth.local",
  JSON.stringify({ email, password, clientId, userId: data.user.id }),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    created: true,
    environment: "homologação",
    email_sent: false,
    clientId,
  }),
);
