import { supabase } from "@/integrations/supabase/client";
import type { EnvioClickUp, Revisao } from "./acompanhamento";
export interface PainelAcompanhamento {
  revisoes: Revisao[];
  clientes: { id: string; name: string; active: boolean }[];
  envios: EnvioClickUp[];
  ia: boolean;
  clickup: boolean;
}
export async function chamarAcompanhamento<T>(body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Entre novamente para continuar.");
  const response = await fetch("/api/sync/manual?_central=acompanhamento", {
    method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? "Não foi possível carregar o acompanhamento.");
  return result as T;
}
