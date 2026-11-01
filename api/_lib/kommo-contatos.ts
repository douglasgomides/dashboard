/**
 * Telefone, e-mail e nome dos leads do Kommo.
 *
 * O sync de leads grava só o que vem em /leads (nome do lead, etapa, valor): o telefone mora no CONTATO ligado ao lead.
 * Aqui, para cada página de leads (?with=contacts) pega o contato principal, busca os contatos em lote e grava
 * contact_phone / contact_email / contact_name em crm_leads. Sem telefone o lead não vira "pessoa" (vincular_pessoas),
 * então não liga com Instagram, conversa nem venda.
 *
 * Roda no servidor com o token da própria conexão: o token não sai do banco.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchComRetry, integrationHost, ritmoKommo } from "./integration-http.js";

const PAGE = 250;
const LOTE_CONTATOS = 100;

type ContatoEmbutido = { id: number; is_main?: boolean };
type LeadComContatos = { id: number; _embedded?: { contacts?: ContatoEmbutido[] } };
type CampoContato = { field_code?: string; field_name?: string; values?: { value?: unknown }[] };
type Contato = { id: number; name?: string | null; custom_fields_values?: CampoContato[] | null };

export interface ResultadoContatosKommo {
  paginasLidas: number;
  leads: number;
  comContato: number;
  comTelefone: number;
  comEmail: number;
  gravados: number;
  proximaPagina: number | null;
  erros: string[];
}

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function kommoGet(dominio: string, token: string, caminho: string): Promise<any | null> {
  // Nova tentativa (429/5xx/rede, Retry-After) e ritmo de 6 pedidos/s ficam no helper compartilhado.
  const r = await fetchComRetry(`https://${dominio}${caminho}`, { headers: { Authorization: `Bearer ${token}` } }, { tentativas: 4, baseMs: 1200, ritmo: ritmoKommo(dominio) });
  if (r.status === 204) return null;
  if (r.status === 429 || r.status >= 500) throw new Error(`Kommo ${caminho.split("?")[0]} indisponível`);
  if (!r.ok) throw new Error(`Kommo ${caminho.split("?")[0]} respondeu ${r.status}`);
  return r.json();
}

function campo(c: Contato, codigo: string): string | null {
  const lista = Array.isArray(c.custom_fields_values) ? c.custom_fields_values : [];
  for (const f of lista) {
    if ((f.field_code ?? "").toUpperCase() === codigo) {
      const v = f.values?.find((x) => x?.value != null && String(x.value).trim() !== "")?.value;
      if (v != null) return String(v).trim();
    }
  }
  return null;
}

export async function enriquecerContatosKommo(
  supabase: SupabaseClient<any, any, any>,
  conn: { id: string; client_id: string; subdomain: string; access_token: string },
  opts: { pagina?: number; paginas?: number; orcamentoMs?: number } = {},
): Promise<ResultadoContatosKommo> {
  const dominio = integrationHost(conn.subdomain, "kommo");
  const fim = Date.now() + (opts.orcamentoMs ?? 240_000);
  let pagina = Number.isInteger(opts.pagina) && opts.pagina! > 0 ? opts.pagina! : 1;
  let restantes = Number.isInteger(opts.paginas) && opts.paginas! > 0 ? Math.min(opts.paginas!, 60) : 20;
  const r: ResultadoContatosKommo = { paginasLidas: 0, leads: 0, comContato: 0, comTelefone: 0, comEmail: 0, gravados: 0, proximaPagina: pagina, erros: [] };

  while (restantes > 0 && Date.now() < fim) {
    let corpo: any;
    try {
      corpo = await kommoGet(dominio, conn.access_token, `/api/v4/leads?with=contacts&limit=${PAGE}&page=${pagina}`);
    } catch (e) {
      r.erros.push(e instanceof Error ? e.message : String(e));
      break;
    }
    if (corpo !== null && !Array.isArray(corpo?._embedded?.leads)) {
      r.erros.push("Kommo devolveu página de leads inválida");
      break;
    }
    const leads: LeadComContatos[] = corpo?._embedded?.leads ?? [];
    if (leads.length === 0) {
      r.proximaPagina = null;
      break;
    }
    r.leads += leads.length;

    // contato principal de cada lead (ou o primeiro, se nenhum estiver marcado)
    const contatoDoLead = new Map<number, number>();
    for (const l of leads) {
      const cs = l._embedded?.contacts ?? [];
      const c = cs.find((x) => x.is_main) ?? cs[0];
      if (c) contatoDoLead.set(l.id, c.id);
    }
    const ids = [...new Set(contatoDoLead.values())];
    const dados = new Map<number, { phone: string | null; email: string | null; nome: string | null }>();
    let paginaFalhou = false;
    for (let i = 0; i < ids.length; i += LOTE_CONTATOS) {
      const filtro = ids.slice(i, i + LOTE_CONTATOS).map((id) => `filter[id][]=${id}`).join("&");
      try {
        const cc = await kommoGet(dominio, conn.access_token, `/api/v4/contacts?limit=${PAGE}&${filtro}`);
        if (cc === null || !Array.isArray(cc?._embedded?.contacts)) throw new Error("Kommo devolveu página de contatos incompleta");
        for (const c of (cc?._embedded?.contacts ?? []) as Contato[]) {
          dados.set(c.id, { phone: campo(c, "PHONE"), email: campo(c, "EMAIL"), nome: c.name?.trim() || null });
        }
      } catch (e) {
        paginaFalhou = true;
        r.erros.push(e instanceof Error ? e.message : String(e));
      }
      await dormir(180);
    }

    const linhas: { id: string; phone: string | null; email: string | null; nome: string | null }[] = [];
    for (const l of leads) {
      const cid = contatoDoLead.get(l.id);
      if (!cid) continue;
      r.comContato++;
      const d = dados.get(cid);
      if (!d) continue;
      if (d.phone) r.comTelefone++;
      if (d.email) r.comEmail++;
      if (!d.phone && !d.email && !d.nome) continue;
      linhas.push({ id: String(l.id), phone: d.phone, email: d.email, nome: d.nome });
    }
    // Função do banco que só atualiza as colunas de contato (um upsert exigiria raw_payload e o sobrescreveria).
    for (let i = 0; i < linhas.length; i += 250) {
      const { data, error } = await supabase.rpc("aplicar_contatos_kommo", { p_conn: conn.id, p_linhas: linhas.slice(i, i + 250) });
      if (error) { paginaFalhou = true; r.erros.push(`gravar página ${pagina}: ${error.message}`); }
      else r.gravados += Number(data) || 0;
    }

    if (paginaFalhou) break; // a próxima chamada repete a página com os contatos que faltaram
    r.paginasLidas++;
    pagina++;
    restantes--;
    r.proximaPagina = leads.length === PAGE ? pagina : null;
    if (leads.length < PAGE) break;
    await dormir(180);
  }
  return r;
}

/**
 * Passo automático da reconciliação diária: telefone dos leads do Kommo, algumas páginas por rodada, com o cursor
 * guardado na conexão (config.kommo_contatos_pagina). Antes isso só rodava pelo botão do admin e exigia o token no
 * banco, então a Lana (token só no servidor) nunca teve telefone e a Jornada do Kommo saía zerada (auditoria de
 * 30/10/2026). Ao terminar a volta inteira, liga leads e pessoas (vincular_pessoas) e recomeça depois de 7 dias.
 */
