import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

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

  const { email, client_id, role } = (req.body ?? {}) as {
    email?: string;
    client_id?: string;
    role?: string;
  };
  if (!email || !client_id || !role) {
    res.status(400).json({ error: "Faltam email, client_id ou role" });
    return;
  }
  if (!["owner", "strategist", "viewer"].includes(role)) {
    res.status(400).json({ error: "role inválida" });
    return;
  }

  const temporaryPassword = randomPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    res.status(400).json({ error: createError?.message ?? "Falha ao criar usuário" });
    return;
  }

  const { error: memberError } = await admin
    .from("client_members")
    .insert({ client_id, user_id: created.user.id, role });
  if (memberError) {
    // Usuário já foi criado — não desfazemos automaticamente; reporta o erro
    // pro admin decidir (ex.: vincular manualmente depois).
    res.status(400).json({ error: `Usuário criado, mas falhou ao vincular ao cliente: ${memberError.message}` });
    return;
  }

  res.status(200).json({ user_id: created.user.id, temporary_password: temporaryPassword });
}
