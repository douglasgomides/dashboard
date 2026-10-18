import { safeLoginRedirect } from "@/lib/auth-session";

/** Preserve a protected deep link without allowing navigation to another origin. */
export function loginDestination(candidate: string | undefined, origin: string): string | null {
  return safeLoginRedirect(candidate, origin);
}