export async function enriquecerContatosKommoPorCursor(
  supabase: SupabaseClient<any, any, any>,
  conexoes: { id: string; client_id: string; subdomain: string | null; access_token: string | null }[],
  tokenPadrao: string | undefined,
  orcamentoMs: number,
): Promise<{ connectionId: string; paginaInicial: number; paginasLidas: number; gravados: number; terminou: boolean; erros: string[] }[]> {
  const fim = Date.now() + orcamentoMs;
  const saida = [];
  const { data: cfgs } = await supabase.from("crm_connections").select("id, config").in("id", conexoes.map((c) => c.id));
  const config = new Map(((cfgs ?? []) as { id: string; config: Record<string, unknown> | null }[]).map((c) => [c.id, c.config ?? {}]));
  // Primeiro a conexão parada há mais tempo.
  const ordem = [...conexoes].sort((a, b) => String(config.get(a.id)?.kommo_contatos_em ?? "").localeCompare(String(config.get(b.id)?.kommo_contatos_em ?? "")));
  for (const conn of ordem) {
    if (Date.now() > fim - 10_000) break;
    const token = conn.access_token || tokenPadrao;
    if (!conn.subdomain || !token) continue;
    const cfg = config.get(conn.id) ?? {};
    const completo = typeof cfg.kommo_contatos_completo_em === "string" ? Date.parse(cfg.kommo_contatos_completo_em) : 0;
    if (cfg.kommo_contatos_pagina == null && completo > Date.now() - 7 * 86_400_000) continue;
    const pagina = Number(cfg.kommo_contatos_pagina) > 0 ? Number(cfg.kommo_contatos_pagina) : 1;
    const r = await enriquecerContatosKommo(supabase, { id: conn.id, client_id: conn.client_id, subdomain: conn.subdomain, access_token: token }, { pagina, paginas: 15, orcamentoMs: Math.max(5_000, fim - Date.now()) });
    const terminou = r.proximaPagina === null;
    if (terminou) {
      const { error } = await supabase.rpc("vincular_pessoas", { p_client: conn.client_id });
      if (error) r.erros.push(`vincular pessoas: ${error.message}`);
    }
    // Conversa ligada a um lead que já tem pessoa herda a pessoa (Jornada do Kommo).
    const { error: eConv } = await supabase.rpc("conversas_pessoa_pelo_lead", { p_client: conn.client_id });
    if (eConv) r.erros.push(`pessoa das conversas: ${eConv.message}`);
    const { data: atual } = await supabase.from("crm_connections").select("config").eq("id", conn.id).single();
    await supabase.from("crm_connections").update({
      config: {
        ...((atual as { config: Record<string, unknown> | null } | null)?.config ?? {}),
        kommo_contatos_pagina: terminou ? null : r.proximaPagina,
        kommo_contatos_em: new Date().toISOString(),
        ...(terminou ? { kommo_contatos_completo_em: new Date().toISOString() } : {}),
      },
    }).eq("id", conn.id);
    saida.push({ connectionId: conn.id, paginaInicial: pagina, paginasLidas: r.paginasLidas, gravados: r.gravados, terminou, erros: r.erros.slice(0, 3) });
  }
  return saida;
}
