// Registro único das telas do Nexo (Phase 3, MENU-01). Uma linha por folha do roteador (86, lidas de src/routeTree.gen.ts)
// mais 2 atalhos de rótulo de /ideias = 88 linhas: 15 vivas + 61 escondidas + 12 tiradas. A contagem aceita pelo João em D-04 era
// 14 + 70 + 3; em 11/11/2026 ele decidiu tirar os agentes e as telas que ninguém usa ("tira isso aí, ninguém usa"), e 9 rotas
// escondidas viraram tiradas, mais o atalho Revisar roteiros. A tela nova O que fazer hoje (/hoje, D-01 e D-06 de 03.1.1,
// aprovada pelo João em 10/11/2026) é a 15ª viva: é tela nova, não reclassificação.
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
import {
  AREAS,
  AVANCADO,
  ROTAS_DO_CRM,
  fonteOk,
  type ContentView,
  type Fonte,
  type NavTab,
  type Visibilidade,
} from "./nav";
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
  /** Só nas linhas tiradas pelo João em 11/11/2026 ("tira isso aí, ninguém usa"). */
  tiradaEm?: "2026-11-11";
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

  // Vivas: telas da equipe (8)
  linha(`${A}/`, "viva", "briefcase", { rotulo: ROTULOS_MENU_EQUIPE.carteira, descricao: "Clientes do Nexo", termos: "clientes todos carteira portfolio", ...ADMIN }),
  linha(`${C}/`, "viva", "layout-dashboard", { ...daNav(""), semSelo: true }),
  // A primeira versão da tela Hoje da Phase 9 (03.1.1, D-06): a mesma rota que a Phase 9 evolui. Sem selo até lá.
  // Fica depois de Resultados para o link da seção Resultados continuar levando a Resultados.
  linha(`${C}/hoje`, "viva", "checklist", {
    rotulo: "O que fazer hoje",
    descricao: "De 3 a 5 ações da semana tiradas das leituras, com o número e quem resolve.",
    termos: "hoje acoes semana fazer prioridades inicio entrada",
    area: "Resultados",
    semSelo: true,
  }),
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
  // A rota /ideias fica com o rótulo da visão padrão (Encontrar ideias); Planejar a semana e Revisar roteiros são atalhos (linhas no fim).
  linha(`${C}/ideias`, "escondida", "bulb", daNav("/ideias", "ideias")),
  linha(`${C}/inteligencia-criativa`, "escondida", "bulb", daNav("/inteligencia-criativa")),
  linha(`${C}/inspiracao`, "escondida", "bulb", daNav("/inspiracao")),
  linha(`${C}/duvidas`, "escondida", "message-circle", daNav("/duvidas")),
  linha(`${C}/links`, "escondida", "link", daNav("/links")),
  linha(`${C}/central-atendimento`, "escondida", "inbox", daNav("/central-atendimento")),
  linha(`${C}/atendimento`, "escondida", "message-circle", daNav("/atendimento")),
  linha(`${C}/crm-contatos`, "escondida", "users", daNav("/crm-contatos")),
  linha(`${C}/crm-guia`, "escondida", "file-text", daNav("/crm-guia")),
  linha(`${C}/jornada`, "escondida", "filter", daNav("/jornada")),
  // Telas sem aba no menu do médico: rótulo e descrição novos, em português claro.
  linha(`${C}/analisar`, "escondida", "filter", { rotulo: "Papel de cada funil", descricao: "O que cada etapa do CRM conta hoje e o que ela significa.", termos: "funil etapas crm analisar cards significado", area: "Comercial" }),
  linha(`${C}/consultas`, "escondida", "users", { rotulo: "O que virou paciente", descricao: "Contatos que viraram consulta. Tela ainda em construção.", termos: "consultas pacientes agendamentos", area: "Resultados" }),
  linha(`${C}/vendas`, "escondida", "chart-bar", { rotulo: "O que virou venda", descricao: "Contatos que viraram venda. Tela ainda em construção.", termos: "vendas faturamento fechamentos", area: "Resultados" }),
  linha(`${C}/aquisicao`, "escondida", "snowflake", { rotulo: "Aquisição (leva ao SAP)", area: "SAP", soRedireciona: true }),
  linha(`${C}/conversas`, "escondida", "message-circle", { rotulo: "Conversas (leva ao atendimento)", area: "Comercial", soRedireciona: true }),
  linha("/_authenticated/assistentes-ia", "escondida", "robot", { rotulo: "Assistentes de IA", descricao: "Ligue o Claude e outros assistentes aos dados do Nexo (Doctor Creator MCP).", termos: "assistentes ia mcp claude chatgpt", area: "Administração" }),

  // Escondidas: administração (rótulos copiados de ITENS de _authenticated.admin.tsx; não se importa arquivo de rota)
  linha(`${A}/caixa`, "escondida", "inbox", { rotulo: "Caixa de entrada", ...ADMIN }),
  linha(`${A}/referencia`, "escondida", "chart-bar", { rotulo: "Referência entre clientes", ...ADMIN }),
  linha(`${A}/relatorios`, "escondida", "file-text", { rotulo: "Relatórios da semana", ...ADMIN }),
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

  // Tiradas (12): saem do menu e da busca da equipe, mas o endereço continua abrindo (MENU-04, sem 404).
  // /marketing já redireciona para /conteudo no beforeLoad do arquivo da rota (D-05); o arquivo não muda.
  linha(`${C}/marketing`, "tirada", "speakerphone", { rotulo: "Visão geral de Marketing", area: "Marketing", soRedireciona: true, destino: `${C}/conteudo` }),
  // Decisão do João, 11/11/2026 ("tira isso aí, ninguém usa"): 9 rotas viram só redirecionamento. As 7 da clínica levam à
  // Hoje (${C}/hoje), a entrada única (D-06), desde o 03.1.1-06. As 2 do admin levam à Carteira.
  linha(`${C}/agentes`, "tirada", "robot", { rotulo: "Agentes e entregas", area: "Plano de ação", soRedireciona: true, tiradaEm: "2026-11-11", destino: `${C}/hoje` }),
  linha(`${C}/plano`, "tirada", "calendar", { rotulo: "Plano da semana", area: "Plano de ação", soRedireciona: true, tiradaEm: "2026-11-11", destino: `${C}/hoje` }),
  linha(`${C}/reunioes`, "tirada", "calendar", { rotulo: "Reuniões", area: "Plano de ação", soRedireciona: true, tiradaEm: "2026-11-11", destino: `${C}/hoje` }),
  linha(`${C}/proximas-acoes`, "tirada", "checklist", { rotulo: "Prioridades da equipe", area: "Plano de ação", soRedireciona: true, tiradaEm: "2026-11-11", destino: `${C}/hoje` }),
  linha(`${C}/oportunidades`, "tirada", "bulb", { rotulo: "Oportunidades de melhoria", area: "Plano de ação", soRedireciona: true, tiradaEm: "2026-11-11", destino: `${C}/hoje` }),
  linha(`${C}/automacoes`, "tirada", "robot", { rotulo: "Automações", area: "Plano de ação", soRedireciona: true, tiradaEm: "2026-11-11", destino: `${C}/hoje` }),
  linha(`${C}/campanhas`, "tirada", "target", { rotulo: "Estratégias e campanhas", area: "Marketing", soRedireciona: true, tiradaEm: "2026-11-11", destino: `${C}/hoje` }),
  linha(`${A}/agentes`, "tirada", "robot", { rotulo: "Central de Agentes", ...ADMIN, soRedireciona: true, tiradaEm: "2026-11-11", destino: `${A}/` }),
  linha(`${A}/brain`, "tirada", "bulb", { rotulo: "Brand Brain", ...ADMIN, soRedireciona: true, tiradaEm: "2026-11-11", destino: `${A}/` }),
  // Atalhos de rótulo: a tela /ideias fica (abre em Encontrar ideias); só estes 2 rótulos saem para a equipe.
  linha(`${C}/ideias`, "tirada", "calendar", { ...daNav("/ideias", "semana"), busca: { visao: "semana" }, destino: `${C}/ideias` }),
  linha(`${C}/ideias`, "tirada", "file-text", { rotulo: "Revisar roteiros", area: "Marketing", busca: { visao: "roteiros" }, tiradaEm: "2026-11-11", destino: `${C}/ideias` }),
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

