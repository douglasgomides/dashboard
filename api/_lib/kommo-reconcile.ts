/**
 * Reconciliação: descobre quais leads sumiram do Kommo.
 *
 * Todos os syncs são insert/upsert — nada some do nosso lado quando some de
 * lá. A Lana apagou milhares de leads no Kommo e o dashboard seguiu mostrando
 * o total antigo. Dado que não existe mais na origem é pior que dado velho,
 * porque parece certo.
 *
 * Não dá para resolver com o sync incremental: ele filtra por
 * filter[updated_at], e apagar um lead não atualiza nada — o registro
 * simplesmente deixa de existir. A única forma de saber é varrer TODOS os ids
 * vivos e comparar com o que temos.
 *
 * A mesma varredura serve para o caminho inverso: lead que existe no Kommo e
 * não existe aqui. O backfill pagina uma lista que muda enquanto é lida (lead
 * que muda de etapa pula de página) e o incremental só olha o que foi atualizado
 * nos últimos dias, então um lead antigo que escapou do backfill nunca mais
 * entra. Foi o caso de 658 leads da Lana na etapa "Consulta Agendada" do funil
 * Instagram [Elité Clinic] (15/10/2026): o painel mostrava 89 onde o Kommo tem
 * 747. A varredura importa o que falta.
 *
 * Marca em vez de apagar. Se a varredura vier incompleta, um DELETE seria
 * irreversível; uma marca se desfaz. Um lead que reaparecer é desmarcado
 * sozinho na varredura seguinte.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";
import { linhaDoLead, type KommoLead } from "./kommo-leads-sync.js";
import { integrationHost, integrationRequest } from "./integration-http.js";

const PAGE_SIZE = 250; // limite da API da Kommo
const MAX_PAGINAS = 200; // 50 mil leads; acima disso é outra conversa

// Acima desta fatia a varredura não marca nada sozinha e devolve o número para
// conferência. Não é paranoia: um token expirado, uma mudança de filtro ou uma
// resposta truncada fariam a conta inteira parecer apagada, e a marcação em
// massa aconteceria em silêncio no meio da madrugada.
const FATIA_QUE_EXIGE_CONFIRMACAO = 0.3;

export interface KommoReconcileEnv {
  accessToken: string;
  kommoDomain: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  crmConnectionId: string;
  clientId: string;
  /** Marca mesmo que a fatia passe do limite de segurança. */
  confirmar?: boolean;
}

export interface KommoReconcileResult {
  idsNaOrigem: number;
  leadsLocais: number;
  sumiram: number;
  reapareceram: number;
  marcados: number;
  /** Leads que existem no Kommo e não existiam aqui, importados agora. */
  importados: number;
  precisaConfirmar: boolean;
  errors: string[];
}

