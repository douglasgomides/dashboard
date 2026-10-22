export type DiscoveryPlatform = "instagram" | "tiktok";
export function publicationUrl(value: unknown, platform: DiscoveryPlatform): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    const valid = platform === "instagram"
      ? /^(www\.)?instagram\.com$/.test(u.hostname) && /^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)
      : /^(www\.)?tiktok\.com$/.test(u.hostname) && /^\/@[^/]+\/(video|photo)\/\d+\/?$/.test(u.pathname);
    if (!valid) return null;
    u.search = ""; u.hash = "";
    return u.href;
  } catch { return null; }
}
export function discoveryInput(platform: DiscoveryPlatform, query: string): Record<string, unknown> {
  if (platform === "tiktok") return { searchQueries: [query.trim()], searchSection: "/video", resultsPerPage: 20, shouldDownloadVideos: false, commentsPerPost: 0 };
  const tag = query.trim().replace(/^#/, "").normalize("NFC");
  if (!/^[\p{L}\p{N}_]{2,100}$/u.test(tag)) throw new Error("No Instagram, informe uma hashtag sem espaços, @ ou endereço de perfil. Ex.: marketingmedico.");
  // Search can return hashtag/profile metadata instead of posts. Request the exact hashtag feed.
  return { directUrls: [`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`], resultsType: "posts", resultsLimit: 20 };
}
export function discoveryFormat(item: Record<string, unknown>, platform: DiscoveryPlatform, url: string): "carrossel" | "reels" | null {
  if (platform === "tiktok") return url.includes("/photo/") || item.isSlideshow === true ? "carrossel" : "reels";
  if (item.type === "Sidecar") return "carrossel";
  if (item.type === "Video" || url.includes("/reel/")) return "reels";
  return null; // Single photos and unknown formats must never be presented as videos.
}

/** PPE events can be final before usageTotalUsd updates. Never settle a known paid event as zero. */
export function apifyRunCost(data: Record<string, any>, expectedItems = 0): number | null {
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  const usage = valid(data.usageTotalUsd) ? data.usageTotalUsd : null;
  if (data.pricingInfo?.pricingModel !== "PAY_PER_EVENT") return usage;
  if (!data.chargedEventCounts || typeof data.chargedEventCounts !== "object") return expectedItems > 0 ? null : usage && usage > 0 ? usage : null;
  const prices = data.pricingInfo.pricingPerEvent?.actorChargeEvents;
  let events = 0, primaryCount = 0;
  if (expectedItems > 0) {
    for (const [key, info] of Object.entries(prices ?? {}) as [string, any][]) {
      if (info.isPrimaryEvent === true && valid(data.chargedEventCounts[key])) primaryCount += data.chargedEventCounts[key];
    }
    if (primaryCount < expectedItems) return null;
  }
  for (const [key, count] of Object.entries(data.chargedEventCounts)) {
    if (!valid(count) || !Number.isInteger(count)) return null;
    if (count === 0) continue;
    const price = prices?.[key]?.eventPriceUsd;
    if (!valid(price)) return null;
    events += count * price;
  }
  return Math.ceil(Math.max(events, usage ?? 0) * 1_000_000) / 1_000_000;
}
