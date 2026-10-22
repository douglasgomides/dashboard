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

export function postImageLayout(width: number, height: number) {
  if (!(width > 0 && height > 0)) throw new Error("Imagem sem dimensões válidas");
  const scale = Math.min(1080 / width, 1350 / height);
  return { width: width * scale, height: height * scale, x: (1080 - width * scale) / 2, y: (1350 - height * scale) / 2 };
}

/** Ajusta ao feed 4:5 mantendo a imagem inteira: nenhum texto é cortado. */
export async function preparePostImage(bytes: Uint8Array): Promise<Uint8Array> {
  const image = await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/png" }));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a imagem para download");
    ctx.drawImage(image, 0, 0);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    ctx.fillStyle = a === 255 ? `rgb(${r},${g},${b})` : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const layout = postImageLayout(image.width, image.height);
    ctx.drawImage(image, layout.x, layout.y, layout.width, layout.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Não foi possível preparar a imagem")), "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { image.close(); }
}