async function idsVivos(
  domain: string,
  accessToken: string,
): Promise<{ ids: Set<string>; leads: Map<string, KommoLead>; completo: boolean; erro?: string }> {
  const ids = new Set<string>();
  const leads = new Map<string, KommoLead>();
  let page = 1;
  while (page <= MAX_PAGINAS) {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page), with: "source_id,contacts" });
    const res = await fetch(`https://${domain}/api/v4/leads?${qs.toString()}`, integrationRequest({
      headers: { Authorization: `Bearer ${accessToken}` },
    }));
    if (res.status === 204) return { ids, leads, completo: true }; // fim normal da paginação
    if (!res.ok) {
      return { ids, leads, completo: false, erro: `Kommo respondeu ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const body = (await res.json()) as {
      _embedded?: { leads?: KommoLead[] };
      _links?: { next?: unknown };
    };
    const rows = body?._embedded?.leads;
    if (!Array.isArray(rows) || rows.some((l) => !l || !Number.isSafeInteger(l.id) || l.id <= 0) || (rows.length === 0 && body._links?.next)) {
      return { ids, leads, completo: false, erro: "Kommo devolveu página inválida" };
    }
    for (const l of rows) {
      ids.add(String(l.id));
      leads.set(String(l.id), l);
    }
    if (!body._links?.next) return { ids, leads, completo: true };
    page += 1;
  }
  return { ids, leads, completo: false, erro: `parou no teto de ${MAX_PAGINAS} páginas` };
}

export async function runKommoReconcile(env: KommoReconcileEnv): Promise<KommoReconcileResult> {
  const supabase: SupabaseClient<Database> = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const errors: string[] = [];

  const { ids, leads, completo, erro } = await idsVivos(integrationHost(env.kommoDomain, "kommo"), env.accessToken);
  if (erro) errors.push(erro);

  // Varredura incompleta não serve para concluir ausência: o que faltou ler
  // pareceria apagado.
  if (!completo) {
    return {
      idsNaOrigem: ids.size,
      leadsLocais: 0,
      sumiram: 0,
      reapareceram: 0,
      marcados: 0,
      importados: 0,
      precisaConfirmar: false,
      errors: [...errors, "varredura incompleta — nada foi marcado"],
    };
  }
  if (ids.size === 0) {
    return {
      idsNaOrigem: 0,
      leadsLocais: 0,
      sumiram: 0,
      reapareceram: 0,
      marcados: 0,
      importados: 0,
      precisaConfirmar: false,
      errors: [...errors, "a origem devolveu zero leads — recusando marcar a base inteira"],
    };
  }

  // Puxa os ids locais em páginas: são dezenas de milhares e o PostgREST
  // trunca resposta grande sem avisar.
  const locais: { external_lead_id: string; removido_na_origem: string | null }[] = [];
  const LOTE = 1000;
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await supabase
      .from("crm_leads")
      .select("external_lead_id, removido_na_origem")
      .eq("crm_connection_id", env.crmConnectionId)
      .order("external_lead_id", { ascending: true })
      .range(de, de + LOTE - 1);
    if (error) {
      errors.push(`leitura local: ${error.message}`);
      // Base local incompleta também não permite inferir ausências/importações.
      return { idsNaOrigem: ids.size, leadsLocais: locais.length, sumiram: 0, reapareceram: 0, marcados: 0, importados: 0, precisaConfirmar: false, errors };
    }
    if (!data || data.length === 0) break;
    locais.push(...data);
    if (data.length < LOTE) break;
  }

  const sumiram = [...new Set(locais.filter((l) => !ids.has(l.external_lead_id)).map((l) => l.external_lead_id))];
  const reapareceram = [
    ...new Set(
      locais.filter((l) => l.removido_na_origem && ids.has(l.external_lead_id)).map((l) => l.external_lead_id),
    ),
  ];
  const aMarcar = [
    ...new Set(
      locais.filter((l) => !l.removido_na_origem && !ids.has(l.external_lead_id)).map((l) => l.external_lead_id),
    ),
  ];

  const distintosLocais = new Set(locais.map((l) => l.external_lead_id)).size;
  const fatia = distintosLocais > 0 ? aMarcar.length / distintosLocais : 0;
  const precisaConfirmar = fatia > FATIA_QUE_EXIGE_CONFIRMACAO && !env.confirmar;

  let marcados = 0;
  const agora = new Date().toISOString();

  if (!precisaConfirmar && aMarcar.length > 0) {
    for (let i = 0; i < aMarcar.length; i += 200) {
      const { error } = await supabase
        .from("crm_leads")
        .update({ removido_na_origem: agora })
        .eq("crm_connection_id", env.crmConnectionId)
        .in("external_lead_id", aMarcar.slice(i, i + 200));
      if (error) errors.push(`marcação: ${error.message}`);
      else marcados += aMarcar.slice(i, i + 200).length;
    }
  }

  // Desmarcar não tem trava: reconhecer que um lead existe nunca apaga nada.
  if (reapareceram.length > 0) {
    for (let i = 0; i < reapareceram.length; i += 200) {
      const { error } = await supabase
        .from("crm_leads")
        .update({ removido_na_origem: null })
        .eq("crm_connection_id", env.crmConnectionId)
        .in("external_lead_id", reapareceram.slice(i, i + 200));
      if (error) errors.push(`desmarcação: ${error.message}`);
    }
  }

  // O caminho inverso: existe no Kommo e não existe aqui. Só importa quando a leitura local foi completa
  // (uma leitura local truncada faria parecer que tudo falta).
  let importados = 0;
  if (!errors.some((e) => e.startsWith("leitura local"))) {
    const locaisSet = new Set(locais.map((l) => l.external_lead_id));
    const faltantes = [...ids].filter((id) => !locaisSet.has(id));
    for (let i = 0; i < faltantes.length; i += 500) {
      const linhas = faltantes
        .slice(i, i + 500)
        .map((id) => leads.get(id))
        .filter((l): l is KommoLead => !!l)
        .map((l) => linhaDoLead(l, env.crmConnectionId, env.clientId));
      if (linhas.length === 0) continue;
      const { error } = await supabase.from("crm_leads").upsert(linhas as any, { onConflict: "crm_connection_id,external_lead_id" });
      if (error) errors.push(`importação de faltantes: ${error.message}`);
      else importados += linhas.length;
    }
  }

  return {
    idsNaOrigem: ids.size,
    leadsLocais: distintosLocais,
    sumiram: sumiram.length,
    reapareceram: reapareceram.length,
    marcados,
    importados,
    precisaConfirmar,
    errors,
  };
}
