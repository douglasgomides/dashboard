/**
 * Junta, por clínica, o que os agentes deixaram esperando a equipe e monta o e-mail diário (src/lib/resumo-equipe.ts).
 * Destinatários: só a equipe Doctor Creator (app_admins). Chamado pelo n8n com o segredo do agendamento; o envio é do
 * n8n (Brevo). Nenhum dado de paciente sai daqui.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { montarResumoEquipe, type PendenciasClinica } from "../../src/lib/resumo-equipe.js";

type Admin = SupabaseClient<any, any, any>;

export async function resumoEquipe(admin: Admin, baseUrl = "https://dash.doctorcreator.com.br") {
  const desde = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const [clientes, sug, camp, brain, apr, falhas, rec, admins] = await Promise.all([
    admin.from("clients").select("id, name").eq("active", true),
    admin.from("sugestoes_agentes").select("client_id, agente").eq("estado", "proposta").gte("criado_em", desde(24 * 7)).limit(5000),
    admin.from("campanhas_ideias").select("client_id").eq("estado", "proposta").limit(2000),
    admin.from("brain_itens").select("client_id").eq("estado", "proposto").limit(5000),
    admin.from("aprovacoes").select("client_id").eq("estado", "pendente").limit(1000),
    admin.from("agente_execucoes").select("client_id").eq("estado", "falhou").gte("atualizado_em", desde(24)).limit(1000),
    admin.from("sugestoes_agentes").select("client_id").eq("agente", "recuperacao").eq("resultado", "agendou").gte("medido_em", desde(24 * 7)).limit(5000),
    admin.from("app_admins").select("user_id"),
  ]);
  for (const r of [clientes, sug, camp, brain, apr, falhas, rec, admins]) if (r.error) throw new Error(r.error.message);
  const por = new Map<string, PendenciasClinica>();
  for (const c of (clientes.data ?? []) as { id: string; name: string }[])
    por.set(c.id, { client_id: c.id, nome: c.name, recuperacao: 0, anuncios: 0, conteudo: 0, campanhas: 0, brain: 0, aprovacoes: 0, falhas: 0, agendaram: 0 });
  const mais = (id: string, k: Exclude<keyof PendenciasClinica, "client_id" | "nome">) => { const p = por.get(id); if (p) p[k] += 1; };
  for (const s of (sug.data ?? []) as { client_id: string; agente: "recuperacao" | "anuncios" | "conteudo" }[]) mais(s.client_id, s.agente);
  for (const x of (camp.data ?? []) as { client_id: string }[]) mais(x.client_id, "campanhas");
  for (const x of (brain.data ?? []) as { client_id: string }[]) mais(x.client_id, "brain");
  for (const x of (apr.data ?? []) as { client_id: string }[]) mais(x.client_id, "aprovacoes");
  for (const x of (falhas.data ?? []) as { client_id: string }[]) mais(x.client_id, "falhas");
  for (const x of (rec.data ?? []) as { client_id: string }[]) mais(x.client_id, "agendaram");
  const emails: string[] = [];
  for (const a of (admins.data ?? []) as { user_id: string }[]) {
    const { data } = await admin.auth.admin.getUserById(a.user_id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10).split("-").reverse().join("/");
  return { ...montarResumoEquipe([...por.values()], baseUrl, hoje), destinatarios: emails };
}
