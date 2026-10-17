/**
 * Conversas do Digisac dentro do dashboard (IGM Palmas), no mesmo formato das da WTS: conversa = atendimento
 * (ticket, já sincronizado em wts_sessions por digisac-sync), mensagens com direção, e a pessoa pelo telefone do
 * contato (crm_leads). Depois disso a leitura por IA e a auditoria comercial funcionam igual.
 *
 * API: GET /api/v1/messages com query {"where":{"ticketId":...},"order":[["timestamp","ASC"]]}. Direção pelo campo
 * isFromMe (true = a clínica enviou). Os campos de cada mensagem também ficam contados em valoresVistos, para
 * conferir com dado real que a leitura está certa (regra: não supor formato de fornecedor).
 *
 * Conversa é dado de saúde: aqui só escrita, com a service role; a leitura passa por listar_conversas/ler_mensagens.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { baseUrl, digGet } from "./digisac-sync.js";

export type ResultadoDigisac = { atendimentos: number; mensagens: number; vazios: number; restantes: number; erros: string[]; valoresVistos: Record<string, Record<string, number>> };

const chave = (raw?: string | null): string | null => {
  let n = String(raw ?? "").replace(/\D/g, "");
  if (n.startsWith("55") && n.length >= 12) n = n.slice(2);
  n = n.replace(/^0+/, "");
  return n.length === 10 || n.length === 11 ? n.slice(0, 2) + n.slice(-8) : null;
};

/** Direção de uma mensagem do Digisac (exportada para teste). */
export function direcaoDigisac(m: { isFromMe?: unknown; fromMe?: unknown }): "entrada" | "saida" | "sistema" {
  const v = m.isFromMe ?? m.fromMe;
  if (v === true || v === "true") return "saida";
  if (v === false || v === "false") return "entrada";
  return "sistema";
}

/** Texto legível de uma mensagem (texto, legenda ou transcrição), ou null. */
export function textoDigisac(m: Record<string, any>): string | null {
  for (const v of [m.text, m.body, m.caption, m.data?.text, m.transcription, m.data?.transcription]) if (typeof v === "string" && v.trim()) return v;
  return null;
}

