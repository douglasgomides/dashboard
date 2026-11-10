// Registro único das telas do Nexo (Phase 3, MENU-01). Uma linha por folha do roteador (85, lidas de src/routeTree.gen.ts)
// mais 2 atalhos de rótulo de /ideias = 87 linhas: 14 vivas + 70 escondidas + 3 tiradas (contagem aceita pelo João, D-04).
//
// Por que um registro só: o menu da equipe, a busca "Buscar tela" e o teste do CI (scripts/test-registro-de-telas.ts) leem
// daqui. Assim uma tela nova sem linha faz o teste falhar, em vez de sumir do menu e da busca sem ninguém perceber.
//
// Esconder nunca é bloquear (D-07): "situacao" só decide o que aparece no menu e na busca. Nenhuma tela escondida deixa de
// abrir por link e nenhuma rota ganha guarda por causa deste arquivo. Quem decide acesso continua sendo o RLS do Supabase e os
// beforeLoad que já existem em /admin e /sap.
//
// Módulo sem componente React: roda em tsx no npm test. Rótulos e descrições vêm de nav.ts e sap-navigation.ts (que não
// mudam nesta fase) para que o médico e a equipe leiam o mesmo nome da mesma tela.
import { AREAS, AVANCADO, type ContentView, type Fonte, type NavTab } from "./nav";
import { ITENS as ITENS_SAP } from "./sap-navigation";

export type Situacao = "viva" | "escondida" | "tirada";
export type AreaAntiga = "Resultados" | "Marketing" | "Comercial" | "Plano de ação" | "Relatórios" | "Administração" | "SAP";
export type PapelEquipe = "admin" | "owner" | "strategist" | "viewer";

export interface PerfilEquipe {
  isAdmin: boolean;
  papel?: PapelEquipe | null;
}

// Nomes dos ícones Tabler. O desenho de cada um entra no plano 03-02 (SVG inline, sem pacote novo); aqui é só o nome.
export type NomeIcone =
  | "briefcase" | "stethoscope" | "shield-check" | "shield-off" | "snowflake" | "search" | "menu-2" | "chevron-right"
  | "chevron-down" | "chevron-left" | "arrow-right" | "x" | "logout"
  | "chart-bar" | "users" | "speakerphone" | "filter" | "brand-instagram" | "file-text" | "calendar" | "message-circle"
  | "checklist" | "settings" | "plug" | "robot" | "bulb" | "link" | "target" | "inbox" | "layout-dashboard";

export interface TelaDoRegistro {
  /** routeId do roteador (como em FileRoutesById), ex.: /_authenticated/$clientId/pacientes. */
  rota: string;
  situacao: Situacao;
  rotulo: string;
  descricao?: string;
  termos?: string;
  area: AreaAntiga;
  icone: NomeIcone;
  fonte?: Fonte;
  /** Só nos 2 atalhos de rótulo de /ideias. */
  busca?: { visao: ContentView };
  /** Chip "sem selo": o número desta tela ainda não tem selo de confiança (rótulo estático até a Phase 6/9). */
  semSelo?: true;
  /** SAP: congelado nesta fase (nada do SAP muda). */
  congelado?: true;
  /** A rota só redireciona (mesmo conjunto que ROTAS_SO_REDIRECIONAM da Phase 2): fica fora do índice da busca. */
  soRedireciona?: true;
  /** Rota de acesso (MENU-07): login, primeiro acesso, sem acesso etc. Sempre viva, nunca no menu nem na busca. */
  acesso?: true;
  /** Só nas tiradas: routeId para onde a pessoa vai (o teste confere que existe na árvore). */
  destino?: string;
  /** Só aparece na busca de quem é admin do app (guarda existente em /admin e /sap, ou NavTab admin). */
  somenteAdmin?: true;
  /** Só existe no build de desenvolvimento (/qa/layout). */
  soDesenvolvimento?: true;
}

// Rótulos do menu da equipe. PROVISÓRIOS: são a decisão 11 do João, aceita assim por D-11; trocar o nome muda só esta
// constante (os testes leem daqui). Nunca repetir estes textos soltos no código.
export const ROTULOS_MENU_EQUIPE = {
  carteira: "Carteira",
  clinica: "Clínica",
  conferencia: "Conferência e fontes",
} as const;

