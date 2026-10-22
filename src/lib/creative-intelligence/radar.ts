import { francAll } from "franc-min";
import { publicationUrl } from "./discovery";

export interface RadarReference {
  id: string;
  platform: "instagram" | "tiktok";
  canonical_url: string;
  title: string;
  format: "carrossel" | "reels";
  observed_at?: string;
  metadata: Record<string, unknown>;
}
export interface SavedReference {
  id: string;
  client_id: string;
  account_id: string;
  canonical_url: string;
  discovery_id: string;
  saved_at: string;
  pauta_id: string | null;
  discovery: RadarReference;
}
export const SPECIALTIES = [
  { id: "dermatologia", label: "Dermatologia", terms: ["dermato", "pele", "acne", "melasma", "rosacea", "psoriase", "alopecia"] },
  { id: "ginecologia", label: "Ginecologia", terms: ["gineco", "menopausa", "climaterio", "menstru", "endometriose", "gestacao", "obstetr"] },
  { id: "odontologia", label: "Odontologia", terms: ["odonto", "dentist", "dente", "sorriso", "implante dent", "ortodont"] },
  { id: "cardiologia", label: "Cardiologia", terms: ["cardio", "coracao", "hipertensao", "pressao arterial", "arritmia"] },
  { id: "oftalmologia", label: "Oftalmologia", terms: ["oftalmo", "visao", "olhos", "catarata", "glaucoma"] },
  { id: "ortopedia", label: "Ortopedia", terms: ["ortoped", "articulac", "coluna", "joelho", "fratura"] },
  { id: "pediatria", label: "Pediatria", terms: ["pediatr", "crianca", "infantil", "bebe", "amament"] },
  { id: "cirurgia_plastica", label: "Cirurgia plástica", terms: ["cirurgia plastica", "cirurgiao plastico", "rinoplastia", "mamoplastia", "abdominoplastia"] },
] as const;
export const LANGUAGES: Record<string, string> = { pt: "Português", es: "Espanhol", en: "Inglês", fr: "Francês", it: "Italiano", de: "Alemão" };
const ISO: Record<string, string> = { por: "pt", spa: "es", eng: "en", fra: "fr", ita: "it", deu: "de" };
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const referenceText = (d: RadarReference) => typeof d.metadata?.caption === "string" ? d.metadata.caption.slice(0, 12000) : d.title;
/** Language is an estimate from public text, never a verified country or nationality. */
export function referenceLanguage(d: RadarReference): string | null {
  const text = referenceText(d).replace(/https?:\/\/\S+|[@#][\p{L}\p{N}_]+/gu, " ");
  if (text.replace(/\s/g, "").length < 40) return null;
  const [first, second] = francAll(text, { minLength: 40 });
  if (!first || first[0] === "und" || (second && first[1] - second[1] < 0.02)) return null;
  return ISO[first[0]] ?? null;
}
export interface RadarFilters { topic: string; specialty: string; language: string; since: string; until: string; format: string; savedOnly: boolean }
export const EMPTY_RADAR_FILTERS: RadarFilters = { topic: "", specialty: "", language: "", since: "", until: "", format: "", savedOnly: false };
export function radarReferences(rows: RadarReference[], saved: SavedReference[], f: RadarFilters, languageOf: (d: RadarReference) => string | null = referenceLanguage) {
  const byUrl = new Map<string, RadarReference>();
  for (const d of [...rows, ...saved.map(s => s.discovery).filter(Boolean)].sort((a, b) => (Date.parse(b.observed_at ?? "") || 0) - (Date.parse(a.observed_at ?? "") || 0))) {
    const url = publicationUrl(d.canonical_url, d.platform);
    if (url && !byUrl.has(url)) byUrl.set(url, d);
  }
  const savedUrls = new Set(saved.map(s => s.canonical_url));
  const terms = norm(f.topic).trim().split(/\s+/).filter(Boolean);
  const specialty = SPECIALTIES.find(s => s.id === f.specialty);
  return [...byUrl.values()].filter(d => {
    const text = norm(referenceText(d));
    if (terms.some(t => !text.includes(t))) return false;
    if (specialty && !specialty.terms.some(t => text.includes(t))) return false;
    if (f.language && (languageOf(d) ?? "unknown") !== f.language) return false;
    if (f.format && d.format !== f.format) return false;
    if (f.savedOnly && !savedUrls.has(publicationUrl(d.canonical_url, d.platform)!)) return false;
    const posted = typeof d.metadata?.posted_at === "string" ? Date.parse(d.metadata.posted_at) : NaN;
    if (f.since && (!Number.isFinite(posted) || posted < Date.parse(`${f.since}T00:00:00Z`))) return false;
    if (f.until && (!Number.isFinite(posted) || posted >= Date.parse(`${f.until}T00:00:00Z`) + 86400000)) return false;
    return true;
  });
}
