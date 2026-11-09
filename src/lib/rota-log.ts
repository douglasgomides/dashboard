// Regras puras do log por rota (Phase 2). Não importa supabase, React nem router: roda em tsx.
//
// D-06: o que vai para o banco é a rota PADRÃO da tela (o routeId do router, ex.: "/_authenticated/$clientId/"),
// nunca a URL aberta. Query string, hash, id de paciente e UUID ficam de fora por construção: montarLinha só lê o
// routeId e devolve exatamente quatro chaves; o único valor vindo da URL é o clientId, e só se for um UUID.
// O banco repete a regra em CHECK (23514) para o caso de alguém montar o POST à mão.

export type Origem = "menu" | "busca" | "link" | "direto" | "redirecionamento" | "bloqueada";

export const ORIGENS: readonly Origem[] = ["menu", "busca", "link", "direto", "redirecionamento", "bloqueada"];

export interface LinhaRota {
  client_id: string | null;
  rota: string;
  origem: Origem;
  sessao: string;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// D-04 (confirmado pelo João em 09/11/2026): só estes três hosts gravam. Nada de sufixo genérico nem de *.vercel.app.
export const HOSTS_DE_PRODUCAO: ReadonlySet<string> = new Set([
  "dash.doctorcreator.com.br",
  "nexo.doctorcreator.com.br",
  "sap.doctorcreator.com.br",
]);

// O Supabase falso do e2e (sem banco por trás). Os três valores precisam continuar iguais:
// esta constante, VITE_SUPABASE_URL em playwright.config.ts e VITE_SUPABASE_URL em .github/workflows/quality.yml.
export const SUPABASE_FALSO_DO_E2E = "http://localhost:9";

// D-04 e CD-01: grava nos hosts de produção; fora deles, só quando a chave do e2e está ligada E o bundle foi
// construído com o Supabase falso. Com qualquer outro Supabase a chave não vale, então preview e local nunca
// gravam em rota_acessos de verdade.
export function deveGravar(host: string, forcar: boolean, supabaseUrl: string | undefined): boolean {
  if (HOSTS_DE_PRODUCAO.has((host ?? "").toLowerCase())) return true;
  return forcar === true && supabaseUrl === SUPABASE_FALSO_DO_E2E;
}

// Só a área logada (e a tela de sem acesso) entra no log.
export function rotaRegistravel(routeId: string | undefined | null): boolean {
  if (!routeId) return false;
  return routeId.startsWith("/_authenticated") || routeId === "/sem-acesso";
}

// Devolve a linha a gravar ou null. Comprimento e igualdade são os do texto do padrão da tela, sem normalização.
export function montarLinha(entrada: {
  routeId: string | undefined | null;
  params: Record<string, unknown> | undefined | null;
  origem: Origem;
  sessao: string;
}): LinhaRota | null {
  const { routeId, params, origem, sessao } = entrada;
  if (!routeId || !rotaRegistravel(routeId)) return null;
  if (routeId.includes("?") || routeId.includes("#") || routeId.length > 200) return null;
  let clientId: string | null = null;
  if (routeId.includes("$clientId")) {
    // Endereço desconhecido que caiu em $clientId (clínica ausente, nula ou que não é UUID): não grava (CD-06).
    const valor = params?.clientId;
    if (typeof valor !== "string" || !UUID.test(valor)) return null;
    clientId = valor;
  }
  return { client_id: clientId, rota: routeId, origem, sessao };
}

// Tabela ou função ainda não criada (a migration só existe depois que o João aplica). CD-08.
export function ehTabelaAusente(erro: { code?: string | null; status?: number | null } | null | undefined): boolean {
  if (!erro) return false;
  if (erro.code === "42P01" || erro.code === "42883" || erro.code === "PGRST202" || erro.code === "PGRST205") return true;
  return erro.status === 404;
}
