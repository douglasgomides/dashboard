// Doctor Creator MCP (assistentes de IA, só leitura): endereço público do servidor e a lista de ferramentas, a mesma
// que a Edge Function `mcp` expõe (supabase/functions/mcp/protocolo.ts), para as telas de consentimento e de acessos.
export { FERRAMENTAS as FERRAMENTAS_MCP } from "../../supabase/functions/mcp/protocolo";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
export const URL_MCP = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/mcp`;
export const URL_DESCOBERTA_OAUTH = `${SUPABASE_URL.replace(/\/$/, "")}/.well-known/oauth-authorization-server/auth/v1`;