// --- Telas juntadas do médico (03.1.1-01, D-01) ---
// O João aprovou a lista em 10/11/2026 ("Aprovo a lista"): 3 telas juntadas, cada uma com abas em pasta. Cada aba é o caminho
// da tela antiga (D-04, emenda de 10/11): o arquivo da rota antiga continua sendo a tela, o endereço antigo é a aba (D-03) e o
// log por rota grava o routeId da aba sem migration (D-06). Nada aqui apaga ou redireciona tela: é só o desenho da pasta.

/** Ids das telas juntadas. Os planos 05 a 07 acrescentam ids (Hoje, grupos da equipe). */
export type IdDaSecao = "travam" | "origem" | "instagram";

export interface ParteDaAba {
  /** routeId da tela antiga que a parte mostra. */
  rota: string;
  rotulo: string;
  /** Fonte da parte; quando vem, vale no lugar da fonte da linha do registro. */
  fonte?: Fonte;
}

export interface AbaDaSecao {
  id: string;
  rotulo: string;
  /** A primeira parte é o destino do link da aba; mais de uma parte vira o filtro segmentado (3º nível, D-07). */
  partes: readonly ParteDaAba[];
  /** O que a contagem em cinza conta, em português; null quando a aba não tem coisa contável (nenhum número é mostrado). */
  contagem: string | null;
}

