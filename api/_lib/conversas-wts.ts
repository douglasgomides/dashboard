/**
 * Conversas do WhatsApp (WTS Chat) dentro do dashboard.
 *
 * Para cada sessão já sincronizada em wts_sessions: busca as mensagens, busca o contato (telefone) e grava
 *  - pessoa (pelo telefone), conversa e mensagens
 *  - o toque "mensagem_whatsapp", ligado ao link rastreado quando a primeira mensagem do paciente traz o código
 *  - com o código: conversas.link_id (atribuição "ref") e o toque "clique_link" da pessoa, para a jornada e o funil
 *
 * Conversa é dado de saúde: a leitura pelo dashboard passa só pelas funções listar_conversas/ler_mensagens
 * (acesso restrito e registrado). Aqui é só escrita, com a service role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { codigosNaMensagem } from "../../src/lib/rastreio.js";
import { registrarToqueLink } from "./redirecionar.js";
import { fetchComRetry } from "./integration-http.js";

const BASE = "https://api.wts.chat";
let ultimoCarimboMicros = 0;

function carimboConferencia(): string {
  // Postgres keeps microseconds. Separate attempts started in the same JS millisecond as well.
  const micros = Math.max(Date.now() * 1000 + Number((process.hrtime.bigint() / 1000n) % 1000n), ultimoCarimboMicros + 1);
  ultimoCarimboMicros = micros;
  return new Date(Math.floor(micros / 1000)).toISOString().replace("Z", `${String(micros % 1000).padStart(3, "0")}Z`);
}

async function wtsGet(token: string, caminho: string): Promise<any> {
  // 429/5xx/rede: espera (Retry-After, com teto) e tenta de novo, até 3 vezes.
  const r = await fetchComRetry(`${BASE}${caminho}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, { timeoutMs: 25_000, baseMs: 800 });
  if (r.ok) return r.json();
  if (r.status === 429 || r.status >= 500) throw new Error(`WTS ${caminho.split("?")[0]} indisponível`);
  throw new Error(`WTS ${caminho.split("?")[0]} respondeu ${r.status}`);
}

export function direcaoDaMensagem(d: unknown): "entrada" | "saida" | "sistema" {
  const x = String(d ?? "").toLowerCase();
  // WTS (conferido numa conversa real): FROM_HUB = veio do paciente; TO_HUB = a clínica/bot enviou ao paciente.
  if (/from_hub|fromhub/.test(x)) return "entrada";
  if (/to_hub|tohub/.test(x)) return "saida";
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
  comAnuncio?: number;
  restantes: number;
  erros: string[];
  valoresVistos: Record<string, Record<string, number>>;
};

/** Active cases must be checked even when the session's own metadata did not change. */
export async function conversasAtivasParaConferir(db: SupabaseClient<any, any, any>, clientId: string, provider: string) {
  const ids: string[] = [];
  for (let de = 0; ; ) {
    const { data, error } = await db.from("operacao_recuperacao").select("conversa_id").eq("client_id", clientId)
      .not("estado", "in", "(resolvida,cancelada)").order("id").range(de, de + 999);
    if (error) throw new Error("Não foi possível consultar os casos ativos.");
    if (!data?.length) break;
    ids.push(...data.map((r: any) => String(r.conversa_id)));
    de += data.length;
  }
  const conversas: { id: string; externo_id: string; iniciada_em: string | null; ultima_msg_em: string | null; mensagens_conferencia_em: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await db.from("conversas").select("id, externo_id, iniciada_em, ultima_msg_em, mensagens_conferencia_em")
      .eq("client_id", clientId).eq("provider", provider).in("id", ids.slice(i, i + 300));
    if (error) throw new Error("Não foi possível consultar as conversas dos casos ativos.");
    conversas.push(...(data ?? []));
  }
  return conversas.sort((a, b) => (a.mensagens_conferencia_em ?? "").localeCompare(b.mensagens_conferencia_em ?? "") || a.id.localeCompare(b.id));
}

