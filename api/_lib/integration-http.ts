/** Hosts que podem receber as credenciais dos conectores configuráveis. */
export function integrationHost(value: string, provider: "kommo" | "digisac"): string {
  const host = value.trim().toLowerCase();
  const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
  const suffix = provider === "kommo" ? "(?:kommo\\.com|amocrm\\.(?:com|ru))" : "digisac\\.io";
  if (new RegExp(`^${label}$`).test(host)) return `${host}.${provider === "kommo" ? "kommo.com" : "digisac.io"}`;
  if (!new RegExp(`^${label}\\.${suffix}$`).test(host)) throw new Error(`Domínio ${provider} inválido`);
  return host;
}

/** Nunca segue redirecionamentos carregando o token para outra origem. */
export function integrationRequest(options: RequestInit = {}): RequestInit {
  return { ...options, redirect: "error", signal: options.signal ?? AbortSignal.timeout(30_000) };
}

/** Paginação da Graph também deve continuar na origem que recebeu o token. */
export function graphPageUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "graph.facebook.com" || url.port || url.username || url.password) {
    throw new Error("URL de paginação da Meta inválida");
  }
  return url.toString();
}
