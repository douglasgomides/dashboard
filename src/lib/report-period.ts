/** A clipped Meta response must not be presented as the full requested period. */
export function completeInstagramPeriod<T extends { de: string; ate: string; recortado?: boolean }>(data: T | null | undefined, start: string, end: string): T | null {
  return data && !data.recortado && data.de === start && data.ate === end ? data : null;
}