export interface SecaoJuntada {
  id: IdDaSecao;
  rotulo: string;
  icone: NomeIcone;
  publico: "medico" | "equipe";
  abas: readonly AbaDaSecao[];
}

export const SECOES_JUNTADAS: readonly SecaoJuntada[] = [
  {
    id: "travam",
    rotulo: "Onde os pacientes travam",
    icone: "filter",
    publico: "medico",
    abas: [
      {
        id: "funil",
        rotulo: "Funil",
        partes: [
          { rota: `${C}/pacientes`, rotulo: "Do contato à venda" },
          { rota: `${C}/crm-painel`, rotulo: "No CRM" },
        ],
        contagem: null,
      },
      { id: "consultas", rotulo: "Consultas", partes: [{ rota: `${C}/consultas`, rotulo: "Consultas" }], contagem: "consultas no período" },
      { id: "vendas", rotulo: "Vendas", partes: [{ rota: `${C}/vendas`, rotulo: "Vendas" }], contagem: "vendas no período" },
      { id: "jornada", rotulo: "Jornada", partes: [{ rota: `${C}/jornada`, rotulo: "Jornada" }], contagem: null },
    ],
  },
  {
    id: "origem",
    rotulo: "De onde vêm os pacientes",
    icone: "chart-bar",
    publico: "medico",
    abas: [
      { id: "por-origem", rotulo: "Por origem", partes: [{ rota: `${C}/vendas-kommo`, rotulo: "Por origem" }], contagem: "origens com venda no período" },
      { id: "instagram", rotulo: "Instagram", partes: [{ rota: `${C}/conteudo-comercial`, rotulo: "Instagram" }], contagem: null },
      { id: "anuncios", rotulo: "Anúncios", partes: [{ rota: `${C}/anuncios`, rotulo: "Anúncios" }], contagem: "campanhas no período" },
      { id: "links", rotulo: "Links", partes: [{ rota: `${C}/links`, rotulo: "Links" }], contagem: "links rastreados" },
    ],
  },
  {
    id: "instagram",
    rotulo: "Instagram",
    icone: "brand-instagram",
    publico: "medico",
    abas: [
      // A linha de /conteudo não traz fonte (daNav("/conteudo") não tem): por isso a parte declara "instagram" aqui.
      { id: "desempenho", rotulo: "Desempenho", partes: [{ rota: `${C}/conteudo`, rotulo: "Desempenho", fonte: "instagram" }], contagem: null },
      { id: "destaques", rotulo: "Destaques", partes: [{ rota: `${C}/top`, rotulo: "Destaques" }], contagem: "publicações em destaque" },
      { id: "posts", rotulo: "Posts", partes: [{ rota: `${C}/posts`, rotulo: "Posts" }], contagem: "publicações no período" },
      { id: "publico", rotulo: "Público", partes: [{ rota: `${C}/audiencia`, rotulo: "Público" }], contagem: null },
    ],
  },
];

function linhaDaParte(rota: string): TelaDoRegistro | undefined {
  return REGISTRO_DE_TELAS.find((t) => t.rota === rota && !t.busca && t.situacao !== "tirada");
}

/** Parte da clínica de um endereço: "" para o índice, "/conteudo" etc.; null fora de um endereço de clínica. */
function subDoEndereco(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  const m = /^\/[0-9a-f-]{36}(\/.*)?$/.exec(p);
  return m ? (m[1] ?? "") : null;
}

/**
 * Tela juntada, aba e parte de um endereço (/<id>/top -> Instagram, Destaques). A barra final é ignorada, como em
 * secaoDoCaminho. Fora de tela juntada (ou fora de uma tela da clínica) devolve null.
 */
