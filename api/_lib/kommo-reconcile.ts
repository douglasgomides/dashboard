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
 * Marca em vez de apagar. Se a varredura vier incompleta, um DELETE seria
 * irreversível; uma marca se desfaz. Um lead que reaparecer é desmarcado
 * sozinho na varredura seguinte.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types.js";

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
  precisaConfirmar: boolean;
  errors: string[];
}

async function idsVivos(
  domain: string,
  accessToken: string,
): Promise<{ ids: Set<string>; completo: boolean; erro?: string }> {
  const ids = new Set<string>();
  let page = 1;
  while (page <= MAX_PAGINAS) {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    const res = await fetch(`https://${domain}/api/v4/leads?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 204) return { ids, completo: true }; // fim normal da paginação
    if (!res.ok) {
      return { ids, completo: false, erro: `Kommo respondeu ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const body = (await res.json()) as {
      _embedded?: { leads?: { id: number }[] };
      _links?: { next?: unknown };
    };
    for (const l of body._embedded?.leads ?? []) ids.add(String(l.id));
    if (!body._links?.next) return { ids, completo: true };
    page += 1;
  }
  return { ids, completo: false, erro: `parou no teto de ${MAX_PAGINAS} páginas` };
}

export async function runKommoReconcile(env: KommoReconcileEnv): Promise<KommoReconcileResult> {
  const supabase: SupabaseClient<Database> = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const errors: string[] = [];

  const { ids, completo, erro } = await idsVivos(env.kommoDomain, env.accessToken);
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
      .range(de, de + LOTE - 1);
    if (error) {
      errors.push(`leitura local: ${error.message}`);
      break;
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

  return {
    idsNaOrigem: ids.size,
    leadsLocais: distintosLocais,
    sumiram: sumiram.length,
    reapareceram: reapareceram.length,
    marcados,
    precisaConfirmar,
    errors,
  };
}
