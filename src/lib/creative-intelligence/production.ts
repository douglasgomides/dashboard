import { z } from "zod";
import type { CreativeAdaptation } from "./contracts";

export const PRODUCTION_BUCKET = "nexo-production-private";
export const MAX_UPLOAD = 200 * 1024 * 1024;
export const MAX_EDIT_SECONDS = 180;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const mediaRefSchema = z
  .object({ origin: z.enum(["production", "creative"]), id: z.string().uuid() })
  .strict();
const transcript = z
  .object({
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
    text: z.string().max(4000),
  })
  .strict()
  .refine((s) => s.end > s.start);
export const cutSchema = z
  .object({
    id: z.string().min(1).max(60),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
    reason: z.string().max(1500),
    label: z.string().max(200),
  })
  .strict()
  .refine((s) => s.end > s.start && s.end - s.start >= 0.15);
export const brandSchema = z
  .object({
    name: z.string().max(160),
    signature: z.string().max(240),
    background: color,
    ink: color,
    accent: color,
    font: z.enum(["sans", "serif"]),
    logo: mediaRefSchema.nullable(),
  })
  .strict();
export const carouselSchema = z
  .object({
    version: z.literal(1),
    format: z.literal("carrossel"),
    title: z.string().min(1).max(240),
    caption: z.string().max(6000),
    brand: brandSchema,
    slides: z
      .array(
        z
          .object({
            id: z.string().min(1).max(60),
            copy: z.string().min(1).max(2400),
            imagePrompt: z.string().max(4000),
            image: mediaRefSchema.nullable(),
            layout: z.enum(["editorial", "split"]),
            fontSize: z.number().int().min(30).max(84),
            align: z.enum(["left", "center"]),
            imageFocus: z.number().int().min(0).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    warnings: z.array(z.string().max(2000)).max(50),
  })
  .strict();
export const videoSchema = z
  .object({
    version: z.literal(1),
    format: z.literal("reels"),
    title: z.string().min(1).max(240),
    caption: z.string().max(6000),
    source: mediaRefSchema.nullable(),
    duration: z.number().finite().positive().max(MAX_EDIT_SECONDS).nullable(),
    transcript: z.array(transcript).max(1000),
    cuts: z.array(cutSchema).max(120),
    aspect: z.enum(["9:16", "1:1", "16:9"]),
    subtitles: z.boolean(),
    subtitleSize: z.number().int().min(20).max(56),
    goalSeconds: z.number().int().min(15).max(MAX_EDIT_SECONDS),
    visualCoverage: z.enum(["not_analysed", "sampled_frames"]),
    recordingBrief: z.array(z.string().max(12000)).max(1000),
    warnings: z.array(z.string().max(2000)).max(50),
  })
  .strict();
export const productionDocumentSchema = z
  .discriminatedUnion("format", [carouselSchema, videoSchema])
  .superRefine((d, c) => {
    const ids =
      d.format === "carrossel"
        ? d.slides.map((s) => s.id)
        : d.cuts.map((s) => s.id);
    if (new Set(ids).size !== ids.length)
      c.addIssue({ code: "custom", message: "Unidades duplicadas" });
    if (d.format === "reels") {
      if (d.cuts.length && (!d.source || !d.duration))
        c.addIssue({ code: "custom", message: "Plano sem arquivo ou duração" });
      d.cuts.forEach((s, i) => {
        if (
          !d.duration ||
          s.end > d.duration + 0.001 ||
          (i > 0 && s.start < d.cuts[i - 1].end - 0.001)
        )
          c.addIssue({
            code: "custom",
            message: "Cortes fora do vídeo, sobrepostos ou reordenados",
          });
      });
      if (d.duration && d.transcript.some((t) => t.end > d.duration! + 0.1))
        c.addIssue({ code: "custom", message: "Transcrição fora da duração" });
    }
  });
export type ProductionDocument = z.infer<typeof productionDocumentSchema>;
export type CarouselDocument = z.infer<typeof carouselSchema>;
export type VideoDocument = z.infer<typeof videoSchema>;
export type MediaRef = z.infer<typeof mediaRefSchema>;
export interface ProductionProject {
  id: string;
  client_id: string;
  account_id: string;
  adaptation_id: string | null;
  source_id: string | null;
  format: "carrossel" | "reels";
  title: string;
  current_revision: number;
  created_at: string;
}
export interface ProductionRevision {
  id: string;
  project_id: string;
  revision: number;
  document: ProductionDocument;
  created_at: string;
}
export interface ProductionMedia {
  id: string;
  client_id: string;
  account_id: string;
  project_id: string;
  purpose:
    | "input"
    | "image"
    | "slide"
    | "video"
    | "archive"
    | "subtitle"
    | "frame";
  storage_path: string;
  mime: string;
  bytes: number;
  sha256: string | null;
  status: "pending" | "ready";
  created_at: string;
}
export interface ProductionOutput {
  job_id: string;
  project_id: string;
  revision: number;
  kind: string;
  result: {
    document?: ProductionDocument;
    media_ids?: string[];
    warnings?: string[];
    duration?: number;
  };
  created_at: string;
}

export function newDocument(
  format: "carrossel" | "reels",
  adaptation?: CreativeAdaptation,
): ProductionDocument {
  const title =
    adaptation?.document.title ||
    (format === "carrossel" ? "Novo carrossel" : "Nova edição de vídeo");
  if (format === "carrossel")
    return {
      version: 1,
      format,
      title,
      caption: adaptation?.document.caption || "",
      brand: {
        name: "",
        signature: "",
        background: "#FAF8F5",
        ink: "#17212B",
        accent: "#A46472",
        font: "sans",
        logo: null,
      },
      slides: (
        adaptation?.document.units || [
          { copy: "Escreva a abertura do seu carrossel", image_brief: "" },
        ]
      ).map((u, i) => ({
        id: `slide-${i + 1}`,
        copy: u.copy,
        imagePrompt: u.image_brief,
        image: null,
        layout: "editorial",
        fontSize: fittedFont(u.copy),
        align: "left",
        imageFocus: 50,
      })),
      warnings: adaptation?.document.medical_review_flags || [
        "Revisar conteúdo e alegações médicas antes de usar.",
      ],
    };
  return {
    version: 1,
    format,
    title,
    caption: adaptation?.document.caption || "",
    source: null,
    duration: null,
    transcript: [],
    cuts: [],
    aspect: "9:16",
    subtitles: true,
    subtitleSize: 32,
    goalSeconds: 60,
    visualCoverage: "not_analysed",
    recordingBrief:
      adaptation?.document.units.map(
        (u) =>
          `${u.copy}\nGravação: ${u.recording_brief}\nEdição: ${u.editing_brief}`,
      ) || [],
    warnings: [
      "A edição preserva a fala da gravação enviada. Não troca o tema ou a voz por síntese.",
      "Revisar cortes e contexto médico antes de exportar.",
    ],
  };
}

/** Recurso gráfico gerado pelo nosso código. Nunca aceita SVG ou HTML de uploads/modelos. */
const xml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
// Larguras conservadoras: evita cortar palavras largas mesmo sem Canvas no worker.
const characterWidth = (char: string) => {
  const c = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\s/.test(c)) return 0.34;
  if (/[ilIt.,:;'!|]/.test(c)) return 0.34;
  if (/[MW@%]/.test(c)) return 1.02;
  if (/[A-Z]/.test(c)) return 0.79;
  if (/[mw]/.test(c)) return 0.91;
  if (/[0-9]/.test(c)) return 0.64;
  if (/[a-z]/.test(c)) return 0.66;
  return 1.04;
};
export function wrapCopy(copy: string, fontSize: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of copy.split("\n")) {
    let line = "",
      used = 0;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const size = Array.from(word).reduce(
        (n, c) => n + characterWidth(c) * fontSize,
        0,
      );
      if (size > width) {
        if (line) {
          lines.push(line);
          line = "";
          used = 0;
        }
        for (const char of Array.from(word)) {
          const advance = characterWidth(char) * fontSize;
          if (used + advance > width && line) {
            lines.push(line);
            line = "";
            used = 0;
          }
          line += char;
          used += advance;
        }
      } else if (line && used + fontSize * 0.34 + size > width) {
        lines.push(line);
        line = word;
        used = size;
      } else {
        used += (line ? fontSize * 0.34 : 0) + size;
        line += (line ? " " : "") + word;
      }
    }
    lines.push(line);
  }
  return lines;
}
export function fittedFont(copy: string, width = 900, height = 990) {
  for (let size = 68; size >= 30; size -= 2)
    if (wrapCopy(copy, size, width).length * size * 1.25 <= height) return size;
  return 30;
}
export function slideLayout(d: CarouselDocument, index: number) {
  const s = d.slides[index],
    split = s.layout === "split" && !!s.image;
  const width = split ? 450 : 900,
    height = s.image ? (split ? 900 : 530) : 990;
  const lines = wrapCopy(s.copy, s.fontSize, width);
  return {
    width,
    height,
    lines,
    overflow: lines.length * s.fontSize * 1.25 > height,
  };
}
export function applySlideImage(
  d: CarouselDocument,
  index: number,
  image: MediaRef,
): CarouselDocument {
  return {
    ...d,
    slides: d.slides.map((s, i) =>
      i === index
        ? {
            ...s,
            image,
            fontSize: Math.min(
              s.fontSize,
              fittedFont(
                s.copy,
                s.layout === "split" ? 450 : 900,
                s.layout === "split" ? 900 : 530,
              ),
            ),
          }
        : s,
    ),
  };
}
export function renderSlideSvg(
  d: CarouselDocument,
  index: number,
  resolveImage: (r: MediaRef) => string | null,
) {
  const s = d.slides[index],
    l = slideLayout(d, index),
    split = s.layout === "split" && !!s.image;
  if (!s || l.overflow)
    throw new Error(
      `O texto do slide ${index + 1} não cabe. Reduza a fonte ou ajuste a copy.`,
    );
  const image = s.image && resolveImage(s.image),
    logo = d.brand.logo && resolveImage(d.brand.logo);
  const safeImage = (url: string | null) =>
    !!url && /^(data:image\/(png|jpeg|webp);base64,|https:\/\/)/.test(url);
  const x = s.align === "center" ? 90 + l.width / 2 : 90;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="${d.brand.background}"/><rect x="90" y="75" width="68" height="6" fill="${d.brand.accent}"/><text x="90" y="124" font-family="Arial, Liberation Sans, sans-serif" font-size="22" fill="${d.brand.ink}">${xml(d.brand.name)}</text>${image && safeImage(image) ? `<svg x="${split ? 580 : 90}" y="${split ? 210 : 780}" width="${split ? 410 : 900}" height="${split ? 850 : 370}" viewBox="0 0 ${split ? 410 : 900} ${split ? 850 : 370}"><image width="100%" height="100%" preserveAspectRatio="xMidY${s.imageFocus < 34 ? "Min" : s.imageFocus > 66 ? "Max" : "Mid"} slice" xlink:href="${xml(image)}"/></svg>` : ""}${l.lines.map((line, i) => `<text x="${x}" y="${235 + i * s.fontSize * 1.25}" font-family="${d.brand.font === "serif" ? "Times New Roman, Liberation Serif, serif" : "Arial, Liberation Sans, sans-serif"}" font-size="${s.fontSize}" font-weight="700" text-anchor="${s.align === "center" ? "middle" : "start"}" fill="${d.brand.ink}">${xml(line)}</text>`).join("")}<rect x="90" y="1210" width="900" height="1" fill="${d.brand.accent}"/>${logo && safeImage(logo) ? `<image x="90" y="1240" width="60" height="60" preserveAspectRatio="xMidYMid meet" xlink:href="${xml(logo)}"/>` : ""}<text x="${logo ? 170 : 90}" y="1272" font-family="Arial, Liberation Sans, sans-serif" font-size="20" fill="${d.brand.ink}">${xml(d.brand.signature)}</text><text x="990" y="1272" text-anchor="end" font-family="Arial, Liberation Sans, sans-serif" font-size="20" fill="${d.brand.accent}">${index + 1} / ${d.slides.length}</text></svg>`;
}

export function mediaReferences(d: ProductionDocument): MediaRef[] {
  return d.format === "carrossel"
    ? [d.brand.logo, ...d.slides.map((s) => s.image)].filter(
        (r): r is MediaRef => !!r,
      )
    : d.source
      ? [d.source]
      : [];
}
export function timelineCaptions(d: VideoDocument) {
  let offset = 0;
  const result: { start: number; end: number; text: string }[] = [];
  for (const cut of d.cuts) {
    for (const t of d.transcript) {
      // Não deslocar para outro trecho nem inventar a fala cortada: exige o segmento inteiro.
      if (t.start >= cut.start - 0.05 && t.end <= cut.end + 0.05)
        result.push({
          start: offset + Math.max(0, t.start - cut.start),
          end: offset + Math.min(cut.end, t.end) - cut.start,
          text: t.text,
        });
    }
    offset += cut.end - cut.start;
  }
  return result;
}
// A fala é texto, não marcação de HTML/ASS interpretável pelo renderizador.
function plainCaption(text: string) {
  return text
    .replace(/\{[^}]*\}/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/-->/g, "→");
}
export function toSrt(captions: ReturnType<typeof timelineCaptions>) {
  const time = (s: number) => {
    const n = Math.round(s * 1000);
    return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")},${String(n % 1000).padStart(3, "0")}`;
  };
  return captions
    .map(
      (t, i) =>
        `${i + 1}\n${time(t.start)} --> ${time(t.end)}\n${plainCaption(t.text)}\n`,
    )
    .join("\n");
}

/** Define a resolução da legenda explicitamente: o padrão SRT 384×288 amplia a fonte em vídeos verticais. */
export function toAss(
  captions: ReturnType<typeof timelineCaptions>,
  width: number,
  height: number,
  fontSize: number,
) {
  const time = (seconds: number) => {
    const n = Math.round(seconds * 100);
    return `${Math.floor(n / 360000)}:${String(Math.floor(n / 6000) % 60).padStart(2, "0")}:${String(Math.floor(n / 100) % 60).padStart(2, "0")}.${String(n % 100).padStart(2, "0")}`;
  };
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00161616,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,50,50,80,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${captions.map((t) => `Dialogue: 0,${time(t.start)},${time(t.end)},Default,,0,0,0,,${plainCaption(t.text).replace(/\\/g, "＼")}`).join("\n")}\n`;
}