// /r/:slug é rewrite da Vercel (vercel.json), fora do roteador: não tem linha na árvore, mas é rota de acesso (MENU-07).
export const ROTAS_DE_ACESSO_FORA_DA_ARVORE: readonly string[] = ["/r/:slug"];

type Extra = Partial<Omit<TelaDoRegistro, "rota" | "situacao" | "icone">>;

// Procura a aba do menu do médico pelo caminho (sufixo depois de /$clientId, ou absoluto no AVANCADO) para reaproveitar
// rótulo, descrição, termos, fonte e a marca admin. Falha alto se a aba sumir de nav.ts: assim o registro não fica com
// rótulo vazio em silêncio.
function daNav(caminho: string, visao?: ContentView): Extra {
  for (const area of AREAS) {
    const tab = area.tabs.find((t) => !t.absoluto && t.path === caminho && (visao === undefined || t.search?.visao === visao));
    if (tab) return deTab(tab, area.label as AreaAntiga);
  }
  const avancado = AVANCADO.find((t) => t.path === caminho);
  if (avancado) return deTab(avancado, "Administração");
  throw new Error(`registro-de-telas: nenhuma aba de nav.ts com o caminho ${caminho}`);
}

function deTab(tab: NavTab, area: AreaAntiga): Extra {
  return {
    rotulo: tab.label,
    area,
    ...(tab.descricao ? { descricao: tab.descricao } : {}),
    ...(tab.termos ? { termos: tab.termos } : {}),
    ...(tab.fonte ? { fonte: tab.fonte } : {}),
    ...(tab.admin ? { somenteAdmin: true as const } : {}),
  };
}

function daSap(sub: string): string {
  const item = ITENS_SAP.find((i) => i.sub === sub);
  if (!item) throw new Error(`registro-de-telas: nenhum item do SAP com o caminho ${sub}`);
  return item.label;
}

function linha(rota: string, situacao: Situacao, icone: NomeIcone, extra: Extra): TelaDoRegistro {
  if (!extra.rotulo || !extra.area) throw new Error(`registro-de-telas: ${rota} sem rótulo ou área`);
  return { rota, situacao, icone, ...extra } as TelaDoRegistro;
}

const C = "/_authenticated/$clientId";
const A = "/_authenticated/admin";
const SAP_CLINICA = "/_authenticated/sap/$clientId";

// Telas de acesso (MENU-07): sempre vivas, nunca no índice. A área não aparece em lugar nenhum; fica "Administração" só para
// o tipo ser o mesmo de todas as linhas.
const acesso = (rota: string, rotulo: string, extra: Extra = {}) =>
  linha(rota, "viva", "shield-check", { rotulo, area: "Administração", acesso: true, ...extra });

// SAP congelado (MENU-07): os 30 ids ficam escondidos, com chip "congelado" e só para o admin do app (guarda de /sap).
const sap = (rota: string, rotulo: string, extra: Extra = {}) =>
  linha(rota, "escondida", "snowflake", { rotulo, area: "SAP", congelado: true, somenteAdmin: true, ...extra });

const ADMIN = { area: "Administração" as const, somenteAdmin: true as const };

