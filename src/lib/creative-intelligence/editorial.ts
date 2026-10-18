import { z } from "zod";
import type { CreativeAdaptation } from "./contracts";

export const creativeEntrySchema = z.object({
  aba: z.enum(["acervo", "analises", "biblioteca", "producao", "radar", "aprendizado"]).optional().catch(undefined),
  conta: z.string().uuid().optional().catch(undefined),
  adaptacao: z.string().uuid().optional().catch(undefined),
});
export type CreativeEntry = z.infer<typeof creativeEntrySchema>;

/** O documento já contém capa, desenvolvimento e fechamento. Nunca acrescentar slides ou falas. */
export function adaptationBrief(a: Pick<CreativeAdaptation, "document">): string {
  const d = a.document;
  return [
    d.title,
    `Formato: ${d.format === "carrossel" ? "Carrossel" : "Reels"} · Tema: ${d.theme}`,
    ...d.units.map((u) => [
      `${d.format === "carrossel" ? "Slide" : "Bloco"} ${u.position}${u.start !== null && u.end !== null ? ` (${u.start}–${u.end}s)` : ""}`,
      u.copy,
      ...[["Imagem", u.image_brief], ["Layout", u.layout_brief], ["Gravação", u.recording_brief], ["Edição", u.editing_brief], ["Texto na tela", u.on_screen_text]]
        .filter(([, text]) => text).map(([label, text]) => `${label}: ${text}`),
    ].join("\n")),
    `Legenda:\n${d.caption}`,
    `Chamada: ${d.cta}`,
    `Revisão médica:\n${[...d.medical_review_flags, ...d.clinical_claims_requiring_verification].join("\n")}`,
  ].join("\n\n");
}

export function creativeAdaptationId(ideaId: string | null): string | undefined {
  return z.string().uuid().safeParse(ideaId?.startsWith("creative:") ? ideaId.slice(9) : "").data;
}
