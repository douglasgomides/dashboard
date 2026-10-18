import type { VercelRequest, VercelResponse } from "../_lib/http-types.js";
import { createClient } from "@supabase/supabase-js";
import { createUserSchema } from "../_lib/request-validation.js";

// Vercel serverless function — runs server-side only. Holds
// SUPABASE_SERVICE_ROLE_KEY, which must NEVER be exposed to the client
// (that's why this can't just be a Supabase RLS-gated insert: creating an
// auth user for someone else requires the Admin API).

function randomPassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Servidor sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configurados" });
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Sem token de autenticação" });
    return;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData.user) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  const { data: isAdminRow } = await admin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", callerData.user.id)
    .maybeSingle();
  if (!isAdminRow) {
    res.status(403).json({ error: "Só admins podem criar usuários" });
    return;
  }

  const parsedBody = createUserSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Informe email válido, client_id e role (owner, strategist ou viewer)" });
    return;
  }
  const { email, client_id, role } = parsedBody.data;
  const { data: client, error: clientError } = await admin.from("clients").select("id").eq("id", client_id).maybeSingle();
  if (clientError) { res.status(503).json({ error: "Não foi possível verificar o cliente" }); return; }
  if (!client) { res.status(404).json({ error: "Cliente não encontrado" }); return; }

  const temporaryPassword = randomPassword();
  const emailNorm = email.trim().toLowerCase();

  // primeiro_acesso: no primeiro login a pessoa cria a própria senha e vê o tour (rota /bem-vindo).
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: emailNorm,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { primeiro_acesso: true },
  });

  let userId = created?.user?.id ?? null;
  let jaExistia = false;
  if (createError || !userId) {
    // E-mail que já tem conta (ex.: médico em dois clientes): só vincula ao cliente, sem trocar a senha dele.
    if (createError && /already|registered|exists/i.test(createError.message)) {
      for (let page = 1; page <= 10 && !userId; page++) {
        const { data: lista } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        const achado = lista?.users.find((u) => (u.email ?? "").toLowerCase() === emailNorm);
        if (achado) userId = achado.id;
        if (!lista || lista.users.length < 1000) break;
      }
      jaExistia = !!userId;
    }
    if (!userId) {
      res.status(400).json({ error: createError?.message ?? "Falha ao criar usuário" });
      return;
    }
  }

  const { error: memberError } = await admin
    .from("client_members")
    .upsert({ client_id, user_id: userId, role }, { onConflict: "client_id,user_id" });
  if (memberError) {
    // Usuário já foi criado — não desfazemos automaticamente; reporta o erro
    // pro admin decidir (ex.: vincular manualmente depois).
    res.status(400).json({ error: `Usuário criado, mas falhou ao vincular ao cliente: ${memberError.message}` });
    return;
  }

  res.status(200).json({ user_id: userId, temporary_password: jaExistia ? null : temporaryPassword, ja_existia: jaExistia });
}