export const REGISTRO_DE_TELAS: readonly TelaDoRegistro[] = [
  // Vivas: acesso (7)
  acesso("/login", "Entrar"),
  acesso("/reset-password", "Redefinir senha"),
  acesso("/conhecer", "Conheça o Nexo"),
  acesso("/_authenticated/bem-vindo", "Primeiro acesso"),
  acesso("/_authenticated/oauth/consent", "Autorizar um aplicativo"),
  acesso("/sem-acesso", "Sem acesso"),
  acesso("/_authenticated/", "Entrada do Nexo", { soRedireciona: true }),

  // Vivas: telas da equipe (7)
  linha(`${A}/`, "viva", "briefcase", { rotulo: ROTULOS_MENU_EQUIPE.carteira, descricao: "Clientes do Nexo", termos: "clientes todos carteira portfolio", ...ADMIN }),
  linha(`${C}/`, "viva", "layout-dashboard", { ...daNav(""), semSelo: true }),
  linha(`${C}/relatorio`, "viva", "file-text", { ...daNav("/relatorio"), semSelo: true }),
  linha(`${C}/crm-estrutura`, "viva", "settings", daNav("/crm-estrutura")),
  linha(`${A}/$clientId`, "viva", "settings", daNav("/admin/$clientId")),
  linha(`${A}/conferencia`, "viva", "shield-check", { rotulo: "Conferência de dados", descricao: "Confira se os números de cada fonte batem", termos: "conferencia fontes dados conferir numeros", ...ADMIN }),
  linha(`${A}/integracoes`, "viva", "plug", { rotulo: "Integrações", descricao: "Contas e fontes ligadas a cada clínica", termos: "integracoes fontes conexoes contas", ...ADMIN }),

  // Escondidas: telas da clínica
  linha(`${C}/pacientes`, "escondida", "users", { ...daNav("/pacientes"), semSelo: true }),
  linha(`${C}/anuncios`, "escondida", "speakerphone", { ...daNav("/anuncios"), semSelo: true }),
  linha(`${C}/crm-painel`, "escondida", "filter", { ...daNav("/crm-painel"), semSelo: true }),
  linha(`${C}/vendas-kommo`, "escondida", "chart-bar", { ...daNav("/vendas-kommo"), semSelo: true }),
  linha(`${C}/conteudo`, "escondida", "brand-instagram", daNav("/conteudo")),
  linha(`${C}/conteudo-comercial`, "escondida", "chart-bar", daNav("/conteudo-comercial")),
  linha(`${C}/audiencia`, "escondida", "users", daNav("/audiencia")),
  linha(`${C}/top`, "escondida", "brand-instagram", daNav("/top")),
  linha(`${C}/posts`, "escondida", "brand-instagram", daNav("/posts")),
  // A rota /ideias fica com o rótulo da visão padrão; os outros 2 rótulos são tirados (linhas no fim).
  linha(`${C}/ideias`, "escondida", "file-text", daNav("/ideias", "roteiros")),
  linha(`${C}/inteligencia-criativa`, "escondida", "bulb", daNav("/inteligencia-criativa")),
  linha(`${C}/inspiracao`, "escondida", "bulb", daNav("/inspiracao")),
  linha(`${C}/duvidas`, "escondida", "message-circle", daNav("/duvidas")),
  linha(`${C}/campanhas`, "escondida", "target", daNav("/campanhas")),
  linha(`${C}/links`, "escondida", "link", daNav("/links")),
  linha(`${C}/central-atendimento`, "escondida", "inbox", daNav("/central-atendimento")),
  linha(`${C}/atendimento`, "escondida", "message-circle", daNav("/atendimento")),
  linha(`${C}/crm-contatos`, "escondida", "users", daNav("/crm-contatos")),
  linha(`${C}/crm-guia`, "escondida", "file-text", daNav("/crm-guia")),
  linha(`${C}/jornada`, "escondida", "filter", daNav("/jornada")),
  linha(`${C}/plano`, "escondida", "calendar", daNav("/plano")),
  linha(`${C}/reunioes`, "escondida", "calendar", daNav("/reunioes")),
  linha(`${C}/proximas-acoes`, "escondida", "checklist", daNav("/proximas-acoes")),
  linha(`${C}/agentes`, "escondida", "robot", daNav("/agentes")),
  linha(`${C}/oportunidades`, "escondida", "bulb", daNav("/oportunidades")),
  // Telas sem aba no menu do médico: rótulo e descrição novos, em português claro.
  linha(`${C}/analisar`, "escondida", "filter", { rotulo: "Papel de cada funil", descricao: "O que cada etapa do CRM conta hoje e o que ela significa.", termos: "funil etapas crm analisar cards significado", area: "Comercial" }),
  linha(`${C}/automacoes`, "escondida", "robot", { rotulo: "Automações", descricao: "Tarefas que o Nexo faz sozinho. Tela ainda em construção.", termos: "automacoes automatico robo", area: "Plano de ação" }),
  linha(`${C}/consultas`, "escondida", "users", { rotulo: "O que virou paciente", descricao: "Contatos que viraram consulta. Tela ainda em construção.", termos: "consultas pacientes agendamentos", area: "Resultados" }),
  linha(`${C}/vendas`, "escondida", "chart-bar", { rotulo: "O que virou venda", descricao: "Contatos que viraram venda. Tela ainda em construção.", termos: "vendas faturamento fechamentos", area: "Resultados" }),
  linha(`${C}/aquisicao`, "escondida", "snowflake", { rotulo: "Aquisição (leva ao SAP)", area: "SAP", soRedireciona: true }),
  linha(`${C}/conversas`, "escondida", "message-circle", { rotulo: "Conversas (leva ao atendimento)", area: "Comercial", soRedireciona: true }),
  linha("/_authenticated/assistentes-ia", "escondida", "robot", { rotulo: "Assistentes de IA", descricao: "Ligue o Claude e outros assistentes aos dados do Nexo (Doctor Creator MCP).", termos: "assistentes ia mcp claude chatgpt", area: "Administração" }),

  // Escondidas: administração (rótulos copiados de ITENS de _authenticated.admin.tsx; não se importa arquivo de rota)
  linha(`${A}/caixa`, "escondida", "inbox", { rotulo: "Caixa de entrada", ...ADMIN }),
  linha(`${A}/referencia`, "escondida", "chart-bar", { rotulo: "Referência entre clientes", ...ADMIN }),
  linha(`${A}/relatorios`, "escondida", "file-text", { rotulo: "Relatórios da semana", ...ADMIN }),
  linha(`${A}/agentes`, "escondida", "robot", { rotulo: "Central de Agentes", ...ADMIN }),
  linha(`${A}/brain`, "escondida", "bulb", { rotulo: "Brand Brain", ...ADMIN }),
  linha(`${A}/equipe`, "escondida", "users", { rotulo: "Equipe", ...ADMIN }),
  linha(`${A}/aquisicao`, "escondida", "snowflake", { rotulo: "Aquisição (leva ao SAP)", ...ADMIN, soRedireciona: true }),

  // Escondidas: SAP congelado (30)
  sap("/_authenticated/sap/", "Todas as clínicas (SAP)"),
  sap("/_authenticated/sap/comece", "Comece aqui"),
  sap("/_authenticated/sap/docs", "Documentos do SAP"),
  sap("/_authenticated/sap/guia", "Como operamos"),
  sap("/_authenticated/sap/venda", "Diagnósticos de venda"),
  sap(`${SAP_CLINICA}/`, daSap("")),
  sap(`${SAP_CLINICA}/plano`, daSap("/plano")),
  sap(`${SAP_CLINICA}/painel`, daSap("/painel")),
  sap(`${SAP_CLINICA}/cronograma`, daSap("/cronograma")),
  sap(`${SAP_CLINICA}/sessao`, daSap("/sessao")),
  sap(`${SAP_CLINICA}/onboarding`, daSap("/onboarding")),
  sap(`${SAP_CLINICA}/rastreamento`, daSap("/rastreamento")),
  sap(`${SAP_CLINICA}/anuncios`, daSap("/anuncios")),
  sap(`${SAP_CLINICA}/etapas`, daSap("/etapas")),
  sap(`${SAP_CLINICA}/papeis`, daSap("/papeis")),
  sap(`${SAP_CLINICA}/leitura`, daSap("/leitura")),
  sap(`${SAP_CLINICA}/execucao`, daSap("/execucao")),
  sap(`${SAP_CLINICA}/midia`, daSap("/midia")),
  sap(`${SAP_CLINICA}/agentes`, daSap("/agentes")),
  sap(`${SAP_CLINICA}/gerador`, daSap("/gerador")),
  sap(`${SAP_CLINICA}/metas`, daSap("/metas")),
  sap(`${SAP_CLINICA}/documentos`, daSap("/documentos")),
  sap(`${SAP_CLINICA}/formulario`, "Formulário da clínica"),
  sap(`${SAP_CLINICA}/semana`, "Semana (leva a Minhas tarefas)", { soRedireciona: true }),
  sap(`${SAP_CLINICA}/passo-a-passo`, "Passo a passo (leva a Minhas tarefas)", { soRedireciona: true }),
  sap(`${C}/sap/`, "SAP da clínica (endereço antigo)", { soRedireciona: true }),
  sap(`${C}/sap/etapas`, "Etapas do SAP (endereço antigo)", { soRedireciona: true }),
  sap(`${C}/sap/execucao`, "Execução do SAP (endereço antigo)", { soRedireciona: true }),
  sap(`${C}/sap/leitura`, "Leitura do SAP (endereço antigo)", { soRedireciona: true }),
  sap(`${C}/sap/metas`, "Metas do SAP (endereço antigo)", { soRedireciona: true }),

  // Escondida só em desenvolvimento (D-09: conta entre as 60 que abrem em DEV; o build de produção devolve notFound).
  linha("/qa/layout", "escondida", "layout-dashboard", { rotulo: "Layout de QA", descricao: "Página de conferência visual (só em desenvolvimento).", area: "Administração", soDesenvolvimento: true }),

  // Tiradas (3): saem do menu e da busca da equipe, mas o endereço continua abrindo (MENU-04, sem 404).
  // /marketing já redireciona para /conteudo no beforeLoad do arquivo da rota (D-05); o arquivo não muda.
  linha(`${C}/marketing`, "tirada", "speakerphone", { rotulo: "Visão geral de Marketing", area: "Marketing", soRedireciona: true, destino: `${C}/conteudo` }),
  // Atalhos de rótulo: a tela /ideias fica (com "Revisar roteiros"); só estes 2 rótulos saem para a equipe.
  linha(`${C}/ideias`, "tirada", "calendar", { ...daNav("/ideias", "semana"), busca: { visao: "semana" }, destino: `${C}/ideias` }),
  linha(`${C}/ideias`, "tirada", "bulb", { ...daNav("/ideias", "ideias"), busca: { visao: "ideias" }, destino: `${C}/ideias` }),
];

