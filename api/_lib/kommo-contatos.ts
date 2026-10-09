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
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const r = await fetch(`https://${dominio}${caminho}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    if (r.status === 204) return null;
    if (r.status === 429 || r.status >= 500) {
      await dormir(1200 * (tentativa + 1));
      continue;
    }
    if (!r.ok) throw new Error(`Kommo ${caminho.split("?")[0]} respondeu ${r.status}`);
    return r.json();
  }
  throw new Error(`Kommo ${caminho.split("?")[0]} indisponível`);
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
  const dominio = conn.subdomain.includes(".") ? conn.subdomain : `${conn.subdomain}.kommo.com`;
  const fim = Date.now() + (opts.orcamentoMs ?? 240_000);
  let pagina = opts.pagina ?? 1;
  let restantes = opts.paginas ?? 20;
  const r: ResultadoContatosKommo = { paginasLidas: 0, leads: 0, comContato: 0, comTelefone: 0, comEmail: 0, gravados: 0, proximaPagina: pagina, erros: [] };

  while (restantes > 0 && Date.now() < fim) {
    let corpo: any;
    try {
      corpo = await kommoGet(dominio, conn.access_token, `/api/v4/leads?with=contacts&limit=${PAGE}&page=${pagina}`);
    } catch (e) {
      r.erros.push(e instanceof Error ? e.message : String(e));
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
    for (let i = 0; i < ids.length; i += LOTE_CONTATOS) {
      const filtro = ids.slice(i, i + LOTE_CONTATOS).map((id) => `filter[id][]=${id}`).join("&");
      try {
        const cc = await kommoGet(dominio, conn.access_token, `/api/v4/contacts?limit=${PAGE}&${filtro}`);
        for (const c of (cc?._embedded?.contacts ?? []) as Contato[]) {
          dados.set(c.id, { phone: campo(c, "PHONE"), email: campo(c, "EMAIL"), nome: c.name?.trim() || null });
        }
      } catch (e) {
        r.erros.push(e instanceof Error ? e.message : String(e));
      }
      await dormir(180);
    }

    const linhas: Record<string, unknown>[] = [];
    for (const l of leads) {
      const cid = contatoDoLead.get(l.id);
      if (!cid) continue;
      r.comContato++;
      const d = dados.get(cid);
      if (!d) continue;
      if (d.phone) r.comTelefone++;
      if (d.email) r.comEmail++;
      if (!d.phone && !d.email && !d.nome) continue;
      const linha: Record<string, unknown> = {
        crm_connection_id: conn.id,
        client_id: conn.client_id,
        provider: "kommo",
        external_lead_id: String(l.id),
        event_type: "sync",
      };
      if (d.phone) linha.contact_phone = d.phone;
      if (d.email) linha.contact_email = d.email;
      if (d.nome) linha.contact_name = d.nome;
      linhas.push(linha);
    }
    for (let i = 0; i < linhas.length; i += 200) {
      const { error } = await supabase.from("crm_leads").upsert(linhas.slice(i, i + 200), { onConflict: "crm_connection_id,external_lead_id" });
      if (error) r.erros.push(`gravar página ${pagina}: ${error.message}`);
      else r.gravados += Math.min(200, linhas.length - i);
    }

    r.paginasLidas++;
    pagina++;
    restantes--;
    r.proximaPagina = leads.length === PAGE ? pagina : null;
    if (leads.length < PAGE) break;
    await dormir(180);
  }
  return r;
}
