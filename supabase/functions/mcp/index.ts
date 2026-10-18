/**
 * Doctor Creator MCP Server (MVP, só leitura). Transporte Streamable HTTP sem sessão (POST com JSON-RPC, resposta
 * em JSON). Autenticação: OAuth 2.1 do próprio Supabase Auth (PKCE, descoberta e cadastro dinâmico de clientes); o
 * token é o JWT da pessoa, então as regras de acesso (RLS) do Hub valem em toda consulta: ninguém vê clínica que não
 * pode ver no Hub. Só aceita token emitido por OAuth (claim client_id), para que revogar o acesso no Hub corte o
 * assistente. Cada chamada fica em mcp_chamadas. Nenhuma ferramenta escreve nada; nenhuma devolve dado de paciente.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.3";
import { FERRAMENTAS, VERSOES, claims, erro, periodo, resposta, validarArgumentos, type Rpc } from "./protocolo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BASE = `${SUPABASE_URL}/functions/v1/mcp`;
const LIMITE_POR_MINUTO = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors, ...extra } });

const metadados = () => ({
  resource: BASE,
  authorization_servers: [`${SUPABASE_URL}/auth/v1`],
  bearer_methods_supported: ["header"],
  resource_name: "Doctor Creator Hub",
  resource_documentation: "https://dash.doctorcreator.com.br/assistentes-ia",
});
const naoAutorizado = (msg: string) =>
  json({ error: "unauthorized", error_description: msg }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource"`,
  });

// ---------- dados ----------

type Ctx = { db: SupabaseClient; clinica: { id: string; nome: string }; de: string; ate: string };

async function sincronizacao(db: SupabaseClient, clinica: string, fonte: string) {
  const { data } = await db.from("sync_status").select("last_success_at, data_ate").eq("client_id", clinica).eq("fonte", fonte).maybeSingle();
  return data ? { ultima_sincronizacao: data.last_success_at, dados_ate: data.data_ate } : { ultima_sincronizacao: null, dados_ate: null };
}

async function rpc(db: SupabaseClient, nome: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(nome, args);
  if (error) throw new Error(`${nome}: ${error.message}`);
  return Array.isArray(data) && data.length === 1 && typeof data[0] === "object" ? data[0] : data;
}

async function posts(c: Ctx) {
  const { data, error } = await c.db.from("instagram_posts")
    .select("format, tema, reach, saved, shares, likes, comments, engagement, posted_at, permalink")
    .eq("client_id", c.clinica.id).gte("posted_at", c.de).lte("posted_at", `${c.ate}T23:59:59`).limit(1000);
  if (error) throw new Error(`instagram_posts: ${error.message}`);
  return (data ?? []) as { format: string | null; tema: string | null; reach: number | null; saved: number | null; shares: number | null; likes: number | null; comments: number | null; engagement: number | null; posted_at: string; permalink: string | null }[];
}
const soma = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

const EXECUTAR: Record<string, (c: Ctx, args: Record<string, unknown>) => Promise<unknown>> = {
  async get_instagram_overview(c) {
    const ps = await posts(c);
    const alcance = soma(ps.map((p) => p.reach));
    const eng = soma(ps.map((p) => p.engagement));
    return {
      origem: "Instagram (posts sincronizados no Hub)", ...(await sincronizacao(c.db, c.clinica.id, "instagram")),
      dados: { posts: ps.length, alcance_total: alcance, salvos: soma(ps.map((p) => p.saved)), compartilhamentos: soma(ps.map((p) => p.shares)), curtidas: soma(ps.map((p) => p.likes)), comentarios: soma(ps.map((p) => p.comments)), engajamento_por_alcance_pct: alcance ? Math.round((1000 * eng) / alcance) / 10 : null },
      aviso: ps.length < 8 ? "Menos de 8 posts no período: amostra pequena para conclusões." : null,
    };
  },
  async list_top_performing_content(c, args) {
    const ps = (await posts(c)).sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0)).slice(0, (args.limite as number) ?? 5);
    return { origem: "Instagram (posts sincronizados no Hub)", ...(await sincronizacao(c.db, c.clinica.id, "instagram")), dados: ps.map((p) => ({ data: p.posted_at.slice(0, 10), formato: p.format, tema: p.tema, alcance: p.reach, salvos: p.saved, compartilhamentos: p.shares, engajamento: p.engagement, link: p.permalink })), aviso: ps.length ? null : "Nenhum post no período." };
  },
  async get_content_performance(c) {
    const por = new Map<string, { n: number; alcance: number; eng: number; salvos: number }>();
    for (const p of await posts(c)) {
      const g = por.get(p.format ?? "outro") ?? { n: 0, alcance: 0, eng: 0, salvos: 0 };
      g.n++; g.alcance += p.reach ?? 0; g.eng += p.engagement ?? 0; g.salvos += p.saved ?? 0;
      por.set(p.format ?? "outro", g);
    }
    return { origem: "Instagram (posts sincronizados no Hub)", ...(await sincronizacao(c.db, c.clinica.id, "instagram")), dados: [...por.entries()].map(([formato, g]) => ({ formato, posts: g.n, alcance_medio: Math.round(g.alcance / g.n), salvos_medio: Math.round(g.salvos / g.n), engajamento_por_alcance_pct: g.alcance ? Math.round((1000 * g.eng) / g.alcance) / 10 : null, amostra_suficiente: g.n >= 8 })) };
  },
  async get_marketing_campaigns(c) {
    const [resumo, objetivos] = await Promise.all([
      rpc(c.db, "ads_resumo", { p_client_id: c.clinica.id, p_start: c.de, p_end: c.ate }),
      rpc(c.db, "ads_por_objetivo", { p_client_id: c.clinica.id, p_start: c.de, p_end: c.ate }),
    ]);
    return { origem: "Meta Ads", ...(await sincronizacao(c.db, c.clinica.id, "anuncios")), dados: { resumo, por_objetivo: objetivos } };
  },
  async get_conversion_funnel(c) {
    return { origem: "CRM + WhatsApp + anúncios (jornada do Hub)", ...(await sincronizacao(c.db, c.clinica.id, "crm")), dados: await rpc(c.db, "jornada_funil", { p_client: c.clinica.id, p_de: c.de, p_ate: c.ate }) };
  },
  async get_appointment_metrics(c) {
    const a = (await rpc(c.db, "auditoria_comercial", { p_client: c.clinica.id, p_de: c.de, p_ate: c.ate })) as Record<string, any> | null;
    const emJogo = await rpc(c.db, "receita_em_jogo", { p_client: c.clinica.id, p_de: c.de, p_ate: c.ate }).catch(() => null);
    // Só agregados: a lista de resgate e os exemplos (nomes e trechos de conversa) ficam fora.
    return {
      origem: "Conversas do WhatsApp lidas pela IA do Hub", ...(await sincronizacao(c.db, c.clinica.id, "atendimento")),
      dados: a ? { conversas_periodo: a.conversas_periodo, lidas_pela_ia: a.lidas, funil: a.funil, objecoes: a.objecoes, falhas: a.falhas, origem: a.origem, nota_media_atendimento: a.nota_media, em_jogo: emJogo } : null,
      aviso: !a || !a.lidas ? "Nenhuma conversa lida pela IA no período." : null,
    };
  },
  async get_brand_brain_summary(c) {
    const { data, error } = await c.db.from("brain_itens").select("memoria, chave, valor, decidido_em").eq("client_id", c.clinica.id).eq("estado", "aprovado").order("memoria");
    if (error) throw new Error(`brain_itens: ${error.message}`);
    return { origem: "Brand Brain (só itens aprovados pela equipe)", dados: data ?? [], aviso: data?.length ? null : "Nenhum item aprovado no Brand Brain desta clínica." };
  },
  async get_growth_recommendations(c) {
    const [exp, origem, emJogo, a] = await Promise.all([
      rpc(c.db, "experimento_atual", { p_client: c.clinica.id }).catch(() => null),
      rpc(c.db, "conversao_por_origem", { p_client: c.clinica.id, p_de: c.de, p_ate: c.ate }).catch(() => null),
      rpc(c.db, "receita_em_jogo", { p_client: c.clinica.id, p_de: c.de, p_ate: c.ate }).catch(() => null),
      rpc(c.db, "auditoria_comercial", { p_client: c.clinica.id, p_de: c.de, p_ate: c.ate }).catch(() => null) as Promise<Record<string, any> | null>,
    ]);
    const falhas = a?.falhas ? Object.entries(a.falhas as Record<string, number>).sort((x, y) => y[1] - x[1]).slice(0, 3) : [];
    return {
      origem: "Auditoria comercial, experimento da semana e origem dos agendamentos (Hub)",
      dados: { falhas_mais_frequentes: falhas.map(([falha, n]) => ({ falha, conversas: n })), experimento_da_semana: exp, de_onde_vem_quem_agenda: origem, em_jogo: emJogo },
      aviso: "Recomendações são para a equipe decidir; nada é executado automaticamente.",
    };
  },
};

// ---------- servidor ----------

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method === "GET" && url.pathname.endsWith("/.well-known/oauth-protected-resource")) return json(metadados());
  if (req.method === "GET") return json({ error: "use POST com JSON-RPC (Streamable HTTP, sem sessão)" }, 405, { Allow: "POST" });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return naoAutorizado("token ausente");
  const cl = claims(token);
  if (!cl?.client_id) return naoAutorizado("use o login OAuth do Doctor Creator (token sem client_id)");
  const auth = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: u, error: eU } = await auth.auth.getUser(token);
  if (eU || !u?.user) return naoAutorizado("token inválido ou expirado");
  const userId = u.user.id;
  const oauthClient = String(cl.client_id);
  const db = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const servico = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  let msg: Rpc | Rpc[];
  try { msg = await req.json(); } catch { return json(erro(null, -32700, "JSON inválido"), 400); }
  const lote = Array.isArray(msg) ? msg : [msg];
  const saidas: unknown[] = [];

  for (const m of lote) {
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") { saidas.push(erro(m?.id, -32600, "requisição inválida")); continue; }
    const notificacao = m.id === undefined;
    if (m.method === "initialize") {
      const pedida = m.params?.protocolVersion;
      saidas.push(resposta(m.id, {
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "doctor-creator", title: "Doctor Creator Hub", version: "0.1.0" },
        instructions: "Ferramentas só de leitura sobre as clínicas que você pode ver no Doctor Creator Hub. Comece por listar_clinicas. Datas em AAAA-MM-DD; padrão: últimos 30 dias. Números agregados, sem dados de pacientes.",
      }));
      continue;
    }
    if (m.method.startsWith("notifications/")) continue;
    if (m.method === "ping") { saidas.push(resposta(m.id, {})); continue; }
    if (m.method === "tools/list") { saidas.push(resposta(m.id, { tools: FERRAMENTAS })); continue; }
    if (m.method !== "tools/call") { if (!notificacao) saidas.push(erro(m.id, -32601, `método não suportado: ${m.method}`)); continue; }

    const nome = String(m.params?.name ?? "");
    const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
    const inicio = Date.now();
    const registrar = (ok: boolean, e: string | null) =>
      servico.from("mcp_chamadas").insert({ user_id: userId, oauth_client_id: oauthClient, ferramenta: nome.slice(0, 60), client_id: typeof args.clinica_id === "string" && /^[0-9a-f-]{36}$/i.test(args.clinica_id) ? args.clinica_id : null, ok, erro: e?.slice(0, 300) ?? null, ms: Date.now() - inicio });

    const { count } = await servico.from("mcp_chamadas").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("em", new Date(Date.now() - 60_000).toISOString());
    if ((count ?? 0) >= LIMITE_POR_MINUTO) { await registrar(false, "limite por minuto"); saidas.push(erro(m.id, -32000, `limite de ${LIMITE_POR_MINUTO} chamadas por minuto atingido`)); continue; }

    const invalido = validarArgumentos(nome, args);
    if (invalido) { await registrar(false, invalido); saidas.push(resposta(m.id, { isError: true, content: [{ type: "text", text: invalido }] })); continue; }

    try {
      let resultado: unknown;
      if (nome === "listar_clinicas") {
        const { data, error } = await db.from("clients").select("id, name").eq("active", true).order("name");
        if (error) throw new Error(error.message);
        resultado = { dados: (data ?? []).map((c: { id: string; name: string }) => ({ id: c.id, nome: c.name })) };
      } else {
        const { data: clin } = await db.from("clients").select("id, name").eq("id", args.clinica_id as string).maybeSingle();
        if (!clin) throw new Error("clínica não encontrada ou sem acesso para esta conta");
        const { de, ate } = periodo(args);
        resultado = { clinica: { id: clin.id, nome: clin.name }, periodo: { de, ate }, ...((await EXECUTAR[nome]({ db, clinica: { id: clin.id, nome: clin.name }, de, ate }, args)) as object) };
      }
      await registrar(true, null);
      saidas.push(resposta(m.id, { content: [{ type: "text", text: JSON.stringify(resultado) }], structuredContent: resultado }));
    } catch (e) {
      const texto = e instanceof Error ? e.message : String(e);
      await registrar(false, texto);
      saidas.push(resposta(m.id, { isError: true, content: [{ type: "text", text: texto }] }));
    }
  }

  if (!saidas.length) return new Response(null, { status: 202, headers: cors });
  return json(Array.isArray(msg) ? saidas : saidas[0]);
});
