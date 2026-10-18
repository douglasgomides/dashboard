export const CAPTION_BACKGROUND = "#101318";
export const DEFAULT_CAPTION_SIZE = 48;

export function hasEmbeddedCaptions(document: {
  sourceHasCaptions?: boolean;
  motion?: { source_has_captions: boolean };
}) {
  return document.sourceHasCaptions ?? document.motion?.source_has_captions ?? false;
}

function luminance(color: string) {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const s = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function captionContrast(color: string) {
  if (!/^#[a-fA-F0-9]{6}$/.test(color)) return 0;
  const a = luminance(color), b = luminance(CAPTION_BACKGROUND);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function readableCaptionAccent(color: string) {
  return captionContrast(color) >= 4.5 ? color : "#F4D77C";
}