/** Equipe = admin do app ou estrategista da clínica (D-03). Owner e viewer são o médico. */
export function ehEquipe(perfil: PerfilEquipe): boolean {
  return perfil.isAdmin || perfil.papel === "strategist";
}

export interface OpcoesDoIndice {
  /** true só no build de desenvolvimento (import.meta.env.DEV): inclui /qa/layout. */
  desenvolvimento?: boolean;
}

/**
 * Linhas que a busca da equipe indexa. Fora: tiradas, rotas que só redirecionam, rotas de acesso e /qa/layout fora de DEV.
 * Para quem não é admin do app, fora também o que é só de admin e o SAP: abrir esses links daria em redirect e gravaria
 * "bloqueada" no log (D-03). Não há filtro de fonte, soCrm nem semAudiencia: a equipe acha toda tela em qualquer clínica.
 */
export function indiceDaBusca(perfil: PerfilEquipe, opcoes: OpcoesDoIndice = {}): TelaDoRegistro[] {
  return REGISTRO_DE_TELAS.filter(
    (t) =>
      t.situacao !== "tirada" &&
      !t.soRedireciona &&
      !t.acesso &&
      (!t.soDesenvolvimento || !!opcoes.desenvolvimento) &&
      (perfil.isAdmin || (!t.somenteAdmin && !t.congelado)),
  );
}

