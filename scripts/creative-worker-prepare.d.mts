export function prepareWorker(env?: Record<string, string | undefined>, request?: (url: URL, init?: RequestInit) => Promise<Response>): Promise<{ needsMedia: boolean }>;
