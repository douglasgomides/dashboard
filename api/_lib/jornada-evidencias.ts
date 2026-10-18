import type { SupabaseClient } from "@supabase/supabase-js";

export interface VinculoKommo {
  conversa_id: string;
  lead_id: string;
  lead_externo_id: string;
  conversa_externo_id: string;
  referencia_externa: string;
  metodo: "kommo_evento";
}

/** Falha de evidência nunca vira sucesso silencioso nem derruba dados já importados. */
export async function registrarVinculosKommo(
  db: SupabaseClient<any, any, any>,
  clientId: string,
  vinculos: VinculoKommo[],
): Promise<string | null> {
  try {
    let conflito = false;
    for (let i = 0; i < vinculos.length; i += 200) {
      const { data, error } = await db.rpc("jornada_registrar_vinculos", {
        p_client: clientId,
        p_vinculos: vinculos.slice(i, i + 200),
      });
      if (error)
        return "Evidência da jornada não registrada; os dados importados foram preservados";
      if (Number(data?.conflitos) > 0) conflito = true;
    }
    return conflito
      ? "Vínculo comercial conflitante; associação excluída das contagens verificadas"
      : null;
  } catch {
    return "Evidência da jornada indisponível; os dados importados foram preservados";
  }
}

export async function reconciliarJornada(
  db: SupabaseClient<any, any, any>,
  clientId: string,
): Promise<string | null> {
  try {
    const { data, error } = await db.rpc("jornada_reconciliar", {
      p_client: clientId,
    });
    if (error) return "Não foi possível conferir os vínculos comerciais";
    return Number(data?.conflitos) > 0
      ? "Vínculos comerciais conflitantes precisam de revisão"
      : null;
  } catch {
    return "Não foi possível conferir os vínculos comerciais";
  }
}