export async function ingerirConversasDigisac(admin: SupabaseClient<any, any, any>, opts: { limite?: number; orcamentoMs?: number; dias?: number } = {}): Promise<Record<string, ResultadoDigisac>> {
  const fim = Date.now() + (opts.orcamentoMs ?? 150_000);
  const limite = opts.limite ?? 150;
  const desde = new Date(Date.now() - (opts.dias ?? 30) * 86_400_000).toISOString();
  const { data: conns, error } = await admin.from("crm_connections").select("client_id, subdomain, access_token").eq("provider", "digisac").eq("active", true);
  if (error) throw new Error(error.message);
  const saida: Record<string, ResultadoDigisac> = {};

  for (const conn of (conns ?? []) as { client_id: string; subdomain: string | null; access_token: string | null }[]) {
    const r: ResultadoDigisac = { atendimentos: 0, mensagens: 0, vazios: 0, restantes: 0, erros: [], valoresVistos: { chaves: {}, direcao: {}, tipo: {} } };
    saida[conn.client_id] = r;
    if (!conn.subdomain || !conn.access_token) { r.erros.push("conexão sem subdomínio ou token"); continue; }
    const base = baseUrl(conn.subdomain);
    const clientId = conn.client_id;

    // Atendimentos dos últimos dias ainda sem conversa gravada (mais novos primeiro), ou com mudança depois dela.
    const { data: sess, error: eS } = await admin.from("wts_sessions").select("session_id, contact_id, started_at, updated_at")
      .eq("client_id", clientId).gte("started_at", desde).order("started_at", { ascending: false }).limit(3000);
    if (eS) { r.erros.push(eS.message); continue; }
    const ids = (sess ?? []).map((s: any) => String(s.session_id));
    const ja = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data: ex } = await admin.from("conversas").select("externo_id, ultima_msg_em").eq("client_id", clientId).eq("provider", "digisac").in("externo_id", ids.slice(i, i + 300));
      for (const e of ex ?? []) ja.set(e.externo_id as string, (e.ultima_msg_em as string) ?? "");
    }
    const pendentes = (sess ?? []).filter((s: any) => !ja.has(String(s.session_id)) || (s.updated_at && ja.get(String(s.session_id))! < s.updated_at && Date.now() - new Date(s.updated_at).getTime() < 3 * 86_400_000));
    r.restantes = pendentes.length;

    // Telefone e nome do contato vêm do CRM (crm_leads do Digisac), que já tem a pessoa quando existe.
    const contatos = [...new Set(pendentes.slice(0, limite).map((s: any) => s.contact_id).filter(Boolean))] as string[];
    const leadDe = new Map<string, { id: string; phone: string | null; nome: string | null; pessoa_id: string | null }>();
    for (let i = 0; i < contatos.length; i += 200) {
      const { data: ls } = await admin.from("crm_leads").select("id, external_lead_id, contact_phone, contact_name, pessoa_id").eq("client_id", clientId).eq("provider", "digisac").in("external_lead_id", contatos.slice(i, i + 200));
      for (const l of ls ?? []) leadDe.set(l.external_lead_id as string, { id: l.id as string, phone: l.contact_phone as string | null, nome: l.contact_name as string | null, pessoa_id: l.pessoa_id as string | null });
    }
    const pessoaDe = async (contato: string | null): Promise<string | null> => {
      const l = contato ? leadDe.get(contato) : undefined;
      if (!l) return null;
      if (l.pessoa_id) return l.pessoa_id;
      const k = chave(l.phone);
      if (!k) return null;
      const { data: ex } = await admin.from("pessoas").select("id").eq("client_id", clientId).eq("telefone_chave", k).maybeSingle();
      if (ex?.id) return ex.id as string;
      const { data: novo } = await admin.from("pessoas").insert({ client_id: clientId, telefone: l.phone, telefone_chave: k, nome: l.nome, primeiro_toque_em: new Date().toISOString() }).select("id").maybeSingle();
      if (novo?.id) return novo.id as string;
      const { data: de } = await admin.from("pessoas").select("id").eq("client_id", clientId).eq("telefone_chave", k).maybeSingle();
      return (de?.id as string) ?? null;
    };

    for (const s of pendentes.slice(0, limite)) {
      if (Date.now() > fim) break;
      const tid = String(s.session_id);
      let msgs: Record<string, any>[] = [];
      try {
        for (let page = 1; page <= 6; page++) {
          const body = await digGet(base, conn.access_token, "/messages", {
            perPage: 100, page,
            query: JSON.stringify({ where: { ticketId: tid }, order: [["timestamp", "ASC"]] }),
          });
          const rows = (body?.data ?? []) as Record<string, any>[];
          msgs.push(...rows);
          if (rows.length === 0 || page >= Number(body?.lastPage ?? page)) break;
        }
      } catch (e) {
        r.erros.push((e instanceof Error ? e.message : String(e)).slice(0, 160));
        if (r.erros.length >= 3) break;
        continue;
      }
      // Filtro de segurança: só mensagens deste atendimento (se a API ignorar o filtro, não mistura conversas).
      msgs = msgs.filter((m) => !m.ticketId || String(m.ticketId) === tid);
      for (const k of Object.keys(msgs[0] ?? {})) r.valoresVistos.chaves[k] = (r.valoresVistos.chaves[k] ?? 0) + 1;
      const quando = (m: Record<string, any>) => (m.timestamp ?? m.createdAt ?? s.started_at) as string;
      msgs.sort((a, b) => String(quando(a)).localeCompare(String(quando(b))));
      const pessoaId = await pessoaDe((s.contact_id as string) ?? null);
      const primeira = msgs[0];
      const ultima = msgs[msgs.length - 1];
      const lead = s.contact_id ? leadDe.get(s.contact_id as string) : undefined;
      const { data: conv, error: eC } = await admin.from("conversas").upsert({
        client_id: clientId, pessoa_id: pessoaId, lead_id: lead?.id ?? null, provider: "digisac", canal: "whatsapp", externo_id: tid,
        iniciada_em: primeira ? quando(primeira) : s.started_at, ultima_msg_em: ultima ? quando(ultima) : (s.updated_at ?? s.started_at),
      }, { onConflict: "client_id,provider,externo_id" }).select("id").single();
      if (eC || !conv) { r.erros.push(`conversa ${tid.slice(0, 8)}: ${eC?.message ?? "sem id"}`); continue; }
      if (!msgs.length) { r.vazios++; continue; }
      const linhas = msgs.filter((m) => m.id).map((m) => {
        const d = direcaoDigisac(m);
        r.valoresVistos.direcao[`${String(m.isFromMe ?? m.fromMe)}→${d}`] = (r.valoresVistos.direcao[`${String(m.isFromMe ?? m.fromMe)}→${d}`] ?? 0) + 1;
        r.valoresVistos.tipo[String(m.type)] = (r.valoresVistos.tipo[String(m.type)] ?? 0) + 1;
        return {
          conversa_id: conv.id, client_id: clientId, direcao: d,
          autor: d === "saida" ? "Clínica" : d === "entrada" ? "Paciente" : "Sistema",
          texto: textoDigisac(m), tipo: String(m.type ?? "texto").toLowerCase(), enviada_em: quando(m), externo_id: String(m.id),
        };
      });
      for (let i = 0; i < linhas.length; i += 200) {
        const { error: eM } = await admin.from("mensagens").upsert(linhas.slice(i, i + 200), { onConflict: "conversa_id,externo_id" });
        if (eM) r.erros.push(`mensagens ${tid.slice(0, 8)}: ${eM.message}`);
      }
      r.mensagens += linhas.length;
      r.atendimentos++;
      r.restantes--;
    }
  }
  return saida;
}
