import type { CreativeAdaptation } from "./contracts";

export function pendingSlides(units: { position: number }[], arts: { position: number }[]) {
  const ready = new Set(arts.map(a => a.position));
  return units.map(u => u.position).filter(p => !ready.has(p));
}

export function deliveryCaption(doc: CreativeAdaptation["document"]) {
  return [doc.caption.trim(), doc.caption.includes(doc.cta.trim()) ? "" : doc.cta.trim()].filter(Boolean).join("\n\n");
}

export function deliveryFiles(doc: CreativeAdaptation["document"], images: { position: number; bytes: Uint8Array }[]) {
  if (pendingSlides(doc.units, images).length) throw new Error("Ainda faltam artes. Gere os slides pendentes antes de baixar o post completo.");
  if (images.reduce((n, image) => n + image.bytes.byteLength, 0) > 100 * 1024 * 1024) throw new Error("O pacote excede 100 MB. Baixe as artes individualmente.");
  return {
    caption: deliveryCaption(doc),
    review: ["Revise todas as artes e a legenda antes de publicar. Este pacote não publica em nenhuma rede.", ...doc.medical_review_flags, ...doc.clinical_claims_requiring_verification].join("\n"),
    images: [...images].sort((a, b) => a.position - b.position).map(a => ({ name: `slide-${String(a.position).padStart(2, "0")}.png`, bytes: a.bytes })),
  };
}
