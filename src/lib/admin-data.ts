import { supabase } from "@/integrations/supabase/client";
import type { CfmScoreStatus, CrmProvider } from "@/integrations/supabase/types";

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
    .select("id, provider, subdomain, webhook_secret, active, created_at")
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

// Buffer não existe no browser — gera o secret em base64 URL-safe na mão.
function randomWebhookSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Kommo não usa OAuth aqui — webhook nativo (a Kommo empurra o evento pra
// nossa URL). A URL única por conexão (connection_id + secret) é a única
// proteção do endpoint, já que a Kommo não assina os webhooks.
export async function createKommoWebhookConnection(clientId: string, subdomain?: string) {
  const { data, error } = await supabase
    .from("crm_connections")
    .insert({ client_id: clientId, provider: "kommo", subdomain, webhook_secret: randomWebhookSecret() })
    .select("id, webhook_secret")
    .single();
  if (error) throw error;
  return data;
}

export function kommoWebhookUrl(connectionId: string, webhookSecret: string): string {
  return `${window.location.origin}/api/integrations/kommo/webhook?connection_id=${connectionId}&secret=${webhookSecret}`;
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

// ---- Perfil do cliente ----------------------------------------------------

export type ClientProfileInput = {
  name: string;
  specialty: string | null;
  instagram_handle: string | null;
  avatar_url: string | null;
  meta_ad_account_id: string | null;
  wts_company_id: string | null;
  cfm_score_status: CfmScoreStatus | null;
  active: boolean;
};

export async function updateClientProfile(clientId: string, input: ClientProfileInput) {
  const { error } = await supabase.from("clients").update(input).eq("id", clientId);
  if (error) throw error;
}

/**
 * Sobe a foto e devolve a URL pública.
 *
 * O nome do arquivo carrega um carimbo de tempo em vez de ser fixo por
 * cliente: com nome fixo, o navegador e a CDN continuariam servindo a foto
 * antiga depois da troca, e a impressão seria de que o upload não funcionou.
 * O arquivo velho é apagado depois, para o bucket não virar depósito.
 */
export async function uploadClientAvatar(clientId: string, file: File, avatarAtual?: string | null) {
  const extensao = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const caminho = `${clientId}/${Date.now()}.${extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from("client-avatars")
    .upload(caminho, file, { contentType: file.type, upsert: false });
  if (erroUpload) throw erroUpload;

  const { data } = supabase.storage.from("client-avatars").getPublicUrl(caminho);

  // Best-effort: se a limpeza falhar, sobra um arquivo órfão — não é motivo
  // para a troca de foto falhar na cara do admin.
  if (avatarAtual) {
    const anterior = avatarAtual.split("/client-avatars/")[1];
    if (anterior && anterior !== caminho) {
      await supabase.storage.from("client-avatars").remove([anterior]).catch(() => undefined);
    }
  }

  return data.publicUrl;
}
