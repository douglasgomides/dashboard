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
import { conversasAtivasParaConferir, iniciarConferenciaMensagens, finalizarConferenciaMensagens } from "./conversas-wts.js";

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
    const cobertura = new Map<string, string | null>();
    let erroExistentes = false;
    for (let i = 0; i < ids.length; i += 300) {
      const { data: ex, error } = await admin.from("conversas").select("externo_id, ultima_msg_em, mensagens_cobertura").eq("client_id", clientId).eq("provider", "digisac").in("externo_id", ids.slice(i, i + 300));
      if (error) { erroExistentes = true; break; }
      for (const e of ex ?? []) { ja.set(e.externo_id as string, (e.ultima_msg_em as string) ?? ""); cobertura.set(e.externo_id, e.mensagens_cobertura); }
    }
    if (erroExistentes) { r.erros.push("Não foi possível consultar as conversas existentes."); continue; }
    let ativas;
    try { ativas = await conversasAtivasParaConferir(admin, clientId, "digisac"); }
    catch { r.erros.push("Não foi possível priorizar as conversas dos casos ativos."); continue; }
    const porSessao = new Map<string, any>((sess ?? []).map((s: any) => [String(s.session_id), s]));
    const prioritarias = ativas.map((c) => porSessao.get(c.externo_id) ?? { session_id: c.externo_id, contact_id: null, started_at: c.iniciada_em, updated_at: c.ultima_msg_em });
    const novasOuMudaram = (sess ?? []).filter((s: any) => !ja.has(String(s.session_id)) || cobertura.get(String(s.session_id)) !== "completa" || (s.updated_at && ja.get(String(s.session_id))! < s.updated_at && Date.now() - new Date(s.updated_at).getTime() < 3 * 86_400_000));
    const pendentes = [...new Map([...prioritarias, ...novasOuMudaram].map((s: any) => [String(s.session_id), s])).values()];
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
      let tentativa: { id: string; em: string } | undefined;
      let terminada = false;
      try {
      tentativa = await iniciarConferenciaMensagens(admin, clientId, "digisac", tid);
      let msgs: Record<string, any>[] = [];
      let completa = false;
      try {
        for (let page = 1; page <= 6; page++) {
          if (Date.now() >= fim) break;
          const body = await digGet(base, conn.access_token, "/messages", {
            perPage: 100, page,
            query: JSON.stringify({ where: { ticketId: tid }, order: [["timestamp", "ASC"]] }),
          });
          if (!Array.isArray(body?.data)) throw new Error("Formato de mensagens não confirmado.");
          const rows = body.data as Record<string, any>[];
          msgs.push(...rows);
          const ultima = Number(body.lastPage);
          if (body.currentPage != null && Number(body.currentPage) !== page) break;
          if (Number.isSafeInteger(ultima) && ultima >= 1 && ultima === page) { completa = true; break; }
          if (rows.length === 0 || !Number.isSafeInteger(ultima) || ultima < page) break;
        }
      } catch {
        await finalizarConferenciaMensagens(admin, clientId, tentativa, "erro");
        terminada = true;
        r.erros.push(`mensagens ${tid.slice(0, 8)}: consulta indisponível`);
        if (r.erros.length >= 3) break;
        continue;
      }
      // Filtro de segurança: só mensagens deste atendimento (se a API ignorar o filtro, não mistura conversas).
      const validas = msgs.filter((m) => m && (!m.ticketId || String(m.ticketId) === tid) && m.id != null && String(m.id).trim()
        && Number.isFinite(Date.parse(m.timestamp ?? m.createdAt)));
      if (validas.length !== msgs.length || new Set(validas.map((m) => String(m.id))).size !== validas.length) completa = false;
      msgs = validas;
      if (!msgs.length) {
        r.vazios++;
        await finalizarConferenciaMensagens(admin, clientId, tentativa, "parcial");
        terminada = true;
        continue;
      }
      for (const k of Object.keys(msgs[0] ?? {})) r.valoresVistos.chaves[k] = (r.valoresVistos.chaves[k] ?? 0) + 1;
      const quando = (m: Record<string, any>) => (m.timestamp ?? m.createdAt) as string;
      msgs.sort((a, b) => String(quando(a)).localeCompare(String(quando(b))));
      const pessoaId = await pessoaDe((s.contact_id as string) ?? null);
      const primeira = msgs[0];
      const ultima = msgs[msgs.length - 1];
      const lead = s.contact_id ? leadDe.get(s.contact_id as string) : undefined;
      const { data: conv, error: eC } = await admin.from("conversas").update({
        ...(pessoaId ? { pessoa_id: pessoaId } : {}), ...(lead?.id ? { lead_id: lead.id } : {}),
        iniciada_em: primeira ? quando(primeira) : s.started_at, ultima_msg_em: ultima ? quando(ultima) : (s.updated_at ?? s.started_at),
      }).eq("client_id", clientId).eq("id", tentativa.id).eq("mensagens_conferencia_em", tentativa.em).select("id").maybeSingle();
      if (eC) { r.erros.push(`conversa ${tid.slice(0, 8)}: ${eC.message}`); continue; }
      if (!conv) { terminada = true; continue; }
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
      let erroPersistencia = false;
      for (let i = 0; i < linhas.length; i += 200) {
        const { error: eM } = await admin.from("mensagens").upsert(linhas.slice(i, i + 200), { onConflict: "conversa_id,externo_id" });
        if (eM) { r.erros.push(`mensagens ${tid.slice(0, 8)}: ${eM.message}`); erroPersistencia = true; }
        else r.mensagens += linhas.slice(i, i + 200).length;
      }
      await finalizarConferenciaMensagens(admin, clientId, tentativa, erroPersistencia ? "erro" : completa ? "completa" : "parcial");
      terminada = true;
      r.atendimentos++;
      r.restantes--;
      } catch {
        r.erros.push(`conversa ${tid.slice(0, 8)}: conferência não concluída`);
      } finally {
        if (tentativa && !terminada) {
          try { await finalizarConferenciaMensagens(admin, clientId, tentativa, "erro"); }
          catch { r.erros.push(`conversa ${tid.slice(0, 8)}: cobertura não registrada`); }
        }
      }
    }
  }
  return saida;
}
