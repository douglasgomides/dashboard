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

// ---------------------------------------------------------------------------------------------------------------------
// Origem da abertura, clique, dedupe e linha pendente (plano 02-02).

export type AcaoHistorico = "PUSH" | "REPLACE" | "BACK" | "FORWARD" | "GO";

// Marcador deixado pelo clique em um menu ou na lista do Cmd+K, consumido pela navegação seguinte (Pitfall 8).
export interface Marcador {
  origem: "menu" | "busca";
  em: number;
}

// D-07: a mesma rota, na mesma clínica e na mesma sessão, aberta de novo em menos de 2 s conta uma vez.
export const JANELA_DEDUPE_MS = 2000;
// Um marcador de clique que ninguém consumiu em 10 s é de outra navegação e não vale mais.
export const VALIDADE_MARCADOR_MS = 10000;
// Quanto cada linha espera antes de ir ao banco, para um REPLACE do próprio app poder descartá-la (D-16).
// Menor que JANELA_DEDUPE_MS: todas as linhas atrasam igual, então o dedupe conta igual.
export const ESPERA_ASSENTAR_MS = 500;

// Decide de onde veio a abertura da tela a partir das ações do histórico acumuladas desde a resolução anterior.
// Ordem de decisão:
//  1. qualquer REPLACE vira redirecionamento (cobre throw redirect, Navigate replace e navigate com replace).
//     Exceção aceita pelo João na D-10 (09/11/2026): a URL digitada fora da forma canônica é reescrita pelo
//     Transitioner com replace e por isso sai como redirecionamento; a canônica sai como direto (Pitfall 4 da pesquisa).
//     D-16: esta função nunca grava a rota abandonada de um redirect. A tela negada pelos guardas do admin e do SAP
//     entra só por registrarBloqueada (origem bloqueada), e as 12 rotas que só redirecionam pela configuração nunca
//     ganham linha por redirecionarem: quem passa por elas aparece só na tela de destino.
//  2. primeira tela da aba, sem ação nenhuma: direto;
//  3. voltar, avançar ou ir (BACK, FORWARD, GO): link (CD-02);
//  4. PUSH com marcador ainda válido: a origem do marcador (menu ou busca); senão link.
export function origemDaNavegacao(entrada: {
  acoes: readonly AcaoHistorico[];
  primeira: boolean;
  marcador: Marcador | null;
  agora: number;
}): Origem {
  const { acoes, primeira, marcador, agora } = entrada;
  if (acoes.includes("REPLACE")) return "redirecionamento";
  if (acoes.length === 0) return primeira ? "direto" : "link";
  const ultima = acoes[acoes.length - 1];
  if (ultima === "BACK" || ultima === "FORWARD" || ultima === "GO") return "link";
  if (marcador && agora - marcador.em <= VALIDADE_MARCADOR_MS) return marcador.origem;
  return "link";
}

// Replica a guarda do Link do router (só navega com botão 0, sem Ctrl/Meta/Alt/Shift e com target ausente ou _self)
// e devolve a origem declarada pelo contêiner mais próximo (data-origem), ou null quando não é para marcar.
export function origemDoClique(entrada: {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  ehLink: boolean;
  alvoDoLink: string | null | undefined;
  origemDoContainer: string | null | undefined;
}): "menu" | "busca" | null {
  if (!entrada.ehLink) return null;
  if (entrada.button !== 0 || entrada.ctrlKey || entrada.metaKey || entrada.altKey || entrada.shiftKey) return null;
  const alvo = entrada.alvoDoLink ?? "";
  if (alvo !== "" && alvo !== "_self") return null;
  if (entrada.origemDoContainer === "menu" || entrada.origemDoContainer === "busca") return entrada.origemDoContainer;
  return null;
}

// D-16: o que fazer com a linha pendente quando chega uma ação do histórico.
//  - REPLACE para outro pathname é o próprio app abandonando a tela (os useEffect de _authenticated.$clientId.tsx,
//    um Navigate replace, um redirect de guarda): a tela não ganha linha e o destino grava redirecionamento;
//  - REPLACE no mesmo pathname só muda a query string (troca de período): a tela continua, a linha espera;
//  - PUSH, BACK, FORWARD e GO: a tela foi mostrada e quem saiu foi o usuário, então grava agora.
export function decidirPendente(
  acao: AcaoHistorico,
  pathnamePendente: string,
  pathnameNovo: string,
): "descartar" | "esperar" | "gravar" {
  if (acao === "REPLACE") return pathnamePendente === pathnameNovo ? "esperar" : "descartar";
  return "gravar";
}

export interface Deduplicador {
  (linha: LinhaRota): boolean;
  // Quantas chaves ainda estão dentro da janela (para o teste).
  tamanho(): number;
}

// D-07: devolve true quando a linha é duplicata. A janela conta a partir da última vez que a chave foi aceita;
// uma duplicata não renova o prazo. Chave: rota + client_id (ou vazio) + sessao.
export function criarDeduplicador(now: () => number = Date.now): Deduplicador {
  const vistas = new Map<string, number>();
  const limpar = (agora: number) => {
    for (const [chave, quando] of vistas) {
      if (agora - quando >= JANELA_DEDUPE_MS) vistas.delete(chave);
    }
  };
  const verificar = ((linha: LinhaRota): boolean => {
    const agora = now();
    limpar(agora);
    const chave = `${linha.rota}|${linha.client_id ?? ""}|${linha.sessao}`;
    if (vistas.has(chave)) return true;
    vistas.set(chave, agora);
    return false;
  }) as Deduplicador;
  verificar.tamanho = () => vistas.size;
  return verificar;
}