/** Invalidate prior coverage before requesting messages; never advance the success stamp on a failed attempt. */
export async function iniciarConferenciaMensagens(db: SupabaseClient<any, any, any>, clientId: string, provider: string, externoId: string) {
  const em = carimboConferencia();
  const { data, error } = await db.from("conversas").upsert({
    client_id: clientId, provider, externo_id: externoId, canal: "whatsapp", mensagens_conferencia_em: em, mensagens_cobertura: "parcial",
  }, { onConflict: "client_id,provider,externo_id" }).select("id").single();
  if (error || !data?.id) throw new Error("Não foi possível iniciar a conferência das mensagens.");
  return { id: String(data.id), em };
}

export async function finalizarConferenciaMensagens(db: SupabaseClient<any, any, any>, clientId: string, tentativa: { id: string; em: string }, cobertura: "completa" | "parcial" | "erro") {
  const patch: Record<string, string> = { mensagens_cobertura: cobertura };
  if (cobertura === "completa") patch.mensagens_conferidas_em = new Date().toISOString();
  const { error } = await db.from("conversas").update(patch).eq("client_id", clientId).eq("id", tentativa.id).eq("mensagens_conferencia_em", tentativa.em);
  if (error) throw new Error("Não foi possível registrar a cobertura das mensagens.");
}

// Origem de anúncio (clique para WhatsApp): a Meta manda junto da 1ª mensagem um "referral" com o id do anúncio
// (source_id), ctwa_clid, título e link. A doc oficial da Helena (helena.readme.io, GET /chat/v1/session/{id}/message,
// lida em 01/11/2026) mostra onde isso vem: `details.utm` (PublicUtmDTO) com `sourceId, source, clid, medium, campaign,
// content, headline, term, referralUrl`. Por isso `clid` (o ctwa_clid) e `referralUrl` (o link do anúncio) também contam.
// A busca continua por nome de chave em qualquer lugar do JSON das 3 primeiras mensagens, para não depender do caminho.
const CHAVE_ANUNCIO = /^(referral|ctwa_?clid|clid|source_?id|sourceid|ad_?id|adid|headline|source_?url|sourceurl|referral_?url|source_?type|campaign_?id)$/i;
export function acharOrigemAnuncio(msgs: any[]): { ad_id: string | null; campaign_id: string | null; ctwa_clid: string | null; headline: string | null; source_url: string | null; bruto: Record<string, unknown> } | null {
  const achado: Record<string, unknown> = {};
  const visitar = (v: any, d: number) => {
    if (!v || typeof v !== "object" || d > 6) return;
    for (const [k, x] of Object.entries(v)) {
      if (CHAVE_ANUNCIO.test(k) && x != null && x !== "") achado[k] = typeof x === "object" ? x : String(x);
      if (typeof x === "object") visitar(x, d + 1);
    }
  };
  for (const m of msgs.slice(0, 3)) visitar(m, 0);
  if (!Object.keys(achado).length) return null;
  const pega = (re: RegExp) => {
    for (const [k, v] of Object.entries(achado)) if (re.test(k) && typeof v === "string") return v;
    const ref = achado.referral as Record<string, unknown> | undefined;
    if (ref && typeof ref === "object") for (const [k, v] of Object.entries(ref)) if (re.test(k) && v != null) return String(v);
    return null;
  };
  return {
    ad_id: pega(/^(source_?id|sourceid|ad_?id|adid)$/i),
    campaign_id: pega(/^campaign_?id$/i),
    ctwa_clid: pega(/^(ctwa_?clid|clid)$/i),
    headline: pega(/^headline$/i),
    source_url: pega(/^(source_?url|sourceurl|referral_?url)$/i),
    bruto: achado,
  };
}

