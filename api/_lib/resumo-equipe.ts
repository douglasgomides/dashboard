/**
 * Junta, por clínica, o que os agentes deixaram esperando a equipe e monta o e-mail diário (src/lib/resumo-equipe.ts).
 * Destinatários: só a equipe Doctor Creator (app_admins). Chamado pelo n8n com o segredo do agendamento; o envio é do
 * n8n (Brevo). Nenhum dado de paciente sai daqui.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { coletarPendencias, montarResumoEquipe } from "../../src/lib/resumo-equipe.js";

type Admin = SupabaseClient<any, any, any>;

export async function resumoEquipe(admin: Admin, baseUrl = "https://dash.doctorcreator.com.br") {
  const pendencias = await coletarPendencias(admin);
  const admins = await admin.from("app_admins").select("user_id");
  if (admins.error) throw new Error(admins.error.message);
  const emails: string[] = [];
  for (const a of (admins.data ?? []) as { user_id: string }[]) {
    const { data } = await admin.auth.admin.getUserById(a.user_id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10).split("-").reverse().join("/");
  return { ...montarResumoEquipe(pendencias, baseUrl, hoje), destinatarios: emails };
}
