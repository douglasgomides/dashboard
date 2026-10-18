import { z } from "zod";
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const wordCaptionSchema = z
  .object({
    text: z.string().min(1).max(200),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
  })
  .strict()
  .refine((w) => w.end > w.start);
export const motionPlanSchema = z
  .object({
    version: z.literal(1),
    source_media_id: z.string().uuid(),
    reference_analysis_id: z.string().uuid(),
    reference_source_id: z.string().uuid(),
    reference_coverage: z.literal("sampled_frames"),
    reference_performance: z
      .object({
        objective: z.string().max(100),
        relative_multiple: z.number().finite().nonnegative().nullable(),
        baseline_count: z.number().int().nonnegative(),
        reach: z.number().finite().nonnegative().nullable(),
        saved: z.number().finite().nonnegative().nullable(),
        paid: z.enum(["unknown", "confirmed", "not_confirmed"]),
        observed_at: z.string().datetime({ offset: true }),
        limitations: z.array(z.string().max(1200)).max(15),
      })
      .strict()
      .optional(),
    observations: z.array(z.string().max(1200)).min(1).max(12),
    limitations: z.array(z.string().max(1200)).max(15),
    accent: color,
    caption_position: z.enum(["lower", "upper"]),
    gentle_zoom: z.boolean(),
    source_has_captions: z.boolean(),
    words: z.array(wordCaptionSchema).max(6000),
    timing: z.enum(["provider_words", "unavailable"]),
  })
  .strict();
export type MotionPlan = z.infer<typeof motionPlanSchema>;
export function cutWords(
  words: MotionPlan["words"],
  cuts: { start: number; end: number }[],
) {
  let offset = 0;
  const output: MotionPlan["words"] = [];
  for (const cut of cuts) {
    // Não transporta palavras cortadas pela metade para outra frase.
    for (const word of words)
      if (word.start >= cut.start - 0.03 && word.end <= cut.end + 0.03) {
        const start = offset + Math.max(0, word.start - cut.start),
          end = offset + Math.min(cut.end - cut.start, word.end - cut.start);
        if (end > start) output.push({ ...word, start, end });
      }
    offset += cut.end - cut.start;
  }
  return output;
}
/** Frases curtas para leitura; tempos continuam sendo os da transcrição por palavra. */
export function captionPages(words: MotionPlan["words"]) {
  const pages: MotionPlan["words"][] = [];
  for (const word of words) {
    const page = pages.at(-1),
      last = page?.at(-1);
    if (
      !page ||
      !last ||
      page.length >= 5 ||
      word.start - last.end > 0.4 ||
      page.map((w) => w.text.trim()).join(" ").length + word.text.trim().length + 1 > 30 ||
      /[.!?]$/.test(last.text)
    )
      pages.push([word]);
    else page.push(word);
  }
  return pages;
}
