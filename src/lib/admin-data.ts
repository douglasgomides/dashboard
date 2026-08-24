import { supabase } from "@/integrations/supabase/client";
import type { CrmProvider } from "@/integrations/supabase/types";

export async function listAllClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, specialty, instagram_handle, active, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createClient(input: { name: string; specialty?: string; instagram_handle?: string }) {
  const { data, error } = await supabase.from("clients").insert(input).select("id").single();
  if (error) throw error;
  return data;
}

export async function connectInstagramAccount(input: {
  client_id: string;
  windsor_account_id: string;
  ig_username?: string;
}) {
  const { error } = await supabase.from("instagram_accounts").insert(input);
  if (error) throw error;
}

export async function listInstagramAccounts(clientId: string) {
  const { data, error } = await supabase
    .from("instagram_accounts")
    .select("id, windsor_account_id, ig_username, active, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listCrmConnections(clientId: string) {
  const { data, error } = await supabase
    .from("crm_connections")
    .select("id, provider, subdomain, active, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCrmConnection(input: {
  client_id: string;
  provider: CrmProvider;
  subdomain?: string;
  access_token?: string;
}) {
  const { error } = await supabase.from("crm_connections").insert(input);
  if (error) throw error;
}

export async function removeCrmConnection(connectionId: string) {
  const { error } = await supabase.from("crm_connections").delete().eq("id", connectionId);
  if (error) throw error;
}

export async function listClientMembers(clientId: string) {
  // client_members não guarda e-mail — junta com uma view mínima via RPC seria
  // ideal, mas pra Fase 1 o admin já sabe o e-mail que cadastrou; mostramos o
  // user_id e o papel.
  const { data, error } = await supabase
    .from("client_members")
    .select("id, user_id, role, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function removeClientMember(memberId: string) {
  const { error } = await supabase.from("client_members").delete().eq("id", memberId);
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export interface CreateClientUserInput {
  email: string;
  client_id: string;
  role: "owner" | "strategist" | "viewer";
}

export async function createClientUser(input: CreateClientUserInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessão expirada — faça login de novo.");

  const res = await fetch("/api/admin/create-user", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `Falha ao criar usuário (HTTP ${res.status})`);
  }
  return body as { user_id: string; temporary_password: string };
}

export interface CreateAdminInput {
  email: string;
  password?: string;
}

export async function createAdminUser(input: CreateAdminInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessão expirada — faça login de novo.");

  const res = await fetch("/api/admin/create-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `Falha ao criar admin (HTTP ${res.status})`);
  }
  return body as { user_id: string; temporary_password: string | null };
}
