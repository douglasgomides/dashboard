import type { BrowserContext } from "@playwright/test";

export const CID = "11111111-1111-4111-8111-111111111111";
export const SID = "22222222-2222-4222-8222-222222222222";
export const client = { id: CID, name: "Clínica de teste", specialty: "Dermatologia", instagram_handle: "teste", active: true, created_at: "2026-01-01T12:00:00Z", em_onboarding: false };

export async function mockAccount(context: BrowserContext, profile: "admin" | "viewer" | "anonymous", options: { failClients?: boolean } = {}) {
  let signedIn = profile !== "anonymous";
  const user = { id: "33333333-3333-4333-8333-333333333333", email: "qa@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
  const claims = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url");
  const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${claims}.fake-signature`, refresh_token: "fake-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  await context.addInitScript(({ session, profile }) => {
    localStorage.removeItem("sb-localhost-auth-token");
    if (profile !== "anonymous") localStorage.setItem("sb-localhost-auth-token", JSON.stringify(session));
  }, { session, profile });

  // Only the local preview assets and fake Supabase transport may be reached.
  // This guard also blocks provider URLs accidentally introduced by a route.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "http:" && ["127.0.0.1", "localhost", "sap.localhost"].includes(url.hostname) && route.request().method() === "GET" && !url.pathname.startsWith("/api/")) return route.continue();
    return route.abort();
  });
  await context.route("http://localhost:9/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const single = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const fulfill = (value: unknown, status = 200) => {
      if (Array.isArray(value) && path.startsWith("/rest/v1/") && !path.includes("/rpc/")) {
        const range = request.headers()["range"]?.split("-").map(Number);
        const offset = Number(url.searchParams.get("offset") ?? range?.[0] ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? (range ? range[1] - range[0] + 1 : 1000));
        value = value.slice(offset, offset + limit);
      }
      return route.fulfill({ status, json: value, headers: request.method() === "HEAD" ? { "content-range": `*/${Array.isArray(value) ? value.length : 0}`, "access-control-expose-headers": "content-range" } : {} });
    };
    if (path === "/auth/v1/token") { signedIn = true; return fulfill(session); }
    if (path === "/auth/v1/logout") { signedIn = false; return fulfill({}); }
    if (path === "/auth/v1/user") return fulfill(signedIn ? user : { message: "No session" }, signedIn ? 200 : 401);
    if (path.startsWith("/auth/v1/")) return fulfill(session);
    if (path === "/rest/v1/rpc/is_app_admin") return fulfill(profile === "admin");
    if (path === "/rest/v1/client_members") return fulfill(single ? { client_id: CID, user_id: user.id, role: "viewer", clients: client } : [{ client_id: CID, user_id: user.id, role: "viewer", clients: client }]);
    if (path === "/rest/v1/clients") {
      if (options.failClients) return fulfill({ message: "simulated unavailable data source" }, 503);
      return fulfill(single ? client : [client]);
    }
    if (path === "/rest/v1/sap_clinicas") {
      if (profile !== "admin") return fulfill(single ? null : []);
      const clinic = { id: SID, client_id: CID, nome: "Clínica de teste", d0: new Date(Date.now() - 86400_000).toISOString().slice(0, 10), status: "onboarding", ticket_medio: 4500, consulta_paga: true, servicos: [], sap_pausas: [] };
      return fulfill(single ? clinic : [clinic]);
    }
    if (path === "/rest/v1/rpc/client_fontes") return fulfill([{ tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true }]);
    if (path === "/rest/v1/rpc/sap_fontes_etapas") return fulfill([{ client_id: CID, tem_crm: true, tem_atendimento: true, tem_anuncios: true, marcos: ["agendado"] }]);
    if (path === "/rest/v1/rpc/tem_modulo") return fulfill(true);
    if (path === "/rest/v1/rpc/conversao_por_origem") return fulfill({ total: 0, pelo_texto: 0, origens: [] });
    if (path === "/rest/v1/rpc/receita_por_canal") return fulfill({ vendas: 0, receita: 0, com_conversa: 0, por_certeza: {}, canais: [] });
    if (path === "/rest/v1/rpc/experimento_atual") return fulfill({ atual: null, ultimo: null, sugestao: null });
    if (path.startsWith("/rest/v1/rpc/")) return fulfill([]);
    return fulfill(single ? null : []);
  });
  // Testes de navegação não podem chamar integrações de produção.
  await context.route("**/api/**", (route) => route.fulfill({ status: 503, json: { error: "API offline in browser tests" } }));
}
