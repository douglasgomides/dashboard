import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  BUCKET,
  type CreativeJob,
} from "@/lib/creative-intelligence/contracts";
import {
  MAX_UPLOAD,
  PRODUCTION_BUCKET,
  productionDocumentSchema,
  type ProductionDocument,
  type ProductionProject,
  type ProductionRevision,
  type ProductionMedia,
  type ProductionOutput,
  type MediaRef,
  type CarouselDocument,
} from "@/lib/creative-intelligence/production";
const db = supabase as unknown as SupabaseClient;
/** Apenas valores explícitos aprovados; não cria outra memória de marca. */
export async function approvedProductionBrand(
  client: string,
): Promise<Partial<CarouselDocument["brand"]>> {
  const [profile, brain] = await Promise.all([
    db.from("clients").select("name").eq("id", client).maybeSingle(),
    db
      .from("brain_itens")
      .select("memoria,chave,valor")
      .eq("client_id", client)
      .eq("estado", "aprovado")
      .in("memoria", ["identidade", "criativa"])
      .limit(150),
  ]);
  if (profile.error || brain.error)
    throw new Error(
      "Não foi possível conferir a identidade aprovada desta clínica.",
    );
  const brand: Partial<CarouselDocument["brand"]> = {
    name: String(profile.data?.name || "").slice(0, 160),
  };
  for (const item of brain.data || []) {
    const key = String(item.chave).toLowerCase(),
      value = String(item.valor),
      hex = value.match(/#[0-9a-fA-F]{6}\b/)?.[0];
    if (/^(nome_marca|nome_profissional)$/.test(key))
      brand.name = value.slice(0, 160);
    if (/^assinatura(_visual)?$/.test(key))
      brand.signature = value.slice(0, 240);
    if (hex && /cor.*fundo/.test(key)) brand.background = hex;
    if (hex && /cor.*texto/.test(key)) brand.ink = hex;
    if (hex && /cor.*(destaque|principal)/.test(key)) brand.accent = hex;
  }
  return brand;
}
async function read<T>(
  query: PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>,
): Promise<T> {
  const { data, error } = await query;
  if (error)
    throw new Error(
      ["42P01", "PGRST205", "PGRST202"].includes(error.code || "")
        ? "O estúdio ainda não foi habilitado neste ambiente."
        : error.code === "40001"
          ? "Outra pessoa salvou uma revisão. Recarregue o projeto antes de continuar."
          : ["P0001", "42501"].includes(error.code || "")
            ? error.message.slice(0, 240)
            : "Não foi possível concluir a operação do estúdio.",
    );
  return data as T;
}
export const listProductions = (client: string, account: string) =>
  read<ProductionProject[]>(
    db
      .from("creative_productions")
      .select("*")
      .eq("client_id", client)
      .eq("account_id", account)
      .order("created_at", { ascending: false })
      .limit(100),
  );
export async function readProduction(
  client: string,
  account: string,
  id: string,
) {
  const base = (table: string) =>
    db
      .from(table)
      .select("*")
      .eq("client_id", client)
      .eq("account_id", account)
      .eq("project_id", id);
  const [revisions, media, outputs, jobs] = await Promise.all([
    read<ProductionRevision[]>(
      base("creative_production_revisions")
        .order("revision", { ascending: false })
        .limit(50),
    ),
    read<ProductionMedia[]>(
      base("creative_production_media")
        .order("created_at", { ascending: false })
        .limit(300),
    ),
    read<ProductionOutput[]>(
      base("creative_production_outputs")
        .order("created_at", { ascending: false })
        .limit(30),
    ),
    read<CreativeJob[]>(
      db
        .from("creative_jobs")
        .select("*")
        .eq("client_id", client)
        .eq("account_id", account)
        .eq("input->>project_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ),
  ]);
  return {
    revisions: revisions.map((r) => ({
      ...r,
      document: productionDocumentSchema.parse(r.document),
    })),
    media,
    outputs,
    jobs,
  };
}
export const createProduction = (
  client: string,
  account: string,
  document: ProductionDocument,
  adaptation: string | null,
) =>
  read<string>(
    db.rpc("creative_production_create", {
      p_client_id: client,
      p_account_id: account,
      p_adaptation_id: adaptation,
      p_document: productionDocumentSchema.parse(document),
    }),
  );
export const saveProduction = (
  client: string,
  project: string,
  revision: number,
  document: ProductionDocument,
) =>
  read<number>(
    db.rpc("creative_production_save", {
      p_client_id: client,
      p_project_id: project,
      p_expected: revision,
      p_document: productionDocumentSchema.parse(document),
    }),
  );
export async function uploadProduction(
  client: string,
  project: string,
  file: File,
) {
  if (
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ].includes(file.type) ||
    !file.size ||
    file.size > MAX_UPLOAD ||
    (file.type.startsWith("image/") && file.size > 20 * 1024 * 1024)
  )
    throw new Error(
      "Envie JPG, PNG ou WebP de até 20 MiB, ou MP4/MOV de até 200 MiB e três minutos.",
    );
  const target = await read<{ id: string; path: string }>(
    db.rpc("creative_production_upload", {
      p_client_id: client,
      p_project_id: project,
      p_mime: file.type,
      p_bytes: file.size,
    }),
  );
  const { error } = await db.storage
    .from(PRODUCTION_BUCKET)
    .upload(target.path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("O envio não foi concluído. Tente novamente.");
  return target.id;
}
export async function productionUrls(
  client: string,
  account: string,
  media: ProductionMedia[],
) {
  const allowed = media.filter(
      (m) => m.client_id === client && m.account_id === account,
    ),
    urls: Record<string, string> = {};
  await Promise.all(
    allowed.map(async (m) => {
      const { data, error } = await db.storage
        .from(PRODUCTION_BUCKET)
        .createSignedUrl(m.storage_path, 300);
      if (!error && data?.signedUrl)
        urls[`production:${m.id}`] = data.signedUrl;
    }),
  );
  return urls;
}
export async function originalProductionImages(
  client: string,
  account: string,
  source: string | null,
) {
  if (!source)
    return {
      media: [] as { id: string; kind: string }[],
      urls: {} as Record<string, string>,
    };
  const origin = await read<{ origin: string } | null>(
    db
      .from("creative_sources")
      .select("origin")
      .eq("id", source)
      .eq("client_id", client)
      .eq("account_id", account)
      .maybeSingle(),
  );
  if (origin?.origin !== "own") return { media: [], urls: {} };
  const media = await read<
    { id: string; storage_path: string; kind: string }[]
  >(
    db
      .from("creative_assets")
      .select("id,storage_path,kind")
      .eq("client_id", client)
      .eq("account_id", account)
      .eq("source_id", source)
      .in("kind", ["image", "video"])
      .order("position"),
  );
  const urls: Record<string, string> = {};
  await Promise.all(
    media.map(async (m) => {
      const { data } = await db.storage
        .from(BUCKET)
        .createSignedUrl(m.storage_path, 300);
      if (data?.signedUrl) urls[`creative:${m.id}`] = data.signedUrl;
    }),
  );
  return { media, urls };
}
export const mediaKey = (r: MediaRef) => `${r.origin}:${r.id}`;
