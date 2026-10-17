/** Preserve a protected deep link without allowing navigation to another origin. */
export function loginDestination(candidate: string | undefined, origin: string): string | null {
  if (!candidate?.startsWith("/") || /[\\\u0000-\u0020]/.test(candidate)) return null;
  try {
    const url = new URL(candidate, origin);
    if (url.origin !== origin || url.pathname.startsWith("/login")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