/** Ordem das áreas antigas em "Ver todas as telas" (UI-SPEC §Busca de telas, item 5). */
export const ORDEM_DAS_AREAS: readonly AreaAntiga[] = [
  "Resultados",
  "Marketing",
  "Comercial",
  "Plano de ação",
  "Relatórios",
  "Administração",
  "SAP",
];

export interface GrupoDeTelas {
  area: AreaAntiga;
  telas: TelaDoRegistro[];
}

/**
 * Índice da busca agrupado por área antiga, na ordem do UI-SPEC, para o details "Ver todas as telas". Área sem tela some.
 * A soma dos grupos é sempre o tamanho de indiceDaBusca com as mesmas opções.
 */
export function telasPorArea(perfil: PerfilEquipe, opcoes: OpcoesDoIndice = {}): GrupoDeTelas[] {
  const indice = indiceDaBusca(perfil, opcoes);
  return ORDEM_DAS_AREAS.map((area) => ({ area, telas: indice.filter((t) => t.area === area) })).filter((g) => g.telas.length > 0);
}

// --- Seções da clínica (10/11/2026, pedido do João: "entrar em uma seção, como marketing, e ir navegando por dentro") ---
// A barra lateral mostra só as seções (áreas antigas com tela da clínica para o perfil); as telas da seção viram abas no
// topo da página. São as mesmas telas que a sanfona de 09/11 listava: nenhuma some, só muda de lugar.

const ROTA_DA_CLINICA = "/_authenticated/$clientId";

/** Ícone Tabler de cada seção na barra lateral. */
export const ICONE_DA_AREA: Readonly<Record<AreaAntiga, NomeIcone>> = {
  Resultados: "chart-bar",
  Marketing: "speakerphone",
  Comercial: "filter",
  "Plano de ação": "checklist",
  Relatórios: "file-text",
  Administração: "settings",
  SAP: "snowflake",
};