export function juntadaDoCaminho(pathname: string): { secao: SecaoJuntada; aba: AbaDaSecao; parte: ParteDaAba } | null {
  const sub = subDoEndereco(pathname);
  if (sub === null) return null;
  for (const secao of SECOES_JUNTADAS) {
    for (const aba of secao.abas) {
      for (const parte of aba.partes) {
        const linha = linhaDaParte(parte.rota);
        if (linha && subDaTela(linha) === sub) return { secao, aba, parte };
      }
    }
  }
  return null;
}

/**
 * Abas que a clínica tem. Tira de cada aba as partes que a clínica não vê: fonte da parte (ou da linha do registro) não ligada,
 * clínica só com CRM fora das rotas do CRM, clínica sem Audiência no Público, rota de admin para quem não é admin. Aba sem
 * parte visível sai. Para as telas do médico NÃO valem as marcas equipe/admin de nav.ts: o D-01 aprovou que o médico veja
 * Destaques, Posts, Público, Conteúdo × Comercial, Links, Por origem e Jornada (o dado continua decidido pelo RLS).
 */
export function abasVisiveis(secao: SecaoJuntada, vis: Visibilidade): AbaDaSecao[] {
  return secao.abas
    .map((aba) => ({
      ...aba,
      partes: aba.partes.filter((parte) => {
        const linha = linhaDaParte(parte.rota);
        if (!linha) return false;
        const sub = subDaTela(linha);
        if (!fonteOk(parte.fonte ?? linha.fonte, vis.fontes)) return false;
        if (vis.soCrm && !ROTAS_DO_CRM.includes(sub)) return false;
        if (vis.semAudiencia && sub.endsWith("/audiencia")) return false;
        if (parte.rota.startsWith(`${A}/`) && !vis.isAdmin) return false;
        return true;
      }),
    }))
    .filter((aba) => aba.partes.length > 0);
}

