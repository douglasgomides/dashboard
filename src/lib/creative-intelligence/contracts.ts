import { z } from "zod";

export const PIPELINE_VERSION = "creative-1.0.0";
export const BUCKET = "nexo-creative-private";
export const objectiveSchema = z.enum([
  "alcance",
  "salvamento",
  "compartilhamento",
  "seguidores",
  "conversa",
  "autoridade",
]);
export const formatSchema = z.enum(["carrossel", "reels"]);
export const evidenceStateSchema = z.enum([
  "candidata",
  "em_teste",
  "positiva_mercado",
  "positiva_conta",
  "testes_repetidos",
]);
const text = z.string().max(12000);
const short = z.string().max(2000);
const strings = z.array(short).max(40);
const confidence = z.number().min(0).max(1);

export const visualSchema = z.object({
  image_type: short,
  people_and_framing: short,
  objects_and_setting: short,
  palette: strings,
  contrast: short,
  typography: short,
  hierarchy: strings,
  composition: short,
  text_position: short,
  whitespace: short,
  graphic_elements: strings,
  image_text_relationship: short,
  continuity: short,
  designer_brief: text,
});

export const copySchema = z.object({
  full_text: text,
  headline: short,
  subheadline: short,
  body: text,
  secondary_calls: strings,
  highlights: strings,
  cta: short,
  hierarchy: strings,
  density: short,
  narrative_role: short,
  persuasive_elements: strings,
  extraction_uncertainties: strings,
});

export const slideSchema = z.object({
  asset_id: z.string().uuid(),
  position: z.number().int().min(1),
  copy: copySchema,
  visual: visualSchema,
  confidence,
  uncertainties: strings,
});
export const transcriptSegmentSchema = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    text,
  })
  .refine((s) => s.end > s.start, "Trecho temporal inválido");
// Base sem a regra de tempo: o worker deriva o pedido por bloco com .omit (o zod 4 não permite omit/innerType depois de refine).
export const sceneBaseSchema = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
    evidence_asset_ids: z.array(z.string().uuid()).min(1).max(80),
    narration: text,
    on_screen_text: text,
    narrative_role: short,
    shot: short,
    camera: short,
    editing: short,
    audio_observations: short,
    transitions: short,
    visual: visualSchema,
    confidence,
    uncertainties: strings,
  });
export const sceneSchema = sceneBaseSchema.refine((s) => s.end > s.start, "Cena temporal inválida");

export const dnaSchema = z.object({
  hook_pattern: short,
  narrative_sequence: strings,
  argument_progression: strings,
  retention_techniques: strings,
  cta_pattern: short,
  text_density: strings,
  visual_system: visualSchema,
  editing_pattern: strings,
  reusable_principles: strings,
  theme_specific_elements: strings,
  uncertainties: strings,
});
export const analysisSchema = z.object({
  format: formatSchema,
  original_theme: short,
  summary: text,
  slides: z.array(slideSchema).max(30),
  scenes: z.array(sceneSchema).max(1000),
  dna: dnaSchema,
  medical_review_flags: strings,
  confidence,
});

export const adaptationUnitSchema = z.object({
  position: z.number().int().min(1),
  original_position: z.number().int().min(1),
  start: z.number().nonnegative().nullable(),
  end: z.number().nonnegative().nullable(),
  copy: text,
  narrative_role: short,
  image_brief: text,
  layout_brief: text,
  recording_brief: text,
  editing_brief: text,
  on_screen_text: text,
  structural_reference: short,
  justified_changes: strings,
});
export const adaptationSchema = z.object({
  title: short,
  theme: short,
  format: formatSchema,
  objective: objectiveSchema,
  hook: short,
  units: z.array(adaptationUnitSchema).min(1).max(1000),
  caption: text,
  cta: short,
  preserved_principles: strings,
  justified_changes: strings,
  medical_review_flags: z.array(short).min(1).max(40),
  brain_keys: strings,
  clinical_claims_requiring_verification: strings,
});

/** A geração não pode encurtar o roteiro ou abandonar slides silenciosamente. */
export function bindAdaptationUnits<T extends { original_position: number }>(
  units: T[],
  original: Pick<
    z.infer<typeof analysisSchema>,
    "format" | "slides" | "scenes"
  >,
) {
  const reference =
    original.format === "carrossel"
      ? original.slides.map((s) => ({
          position: s.position,
          start: null,
          end: null,
        }))
      : original.scenes.map((s, i) => ({
          position: i + 1,
          start: s.start,
          end: s.end,
        }));
  if (
    !reference.length ||
    units.length !== reference.length ||
    units.some((u, i) => u.original_position !== reference[i].position)
  )
    throw new Error(
      "A proposta precisa preservar todas as unidades originais, na mesma ordem.",
    );
  return units.map((unit, i) => ({
    ...unit,
    position: i + 1,
    start: reference[i].start,
    end: reference[i].end,
  }));
}

// Heurística editorial para um roteiro gravável; a equipe confirma as pausas.
export const spokenWordCount = (value: string) =>
  value.trim().split(/\s+/).filter(Boolean).length;