export interface SecaoDaClinica extends GrupoDeTelas {
  icone: NomeIcone;
  /** Primeira tela da seção: destino do link da seção na barra. */
  primeira: TelaDoRegistro;
}

/**
 * Seções da clínica para o perfil: telasPorArea só com as telas /$clientId/*, na ordem do registro. Área sem tela da clínica
 * some. A soma das telas das seções é exatamente o que a sanfona "todas as telas da clínica" mostrava.
 */
export function secoesDaClinica(perfil: PerfilEquipe, opcoes: OpcoesDoIndice = {}): SecaoDaClinica[] {
  return telasPorArea(perfil, opcoes)
    .map((g) => ({ area: g.area, telas: g.telas.filter((t) => t.rota.startsWith(`${ROTA_DA_CLINICA}/`)) }))
    .filter((g) => g.telas.length > 0)
    .map((g) => ({ ...g, icone: ICONE_DA_AREA[g.area], primeira: g.telas[0] }));
}

/** Caminho da tela depois de /<clínica>: "" para o índice, "/conteudo" etc. */
function subDaTela(tela: TelaDoRegistro): string {
  return tela.rota.slice(ROTA_DA_CLINICA.length).replace(/\/+$/, "");
}

/**
 * Seção e tela da clínica de um endereço (/<id>/conteudo -> Marketing, Analisar desempenho). Fora de uma tela da clínica
 * (Carteira, Conferência, /admin/<id>) ou numa tela fora das seções do perfil, devolve null: a página não mostra abas.
 */
export function secaoDoCaminho(secoes: readonly SecaoDaClinica[], pathname: string): { secao: SecaoDaClinica; tela: TelaDoRegistro } | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  const m = /^\/[0-9a-f-]{36}(\/.*)?$/.exec(p);
  if (!m) return null;
  const sub = m[1] ?? "";
  for (const secao of secoes) {
    const tela = secao.telas.find((t) => subDaTela(t) === sub);
    if (tela) return { secao, tela };
  }
  return null;
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Busca local (sem rede) sobre o índice: mesma normalização e mesmo casamento por prefixo de palavra de buscarTelas (nav.ts).
 * Ordem: título começa com o termo, depois título contém, depois só descrição/termos/área; empate: vivas antes de escondidas,
 * depois a ordem do registro.
 */
export function buscarTelasEquipe(perfil: PerfilEquipe, consulta: string, opcoes: OpcoesDoIndice = {}): TelaDoRegistro[] {
  const alvo = normalizar(consulta).trim();
  const palavras = alvo.split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  const achadas = indiceDaBusca(perfil, opcoes)
    .map((tela, ordem) => ({ tela, ordem }))
    .filter(({ tela }) => {
      const termos = normalizar([tela.area, tela.rotulo, tela.descricao, tela.termos].filter(Boolean).join(" "))
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
      return palavras.every((p) => termos.some((termo) => termo.startsWith(p)));
    });
  const nivel = (tela: TelaDoRegistro) => {
    const titulo = normalizar(tela.rotulo);
    if (titulo.startsWith(alvo)) return 0;
    if (titulo.includes(alvo)) return 1;
    return 2;
  };
  return achadas
    .sort(
      (a, b) =>
        nivel(a.tela) - nivel(b.tela) ||
        Number(a.tela.situacao !== "viva") - Number(b.tela.situacao !== "viva") ||
        a.ordem - b.ordem,
    )
    .map(({ tela }) => tela);
}

// --- Menu da equipe (03-02, MENU-02) ---

export type ChaveMenuEquipe = keyof typeof ROTULOS_MENU_EQUIPE;

export interface ItemMenuEquipe {
  chave: ChaveMenuEquipe;
  /** Sempre o valor de ROTULOS_MENU_EQUIPE (D-11: provisório). */
  rotulo: string;
  icone: NomeIcone;
  /** routeId do destino do item. */
  rota: string;
  /** Linha do registro do destino (para linkDaTela). */
  tela: TelaDoRegistro;
  /** Telas vivas que aparecem embaixo do item quando ele é o atual. Sempre linhas do registro. */
  subtelas: TelaDoRegistro[];
}

function telaViva(rota: string): TelaDoRegistro {
  const tela = REGISTRO_DE_TELAS.find((t) => t.rota === rota && t.situacao === "viva" && !t.busca);
  if (!tela) throw new Error(`registro-de-telas: o menu da equipe aponta para ${rota}, que não é linha viva do registro`);
  return tela;
}

