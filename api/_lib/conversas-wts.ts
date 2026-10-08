/**
 * Conversas do WhatsApp (WTS Chat) dentro do dashboard.
 *
 * Para cada sessão já sincronizada em wts_sessions: busca as mensagens, busca o contato (telefone) e grava
 *  - pessoa (pelo telefone), conversa e mensagens
 *  - o toque "mensagem_whatsapp", ligado ao link rastreado quando a primeira mensagem do paciente traz o código
 *
 * Conversa é dado de saúde: a leitura pelo dashboard passa só pelas funções listar_conversas/ler_mensagens
 * (acesso restrito e registrado). Aqui é só escrita, com a service role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { extrairCodigos } from "./shortio.js";

const BASE = "https://api.wts.chat";

async function wtsGet(token: string, caminho: string): Promise<any> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch(`${BASE}${caminho}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) {
      await new Promise((ok) => setTimeout(ok, 800 * (tentativa + 1)));
      continue;
    }
    throw new Error(`WTS ${caminho.split("?")[0]} respondeu ${r.status}`);
  }
  throw new Error(`WTS ${caminho.split("?")[0]} indisponível`);
}

export function direcaoDaMensagem(d: unknown): "entrada" | "saida" | "sistema" {
  const x = String(d ?? "").toLowerCase();
  if (/(out|send|sent|tocontact|to_contact|agent|user)/.test(x)) return "saida";
  if (/(^in|input|inbound|receiv|fromcontact|from_contact|contact)/.test(x)) return "entrada";
  return "sistema";
}

type Contato = { phone: string | null; nome: string | null; email: string | null; instagram: string | null };

export type ResultadoConversas = {
  sessoes: number;
  mensagens: number;
  pessoas: number;
  comCodigo: number;
  erros: string[];
  valoresVistos: Record<string, Record<string, number>>;
};

export async function ingerirConversasWts(
  supabase: SupabaseClient<any, any, any>,
  token: string,
  clientId: string,
  opts: { limite?: number; orcamentoMs?: number; dias?: number } = {},
): Promise<ResultadoConversas> {
  const limite = opts.limite ?? 120;
  const fim = Date.now() + (opts.orcamentoMs ?? 150_000);
  const r: ResultadoConversas = { sessoes: 0, mensagens: 0, pessoas: 0, comCodigo: 0, erros: [], valoresVistos: { direcao: {}, tipo: {}, origem: {} } };

  // Sessões candidatas: as mais novas primeiro.
  let q = supabase.from("wts_sessions").select("session_id, contact_id, started_at, updated_at").eq("client_id", clientId).not("contact_id", "is", null).order("started_at", { ascending: false }).limit(2000);
  if (opts.dias) q = q.gte("started_at", new Date(Date.now() - opts.dias * 86_400_000).toISOString());
  const { data: sessoes, error } = await q;
  if (error) {
    r.erros.push(`wts_sessions: ${error.message}`);
    return r;
  }
  const ids = (sessoes ?? []).map((s: any) => String(s.session_id));
  const existentes = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data: ex } = await supabase.from("conversas").select("externo_id, ultima_msg_em").eq("client_id", clientId).eq("provider", "wts").in("externo_id", ids.slice(i, i + 300));
    for (const e of ex ?? []) existentes.set(e.externo_id, e.ultima_msg_em ?? "");
  }
  // Novas sempre; as já gravadas só se a sessão mudou depois da última mensagem conhecida.
  const pendentes = (sessoes ?? []).filter((s: any) => {
    const ult = existentes.get(String(s.session_id));
    return ult === undefined || (s.updated_at && ult && new Date(s.updated_at).getTime() > new Date(ult).getTime() + 60_000);
  });

  // Códigos dos links rastreados deste cliente (casam com a primeira mensagem do paciente).
  const { data: links } = await supabase.from("links_rastreados").select("id, codigo_ref, tipo, instagram_post_id, ad_campaign_id").eq("client_id", clientId);
  const porCodigo = new Map<string, any>((links ?? []).map((l: any) => [String(l.codigo_ref).toUpperCase(), l]));

  const contatos = new Map<string, Contato | null>();
  async function contato(id: string): Promise<Contato | null> {
    if (contatos.has(id)) return contatos.get(id) ?? null;
    try {
      const c = await wtsGet(token, `/core/v1/contact/${id}`);
      const v: Contato = { phone: c.phoneNumber ?? null, nome: c.name ?? c.nameWhatsapp ?? null, email: c.email ?? null, instagram: typeof c.instagram === "string" ? c.instagram : null };
      contatos.set(id, v);
      return v;
    } catch {
      contatos.set(id, null);
      return null;
    }
  }

  // chave de telefone igual à do banco (DDD + 8 últimos dígitos)
  const chave = (raw?: string | null): string | null => {
    let n = String(raw ?? "").replace(/\D/g, "");
    if (n.startsWith("55") && n.length >= 12) n = n.slice(2);
    n = n.replace(/^0+/, "");
    return n.length === 10 || n.length === 11 ? n.slice(0, 2) + n.slice(-8) : null;
  };

  async function pessoaDe(c: Contato | null): Promise<string | null> {
    const k = chave(c?.phone);
    if (!c || !k) return null;
    const { data: ex } = await supabase.from("pessoas").select("id").eq("client_id", clientId).eq("telefone_chave", k).maybeSingle();
    if (ex?.id) return ex.id;
    const { data: novo, error: e } = await supabase
      .from("pessoas")
      .insert({ client_id: clientId, telefone: c.phone, telefone_chave: k, nome: c.nome, email: c.email, ig_username: c.instagram, primeiro_toque_em: new Date().toISOString() })
      .select("id")
      .single();
    if (e) {
      const { data: de } = await supabase.from("pessoas").select("id").eq("client_id", clientId).eq("telefone_chave", k).maybeSingle();
      return de?.id ?? null;
    }
    r.pessoas++;
    return novo?.id ?? null;
  }

  async function processar(s: any) {
    const sid = String(s.session_id);
    const msgs: any[] = [];
    for (let pagina = 1; pagina <= 8; pagina++) {
      const j = await wtsGet(token, `/chat/v1/session/${sid}/message?PageSize=100&PageNumber=${pagina}`);
      msgs.push(...(j.items ?? []));
      if (!j.hasMorePages) break;
    }
    if (msgs.length === 0) return;
    msgs.sort((a, b) => String(a.timestamp ?? a.createdAt).localeCompare(String(b.timestamp ?? b.createdAt)));

    const c = await contato(String(s.contact_id));
    const pessoaId = await pessoaDe(c);

    // código do link na primeira mensagem de entrada (até 3 primeiras)
    let link: any = null;
    let codigoAchado: string | null = null;
    for (const m of msgs.filter((x) => direcaoDaMensagem(x.direction) === "entrada").slice(0, 3)) {
      for (const cod of extrairCodigos(m.text)) {
        if (porCodigo.has(cod)) {
          link = porCodigo.get(cod);
          codigoAchado = cod;
          break;
        }
      }
      if (link) break;
    }

    const primeira = msgs[0];
    const ultima = msgs[msgs.length - 1];
    const { data: conv, error: eConv } = await supabase
      .from("conversas")
      .upsert(
        {
          client_id: clientId, pessoa_id: pessoaId, provider: "wts", canal: "whatsapp", externo_id: sid,
          iniciada_em: primeira.timestamp ?? primeira.createdAt, ultima_msg_em: ultima.timestamp ?? ultima.createdAt, codigo_ref: codigoAchado,
        },
        { onConflict: "client_id,provider,externo_id" },
      )
      .select("id")
      .single();
    if (eConv || !conv) {
      r.erros.push(`conversa ${sid.slice(0, 8)}: ${eConv?.message ?? "sem id"}`);
      return;
    }

    const linhas = msgs.map((m) => {
      const d = direcaoDaMensagem(m.direction);
      r.valoresVistos.direcao[`${String(m.direction)}→${d}`] = (r.valoresVistos.direcao[`${String(m.direction)}→${d}`] ?? 0) + 1;
      r.valoresVistos.tipo[String(m.type)] = (r.valoresVistos.tipo[String(m.type)] ?? 0) + 1;
      r.valoresVistos.origem[String(m.origin)] = (r.valoresVistos.origem[String(m.origin)] ?? 0) + 1;
      return {
        conversa_id: conv.id,
        client_id: clientId,
        direcao: d,
        autor: d === "saida" ? "Clínica" : d === "entrada" ? "Paciente" : "Sistema",
        texto: (typeof m.text === "string" && m.text) || (typeof m.details?.transcription === "string" && m.details.transcription) || null,
        tipo: String(m.type ?? "texto").toLowerCase(),
        enviada_em: m.timestamp ?? m.createdAt,
        externo_id: String(m.id),
      };
    });
    for (let i = 0; i < linhas.length; i += 200) {
      const { error: eM } = await supabase.from("mensagens").upsert(linhas.slice(i, i + 200), { onConflict: "conversa_id,externo_id" });
      if (eM) r.erros.push(`mensagens ${sid.slice(0, 8)}: ${eM.message}`);
    }
    r.mensagens += linhas.length;

    if (pessoaId) {
      const primeiraEntrada = msgs.find((x) => direcaoDaMensagem(x.direction) === "entrada") ?? primeira;
      await supabase.from("toques").upsert(
        {
          client_id: clientId, pessoa_id: pessoaId, tipo: "mensagem_whatsapp", origem_tipo: link?.tipo ?? null, link_id: link?.id ?? null,
          instagram_post_id: link?.instagram_post_id ?? null, ad_campaign_id: link?.ad_campaign_id ?? null,
          ocorreu_em: primeiraEntrada.timestamp ?? primeiraEntrada.createdAt, fonte: "wts", externo_id: sid, utm: {},
        },
        { onConflict: "client_id,fonte,externo_id", ignoreDuplicates: true },
      );
    }
    if (link) r.comCodigo++;
    r.sessoes++;
  }

  // Concorrência 5, dentro do orçamento de tempo.
  const fila = pendentes.slice(0, limite);
  let cursor = 0;
  async function trabalhador() {
    while (cursor < fila.length && Date.now() < fim) {
      const s = fila[cursor++];
      try {
        await processar(s);
      } catch (e) {
        r.erros.push(`${String(s.session_id).slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
      }
    }
  }
  await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador(), trabalhador()]);
  return r;
}