export const speechWordLimit = (seconds: number) =>
  Math.max(3, Math.floor(seconds * 2.7));

export interface Coverage {
  status: "completa" | "parcial" | "indisponivel";
  expected_assets: number | null;
  acquired_assets: number;
  analysed_assets: number;
  duration_seconds: number | null;
  audio_processed_seconds: number;
  visual_processed_seconds: number;
  visual_method: "all_slides" | "sampled_frames" | "native_video" | "none";
  maximum_frame_gap_seconds: number | null;
  missing: string[];
  limitations: string[];
}
export interface CreativeAsset {
  id: string;
  client_id: string;
  account_id: string;
  source_id: string;
  kind: "image" | "video" | "audio" | "frame";
  position: number;
  storage_path: string;
  sha256: string;
  bytes: number;
  mime: string;
  width: number | null;
  height: number | null;
  time_seconds: number | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown>;
}
export interface CreativeSource {
  id: string;
  client_id: string;
  account_id: string;
  post_id: string | null;
  platform: "instagram" | "tiktok";
  origin: "own" | "external";
  external_id: string;
  canonical_url: string;
  format: "carrossel" | "reels";
  title: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
export interface CreativeJob {
  id: string;
  client_id: string;
  account_id: string;
  source_id: string | null;
  kind: "analyse" | "adapt" | "discover" | "measure" | "search";
  status: "queued" | "running" | "retry" | "completed" | "failed" | "cancelled";
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  progress: number;
  message: string;
  attempts: number;
  lease_token: string | null;
  budget_usd: number;
  reserved_usd: number;
  cost_usd: number;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}
export interface CreativeAnalysis {
  id: string;
  client_id: string;
  source_id: string;
  account_id: string;
  job_id: string;
  version: string;
  model: string;
  coverage: Coverage;
  result: z.infer<typeof analysisSchema>;
  transcript: z.infer<typeof transcriptSegmentSchema>[];
  cost_usd: number;
  created_at: string;
}
export interface CreativeStructure {
  id: string;
  client_id: string;
  account_id: string;
  source_id: string;
  analysis_id: string;
  title: string;
  theme: string;
  format: "carrossel" | "reels";
  state: z.infer<typeof evidenceStateSchema>;
  evidence: Record<string, unknown>;
  dna: z.infer<typeof dnaSchema>;
  created_at: string;
}
export interface CreativeAdaptation {
  id: string;
  client_id: string;
  account_id: string;
  structure_id: string;
  analysis_id: string;
  job_id: string;
  document: z.infer<typeof adaptationSchema>;
  model: string;
  pauta_id: string | null;
  published_post_id: string | null;
  created_at: string;
}
export type Objective = z.infer<typeof objectiveSchema>;
export const COVERAGE_LABEL: Record<Coverage["status"], string> = {
  completa: "Completa",
  parcial: "Parcial",
  indisponivel: "Indisponível",
};
export const EVIDENCE_LABEL: Record<
  z.infer<typeof evidenceStateSchema>,
  string
> = {
  candidata: "Candidata",
  em_teste: "Em teste",
  positiva_mercado: "Evidência positiva no mercado",
  positiva_conta: "Evidência positiva na conta",
  testes_repetidos: "Validada por testes repetidos",
};

/** A legenda jamais participa da decisão de completude. Frames são observação amostral. */
export function assessCoverage(
  c: Omit<Coverage, "status">,
  format: "carrossel" | "reels",
): Coverage {
  const available = c.acquired_assets > 0 && c.analysed_assets > 0;
  const complete =
    available &&
    c.missing.length === 0 &&
    (format === "carrossel"
      ? c.expected_assets !== null &&
        c.expected_assets > 1 &&
        c.expected_assets === c.acquired_assets &&
        c.analysed_assets === c.expected_assets &&
        c.visual_method === "all_slides"
      : c.duration_seconds !== null &&
        c.duration_seconds > 0 &&
        c.visual_method === "native_video" &&
        c.visual_processed_seconds >= c.duration_seconds - 0.1 &&
        c.audio_processed_seconds >= c.duration_seconds - 0.1);
  return {
    ...c,
    status: !available ? "indisponivel" : complete ? "completa" : "parcial",
  };
}

export function validateEvidence(
  result: z.infer<typeof analysisSchema>,
  assets: CreativeAsset[],
  duration: number | null,
) {
  const ids = new Set(assets.map((a) => a.id));
  for (const slide of result.slides) {
    const asset = assets.find(
      (a) => a.id === slide.asset_id && a.kind === "image",
    );
    if (!asset || asset.position !== slide.position)
      throw new Error("Slide sem evidência correspondente");
  }
  if (
    new Set(result.slides.map((s) => s.position)).size !== result.slides.length
  )
    throw new Error("Slides duplicados na análise");
  for (const scene of result.scenes) {
    if (
      duration === null ||
      scene.end > duration + 0.1 ||
      scene.evidence_asset_ids.some((id) => !ids.has(id))
    )
      throw new Error("Cena sem evidência válida");
  }
}