/** Linha do registro (sem busca) de um endereço da clínica, para o título da casca quando nav.ts não tem a tela. */
export function telaDoCaminho(pathname: string): TelaDoRegistro | null {
  const sub = subDoEndereco(pathname);
  if (sub === null) return null;
  return (
    REGISTRO_DE_TELAS.find(
      (t) => t.rota.startsWith(`${ROTA_DA_CLINICA}/`) && !t.busca && t.situacao !== "tirada" && subDaTela(t) === sub,
    ) ?? null
  );
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
  { chave: "clinica", icone: "stethoscope", rota: `${C}/`, subtelas: [`${C}/hoje`, `${C}/`, `${C}/relatorio`, `${C}/crm-estrutura`, `${A}/$clientId`] },
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

// --- Menu do médico (03.1.1-07, MEDV-01, D-01 e D-06) ---
// O João aprovou a lista de 6 telas em 10/11/2026 ("Aprovo a lista") e decidiu "6 agora, decido na fase 9". O MENU-06 (só
// Hoje e Ajuda e fontes) não é cumprido nem descartado aqui: fica em aberto para a Phase 9. Tirar uma tela do menu não é
// bloquear: Dúvidas do público, Planejar a semana e as outras continuam abrindo pelo endereço, sem guarda nova.

export type IdDoItemDoMedico = "hoje" | "resultados" | IdDaSecao | "relatorio";

export interface ItemMenuDoMedico {
  id: IdDoItemDoMedico;
  /** Texto do menu (D-01): rótulo da seção juntada ou da tela única. */
  rotulo: string;
  /** Texto curto da barra de baixo do celular. */
  curto: string;
  icone: NomeIcone;
  /** Linha do registro do destino (primeira parte da primeira aba visível, nas telas juntadas). */
  tela: TelaDoRegistro;
  /** Todas as rotas que deixam o item como o atual para esta clínica. */
  rotas: readonly string[];
}

type DefDoItemDoMedico =
  | { id: "hoje" | "resultados" | "relatorio"; rotulo: string; curto: string; icone: NomeIcone; rota: string }
  | { id: IdDaSecao; curto: string };

export const MENU_DO_MEDICO: readonly DefDoItemDoMedico[] = [
  { id: "hoje", rotulo: "O que fazer hoje", curto: "Hoje", icone: "checklist", rota: `${C}/hoje` },
  { id: "resultados", rotulo: "Resultados da clínica", curto: "Resultados", icone: "layout-dashboard", rota: `${C}/` },
  { id: "travam", curto: "Onde travam" },
  { id: "origem", curto: "De onde vêm" },
  { id: "instagram", curto: "Instagram" },
  { id: "relatorio", rotulo: "Relatório do período", curto: "Relatório", icone: "file-text", rota: `${C}/relatorio` },
];

/**
 * Itens do menu do médico para a clínica, na ordem de MENU_DO_MEDICO. Item de seção juntada leva à primeira parte da primeira
 * aba visível (abasVisiveis) e some sem destino visível (sem Instagram ligado, some o item Instagram). Item de tela única
 * segue a fonte da linha e a regra do só-CRM (o caminho precisa estar em ROTAS_DO_CRM).
 */
export function itensMenuDoMedico(vis: Visibilidade): ItemMenuDoMedico[] {
  const itens: ItemMenuDoMedico[] = [];
  for (const def of MENU_DO_MEDICO) {
    if ("rota" in def) {
      const tela = telaViva(def.rota);
      if (!fonteOk(tela.fonte, vis.fontes)) continue;
      if (vis.soCrm && !ROTAS_DO_CRM.includes(subDaTela(tela))) continue;
      itens.push({ id: def.id, rotulo: def.rotulo, curto: def.curto, icone: def.icone, tela, rotas: [def.rota] });
      continue;
    }
    const secao = SECOES_JUNTADAS.find((s) => s.id === def.id);
    if (!secao) throw new Error(`registro-de-telas: MENU_DO_MEDICO aponta para a seção ${def.id}, que não existe`);
    const rotas = abasVisiveis(secao, vis).flatMap((a) => a.partes.map((p) => p.rota));
    if (!rotas.length) continue;
    const tela = linhaDaParte(rotas[0]);
    if (!tela) continue;
    itens.push({ id: def.id, rotulo: secao.rotulo, curto: def.curto, icone: secao.icone, tela, rotas });
  }
  return itens;
}

/** Item do menu do médico que fica atual num endereço: tela única pelo caminho exato, tela juntada pela pasta. null fora dos 6. */
export function itemAtualDoMedico(pathname: string): IdDoItemDoMedico | null {
  const sub = subDoEndereco(pathname);
  if (sub === null) return null;
  if (sub === "/hoje") return "hoje";
  if (sub === "") return "resultados";
  if (sub === "/relatorio") return "relatorio";
  return juntadaDoCaminho(pathname)?.secao.id ?? null;
}

/** Seção, aba e parte da tela juntada de uma rota (para o resultado da busca mostrar "Seção / Aba"). Fora delas, null. */
export function juntadaDaRota(rota: string): { secao: SecaoJuntada; aba: AbaDaSecao; parte: ParteDaAba } | null {
  for (const secao of SECOES_JUNTADAS)
    for (const aba of secao.abas)
      for (const parte of aba.partes) if (parte.rota === rota) return { secao, aba, parte };
  return null;
}

/**
 * Busca do médico (MEDV-03): só entre as telas que os itens do menu alcançam (as telas únicas e todas as partes visíveis das
 * telas juntadas). Mesma normalização e casamento por prefixo de palavra de buscarTelasEquipe, sobre rótulo da seção, da aba
 * e da parte, rótulo da linha, descrição e termos: "funil comercial" acha a aba Funil, parte No CRM. As outras telas abrem pelo
 * endereço, mas não aparecem aqui. Ordem: título começa com o termo, depois contém, depois o resto; empate na ordem do menu.
 * Consulta vazia devolve todos os destinos da clínica, na ordem do menu.
 */
export function buscarTelasDoMedico(vis: Visibilidade, consulta: string): TelaDoRegistro[] {
  const alvo = normalizar(consulta).trim();
  const palavras = alvo.split(/\s+/).filter(Boolean);
  const alcancaveis: TelaDoRegistro[] = [];
  for (const item of itensMenuDoMedico(vis)) {
    for (const rota of item.rotas) {
      const tela = linhaDaParte(rota);
      if (tela && !alcancaveis.includes(tela)) alcancaveis.push(tela);
    }
  }
  // Consulta vazia: todos os destinos da clínica, na ordem do menu (como a busca do médico sempre fez); a lista nunca fica
  // sem nenhum link para quem navega por teclado.
  if (!palavras.length) return alcancaveis;
  const achadas = alcancaveis
    .map((tela, ordem) => ({ tela, ordem }))
    .filter(({ tela }) => {
      const j = juntadaDaRota(tela.rota);
      const termos = normalizar(
        [j?.secao.rotulo, j?.aba.rotulo, j?.parte.rotulo, tela.rotulo, tela.descricao, tela.termos].filter(Boolean).join(" "),
      )
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
  return achadas.sort((a, b) => nivel(a.tela) - nivel(b.tela) || a.ordem - b.ordem).map(({ tela }) => tela);
}
