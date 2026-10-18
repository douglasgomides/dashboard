import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  BUCKET,
  type CreativeSource,
  type CreativeAnalysis,
  type CreativeAsset,
  type CreativeJob,
  type CreativeStructure,
  type CreativeAdaptation,
} from "@/lib/creative-intelligence/contracts";
const db = supabase as unknown as SupabaseClient;
async function read<T>(
  query: PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>,
): Promise<T> {
  const { data, error } = await query;
  if (error)
    throw new Error(
      ["42P01", "PGRST205", "PGRST202"].includes(error.code ?? "")
        ? "O módulo ainda não foi habilitado neste ambiente."
        : ["P0001", "42501"].includes(error.code ?? "")
          ? error.message.slice(0, 240)
          : "Não foi possível consultar a Inteligência Criativa. Verifique seu acesso ou tente novamente.",
    );
  return data as T;
}
export const listAccounts = (clientId: string) =>
  read<{ id: string; ig_username: string | null; client_id: string }[]>(
    db
      .from("instagram_accounts")
      .select("id,ig_username,client_id")
      .eq("client_id", clientId)
      .eq("active", true)
      .order("id"),
  );
export type JobProgress = Pick<
  CreativeJob,
  "id" | "status" | "progress" | "message" | "cost_usd" | "reserved_usd"
>;
export const readJobProgress = (clientId: string, accountId: string) =>
  read<JobProgress[]>(
    db
      .from("creative_jobs")
      .select("id,status,progress,message,cost_usd,reserved_usd")
      .eq("client_id", clientId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(30),
  );
export async function readWorkspace(clientId: string, accountId: string) {
  const query = (table: string) =>
    db
      .from(table)
      .select("*")
      .eq("client_id", clientId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
  const [
    sources,
    analyses,
    structures,
    adaptations,
    jobs,
    discoveries,
    observations,
    health,
  ] = await Promise.all([
    read<CreativeSource[]>(query("creative_sources").limit(100)),
    read<CreativeAnalysis[]>(query("creative_analyses").limit(100)),
    read<CreativeStructure[]>(query("creative_structures").limit(100)),
    read<CreativeAdaptation[]>(query("creative_adaptations").limit(100)),
    read<CreativeJob[]>(query("creative_jobs").limit(30)),
    read<any[]>(
      db
        .from("creative_discoveries")
        .select("*")
        .eq("client_id", clientId)
        .eq("account_id", accountId)
        .order("observed_at", { ascending: false })
        .limit(60),
    ),
    read<any[]>(
      db
        .from("creative_metric_observations")
        .select("*")
        .eq("client_id", clientId)
        .eq("account_id", accountId)
        .order("observed_at", { ascending: false })
        .limit(200),
    ),
    read<{ seen_at?: string; capabilities?: Record<string, boolean> }>(
      db.rpc("creative_worker_health"),
    ),
  ]);
  return {
    sources,
    analyses,
    structures,
    adaptations,
    jobs,
    discoveries,
    observations,
    health,
  };
}
export function readAssets(
  clientId: string,
  accountId: string,
  sourceId: string,
  assetIds?: string[],
) {
  let query = db
    .from("creative_assets")
    .select("*")
    .eq("client_id", clientId)
    .eq("account_id", accountId)
    .eq("source_id", sourceId)
    .order("position");
  if (assetIds?.length) query = query.in("id", assetIds);
  return read<CreativeAsset[]>(query);
}
export async function signedAsset(asset: CreativeAsset) {
  return (
    await read<{ signedUrl: string }>(
      db.storage.from(BUCKET).createSignedUrl(asset.storage_path, 300),
    )
  ).signedUrl;
}
export async function enqueue(
  clientId: string,
  accountId: string,
  kind: CreativeJob["kind"],
  input: Record<string, unknown>,
) {
  return read<string>(
    db.rpc("creative_enqueue", {
      p_client_id: clientId,
      p_kind: kind,
      p_input: { ...input, account_id: accountId },
      p_request_key: crypto.randomUUID(),
    }),
  );
}
export const cancelJob = (clientId: string, jobId: string) =>
  read<boolean>(
    db.rpc("creative_cancel", { p_client_id: clientId, p_job_id: jobId }),
  );
export const toPlanner = (clientId: string, adaptationId: string) =>
  read<string>(
    db.rpc("creative_to_pauta", {
      p_client_id: clientId,
      p_adaptation_id: adaptationId,
    }),
  );
export const linkPublication = (
  clientId: string,
  adaptationId: string,
  postId: string,
) =>
  read<boolean>(
    db.rpc("creative_link_publication", {
      p_client_id: clientId,
      p_adaptation_id: adaptationId,
      p_post_id: postId,
    }),
  );
