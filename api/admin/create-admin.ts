import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

// Cria um admin master (acesso total, sem vínculo com um client_members
// específico). Espelha api/admin/create-user.ts mas insere em app_admins
// em vez de client_members, e aceita uma senha escolhida pelo chamador
// (em vez de sempre gerar uma aleatória) — só quem já é admin pode chamar.

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
    res.status(403).json({ error: "Só admins podem criar outros admins" });
    return;
  }

  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
  if (!email) {
    res.status(400).json({ error: "Falta email" });
    return;
  }
  if (password && password.length < 8) {
    res.status(400).json({ error: "Senha precisa ter pelo menos 8 caracteres" });
    return;
  }

  const finalPassword = password || randomPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: finalPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    res.status(400).json({ error: createError?.message ?? "Falha ao criar usuário" });
    return;
  }

  const { error: adminError } = await admin.from("app_admins").insert({ user_id: created.user.id });
  if (adminError) {
    res.status(400).json({ error: `Usuário criado, mas falhou ao torná-lo admin: ${adminError.message}` });
    return;
  }

  res.status(200).json({ user_id: created.user.id, temporary_password: password ? null : finalPassword });
}