const MENU_EQUIPE: readonly { chave: ChaveMenuEquipe; icone: NomeIcone; rota: string; subtelas: readonly string[] }[] = [
  { chave: "carteira", icone: "briefcase", rota: `${A}/`, subtelas: [] },
  { chave: "clinica", icone: "stethoscope", rota: `${C}/`, subtelas: [`${C}/`, `${C}/relatorio`, `${C}/crm-estrutura`, `${A}/$clientId`] },
  { chave: "conferencia", icone: "shield-check", rota: `${A}/conferencia`, subtelas: [`${A}/conferencia`, `${A}/integracoes`] },
];

/**
 * Itens do menu da equipe por papel. Admin do app: os 3 itens. Estrategista que não é admin (D-03): só o que ele abre, ou
 * seja, Clínica com as subtelas sem somenteAdmin (Carteira e Conferência ficam atrás do guarda de /admin). Médico: [].
 * Nenhuma permissão muda: este filtro só evita mostrar link que daria em redirect.
 */
export function itensMenuEquipe(perfil: PerfilEquipe): ItemMenuEquipe[] {
  if (!ehEquipe(perfil)) return [];
  const abre = (t: TelaDoRegistro) => perfil.isAdmin || !t.somenteAdmin;
  return MENU_EQUIPE.map((item) => ({
    chave: item.chave,
    rotulo: ROTULOS_MENU_EQUIPE[item.chave],
    icone: item.icone,
    rota: item.rota,
    tela: telaViva(item.rota),
    subtelas: item.subtelas.map(telaViva).filter(abre),
  })).filter((item) => abre(item.tela));
}

export interface ItemAtual {
  chave: ChaveMenuEquipe;
  /** true: o endereço é o destino do item (aria-current="page"). false: só o grupo do item (pílula sem aria-current). */
  exato: boolean;
}

// Mesma forma do id de clínica de _authenticated.admin.tsx.
const ID_CLINICA = "[0-9a-f-]{36}";
const NA_CLINICA = new RegExp(`^/${ID_CLINICA}(/.*)?$`);
const ADMIN_DA_CLINICA = new RegExp(`^/admin/${ID_CLINICA}$`);

/**
 * Qual item do menu da equipe fica em pílula para um endereço. Qualquer tela /$clientId/* (viva ou escondida) e
 * /admin/$clientId deixam Clínica em pílula; tela escondida fora dos 3 grupos (/admin/brain, SAP) não destaca nenhum.
 */
export function itemAtualDoMenu(pathname: string): ItemAtual | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/admin") return { chave: "carteira", exato: true };
  if (p === "/admin/conferencia") return { chave: "conferencia", exato: true };
  if (p === "/admin/integracoes" || p.startsWith("/admin/conferencia/")) return { chave: "conferencia", exato: false };
  if (ADMIN_DA_CLINICA.test(p)) return { chave: "clinica", exato: false };
  const naClinica = NA_CLINICA.exec(p);
  if (naClinica) return { chave: "clinica", exato: !naClinica[1] };
  return null;
}

export interface LinkDaTela {
  to: string;
  params?: { clientId: string };
  search?: { visao: ContentView };
}

/**
 * Endereço do Link (TanStack) de uma linha: routeId sem /_authenticated e sem a barra final dos índices
 * (/_authenticated/$clientId/ vira /$clientId). Rota com $clientId sem clínica conhecida devolve null: quem chama decide
 * o que fazer (na casca /admin, o 03-06 leva a /admin com "Escolha uma clínica primeiro").
 */
export function linkDaTela(tela: TelaDoRegistro, clientId: string | null): LinkDaTela | null {
  const semPrefixo = tela.rota.startsWith("/_authenticated") ? tela.rota.slice("/_authenticated".length) : tela.rota;
  const to = semPrefixo.length > 1 && semPrefixo.endsWith("/") ? semPrefixo.slice(0, -1) : semPrefixo || "/";
  const precisaClinica = tela.rota.includes("$clientId");
  if (precisaClinica && !clientId) return null;
  return {
    to,
    ...(precisaClinica ? { params: { clientId: clientId as string } } : {}),
    ...(tela.busca ? { search: tela.busca } : {}),
  };
}