export async function ingerirConversasWts(
  supabase: SupabaseClient<any, any, any>,
  tokenPrincipal: string,
  clientId: string,
  opts: { limite?: number; orcamentoMs?: number; dias?: number; refazer?: boolean; tokensExtras?: string[] } = {},
): Promise<ResultadoConversas> {
  // Alguns clientes (ex.: Sergio) têm as sessões listadas pelo token do servidor, mas as mensagens só aparecem com o
  // token da própria conta. Testa na ordem e guarda o que funcionou.
  const tokens = [tokenPrincipal, ...(opts.tokensExtras ?? [])];
  let tokenAtivo = tokenPrincipal;
  const limite = opts.limite ?? 120;
  const fim = Date.now() + (opts.orcamentoMs ?? 150_000);
  const r: ResultadoConversas = { sessoes: 0, mensagens: 0, pessoas: 0, comCodigo: 0, restantes: 0, erros: [], valoresVistos: { direcao: {}, tipo: {}, origem: {}, chaves: {} } };

  // Sessões candidatas: as mais novas primeiro.
  // O PostgREST devolve no máximo 1000 linhas por chamada: pagina até acabar.
  const sessoes: any[] = [];
  const desde = opts.dias ? new Date(Date.now() - opts.dias * 86_400_000).toISOString() : null;
  let sessoesCompletas = false;
  for (let de = 0; de < 20_000; de += 1000) {
    let q = supabase.from("wts_sessions").select("session_id, contact_id, started_at, updated_at").eq("client_id", clientId).not("contact_id", "is", null).order("started_at", { ascending: false }).order("session_id").range(de, de + 999);
    if (desde) q = q.gte("started_at", desde);
    const { data: pag, error } = await q;
    if (error) {
      r.erros.push(`wts_sessions: ${error.message}`);
      return r;
    }
    sessoes.push(...(pag ?? []));
    if ((pag ?? []).length < 1000) { sessoesCompletas = true; break; }
  }
  if (!sessoesCompletas) { r.erros.push("Lista de sessões incompleta: limite de paginação atingido"); return r; }
  const ids = sessoes.map((s: any) => String(s.session_id));
  const existentes = new Map<string, string>();
  const cobertura = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data: ex, error } = await supabase.from("conversas").select("externo_id, ultima_msg_em, mensagens_cobertura").eq("client_id", clientId).eq("provider", "wts").in("externo_id", ids.slice(i, i + 300));
    if (error) { r.erros.push("Não foi possível consultar as conversas existentes."); return r; }
    for (const e of ex ?? []) { existentes.set(e.externo_id, e.ultima_msg_em ?? ""); cobertura.set(e.externo_id, e.mensagens_cobertura); }
  }
  // Novas sempre; as já gravadas só se a sessão mudou depois da última mensagem conhecida.
  // Sem conversa gravada primeiro (senão as sessões recentes que só mudaram de estado ocupam todo o lote e as antigas
  // nunca chegam). Depois, as já gravadas que mudaram depois da última mensagem, só se mudaram nos últimos 3 dias.
  const limiteMudanca = Date.now() - 3 * 86_400_000;
  const novas = sessoes.filter((s: any) => existentes.get(String(s.session_id)) === undefined);
  const mudaram = sessoes.filter((s: any) => {
    const ult = existentes.get(String(s.session_id));
    if (ult === undefined) return false;
    if (opts.refazer || cobertura.get(String(s.session_id)) !== "completa") return true;
    const up = s.updated_at ? new Date(s.updated_at).getTime() : 0;
    return !!ult && up > new Date(ult).getTime() + 60_000 && up >= limiteMudanca;
  });
  let ativas;
  try { ativas = await conversasAtivasParaConferir(supabase, clientId, "wts"); }
  catch { r.erros.push("Não foi possível priorizar as conversas dos casos ativos."); return r; }
  const porSessao = new Map(sessoes.map((s: any) => [String(s.session_id), s]));
  const prioritarias = ativas.map((c) => porSessao.get(c.externo_id) ?? { session_id: c.externo_id, contact_id: null, started_at: c.iniciada_em, updated_at: c.ultima_msg_em });
  const pendentes = [...new Map([...prioritarias, ...novas, ...mudaram].map((s: any) => [String(s.session_id), s])).values()];

  // Códigos dos links rastreados deste cliente (casam com a primeira mensagem do paciente).
  const { data: links, error: erroLinks } = await supabase.from("links_rastreados").select("id, codigo_ref, tipo, instagram_post_id, ad_campaign_id").eq("client_id", clientId);
  if (erroLinks) { r.erros.push(`links rastreados: ${erroLinks.message}`); return r; }
  const porCodigo = new Map<string, any>((links ?? []).map((l: any) => [String(l.codigo_ref).toUpperCase(), l]));

  const contatos = new Map<string, Contato | null>();
  async function contato(id: string): Promise<Contato | null> {
    if (contatos.has(id)) return contatos.get(id) ?? null;
    try {
      const c = await wtsGet(tokenAtivo, `/core/v1/contact/${encodeURIComponent(id)}`);
      const v: Contato = { phone: c.phoneNumber ?? null, nome: c.name ?? c.nameWhatsapp ?? null, email: c.email ?? null, instagram: typeof c.instagram === "string" ? c.instagram : null };
      contatos.set(id, v);
      return v;
    } catch (e) { throw new Error(`contato WTS: ${e instanceof Error ? e.message : String(e)}`); }
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
    const { data: ex, error: erroPessoa } = await supabase.from("pessoas").select("id").eq("client_id", clientId).eq("telefone_chave", k).maybeSingle();
    if (erroPessoa) throw new Error(`pessoa: ${erroPessoa.message}`);
    if (ex?.id) return ex.id;
    const { data: novo, error: e } = await supabase
      .from("pessoas")
      .insert({ client_id: clientId, telefone: c.phone, telefone_chave: k, nome: c.nome, email: c.email, ig_username: c.instagram, primeiro_toque_em: new Date().toISOString() })
      .select("id")
      .single();
    if (e) {
      if (e.code !== "23505") throw new Error(`pessoa: ${e.message}`);
      const { data: de, error: erroRever } = await supabase.from("pessoas").select("id").eq("client_id", clientId).eq("telefone_chave", k).maybeSingle();
      if (erroRever || !de?.id) throw new Error(`pessoa: ${e.message}`);
      return de.id;
    }
    r.pessoas++;
    return novo?.id ?? null;
  }

  async function processar(s: any) {
    const sid = String(s.session_id);
    const tentativa = await iniciarConferenciaMensagens(supabase, clientId, "wts", sid);
    let terminada = false;
    try {
    let msgs: any[] = [];
    let completa = false;
    let falhou = false;
    const ordem = [tokenAtivo, ...tokens.filter((t) => t !== tokenAtivo)];
    for (const tk of ordem) {
      const recebidas: any[] = [];
      let todas = false;
      try {
        for (let pagina = 1; pagina <= 8; pagina++) {
          if (Date.now() >= fim) break;
          const j = await wtsGet(tk, `/chat/v1/session/${encodeURIComponent(sid)}/message?PageSize=100&PageNumber=${pagina}`);
          if (!Array.isArray(j?.items)) throw new Error("Formato de mensagens não confirmado.");
          recebidas.push(...j.items);
          if (j.hasMorePages === false) { todas = true; break; }
          if (j.hasMorePages !== true) break;
        }
      } catch {
        falhou = true;
      }
      if (recebidas.length > msgs.length || (todas && recebidas.length > 0)) msgs = recebidas;
      if (todas && recebidas.length > 0) {
        completa = true;
        falhou = false;
        tokenAtivo = tk;
        break;
      }
    }
    if (msgs.length === 0) {
      await finalizarConferenciaMensagens(supabase, clientId, tentativa, falhou ? "erro" : "parcial");
      terminada = true;
      r.erros.push(`mensagens ${sid.slice(0, 8)}: ${falhou ? "consulta indisponível" : "nenhuma mensagem visível; cobertura não confirmada"}`);
      return;
    }
    const validas = msgs.filter((m) => m && m.id != null && String(m.id).trim() && Number.isFinite(Date.parse(m.timestamp ?? m.createdAt)));
    if (validas.length !== msgs.length || new Set(validas.map((m) => String(m.id))).size !== validas.length) completa = false;
    msgs = validas;
    if (!msgs.length) throw new Error("Mensagens sem identificador ou data válidos.");
    msgs.sort((a, b) => String(a.timestamp ?? a.createdAt).localeCompare(String(b.timestamp ?? b.createdAt)));

    const c = s.contact_id ? await contato(String(s.contact_id)) : null;
    const pessoaId = await pessoaDe(c);

    // código do link na primeira mensagem de entrada (até 3 primeiras)
    let link: any = null;
    let codigoAchado: string | null = null;
    for (const m of msgs.filter((x) => direcaoDaMensagem(x.direction) === "entrada").slice(0, 3)) {
      for (const cod of codigosNaMensagem(m.text)) {
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
      .update(
        {
          ...(pessoaId ? { pessoa_id: pessoaId } : {}),
          iniciada_em: primeira.timestamp ?? primeira.createdAt, ultima_msg_em: ultima.timestamp ?? ultima.createdAt, ...(codigoAchado ? { codigo_ref: codigoAchado, link_id: link.id, atribuicao: "ref" } : {}),
        },
      )
      .eq("client_id", clientId).eq("id", tentativa.id).eq("mensagens_conferencia_em", tentativa.em)
      .select("id")
      .maybeSingle();
    if (eConv) {
      r.erros.push(`conversa ${sid.slice(0, 8)}: ${eConv.message}`);
      await finalizarConferenciaMensagens(supabase, clientId, tentativa, "erro");
      terminada = true;
      return;
    }
    if (!conv) { terminada = true; return; } // A newer request owns this conversation now.

    // Veio de anúncio? Guarda o que a Meta mandou (id do anúncio etc.) para cruzar anúncio → conversa → lead.
    const entradas = msgs.filter((x) => direcaoDaMensagem(x.direction) === "entrada");
    const origem = acharOrigemAnuncio(entradas);
    if (origem) {
      const { error: eO } = await supabase.from("conversas_origem_anuncio").upsert({ conversa_id: conv.id, client_id: clientId, ...origem }, { onConflict: "conversa_id" });
      if (eO) { r.erros.push(`origem anúncio ${sid.slice(0, 8)}: ${eO.message}`); falhou = true; }
      else r.comAnuncio = (r.comAnuncio ?? 0) + 1;
    }
    // Nomes dos campos que o WTS devolve na 1ª mensagem do paciente (para saber onde mora a origem do anúncio).
    if (entradas[0] && typeof entradas[0] === "object") {
      for (const k of Object.keys(entradas[0])) r.valoresVistos.chaves[k] = (r.valoresVistos.chaves[k] ?? 0) + 1;
      if (entradas[0].details && typeof entradas[0].details === "object")
        for (const k of Object.keys(entradas[0].details)) r.valoresVistos.chaves[`details.${k}`] = (r.valoresVistos.chaves[`details.${k}`] ?? 0) + 1;
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
      if (eM) { r.erros.push(`mensagens ${sid.slice(0, 8)}: ${eM.message}`); completa = false; falhou = true; }
      else r.mensagens += linhas.slice(i, i + 200).length;
    }
    if (pessoaId) {
      const primeiraEntrada = msgs.find((x) => direcaoDaMensagem(x.direction) === "entrada") ?? primeira;
      const { error: eToque } = await supabase.from("toques").upsert(
        {
          client_id: clientId, pessoa_id: pessoaId, tipo: "mensagem_whatsapp", origem_tipo: link?.tipo ?? null, link_id: link?.id ?? null,
          instagram_post_id: link?.instagram_post_id ?? null, ad_campaign_id: link?.ad_campaign_id ?? null,
          ocorreu_em: primeiraEntrada.timestamp ?? primeiraEntrada.createdAt, fonte: "wts", externo_id: sid, utm: {},
        },
        { onConflict: "client_id,fonte,externo_id", ignoreDuplicates: true },
      );
      if (eToque) { r.erros.push(`toque ${sid.slice(0, 8)}: ${eToque.message}`); falhou = true; }
      if (link) {
        const eLink = await registrarToqueLink(supabase, { clientId, conversaId: conv.id, pessoaId, link, em: primeiraEntrada.timestamp ?? primeiraEntrada.createdAt, como: "ref" });
        if (eLink) { r.erros.push(`toque do link ${sid.slice(0, 8)}: ${eLink}`); falhou = true; }
      }
    }
    await finalizarConferenciaMensagens(supabase, clientId, tentativa, falhou ? "erro" : completa ? "completa" : "parcial");
    terminada = true;
    if (link) r.comCodigo++;
    if (completa && !falhou) r.sessoes++;
    } finally {
      if (!terminada) await finalizarConferenciaMensagens(supabase, clientId, tentativa, "erro");
    }
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
  try {
    const { error } = await supabase.rpc("vincular_flwchat", { p_client: clientId });
    if (error) r.erros.push("Não foi possível reconciliar os vínculos de pessoas");
  } catch {
    r.erros.push("Não foi possível reconciliar os vínculos de pessoas");
  }
  r.restantes = Math.max(0, pendentes.length - Math.min(cursor, fila.length));
  return r;
}
