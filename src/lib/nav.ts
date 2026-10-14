import {
  Activity,
  AlignLeft,
  Briefcase,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Home,
  Target,
  Route,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Network,
  Settings,
  ShoppingBag,
  Star,
  Trophy,
  Users,
  type LucideIcon,
  ClipboardList,
  ListTodo,
} from "lucide-react";

// Navegação do Hub: 5 categorias (Início, Social, Comercial, Oportunidades,
// Relatórios) com uma frase que diz para que serve cada uma. Dentro de cada área, abas (as telas que já existiam, com
// os mesmos endereços). O que é de uso da equipe fica em "Avançado".
//
// Regras de visibilidade (iguais às de antes):
// - admin: só a equipe Doctor Creator vê;
// - fonte: só aparece se o cliente tem aquela fonte conectada (ninguém cai em
//   aba vazia). Enquanto as fontes carregam, tudo aparece (não pisca).
// - clientes "só CRM" veem apenas o que é do CRM.

export type Fonte = "instagram" | "anuncios" | "crm" | "atendimento";
export type Fontes = { tem_instagram: boolean; tem_anuncios: boolean; tem_crm: boolean; tem_atendimento: boolean } | null | undefined;

export interface NavTab {
  /** Sufixo depois de /$clientId ("" = a própria página do cliente). Fora do cliente: caminho absoluto com `absoluto`. */
  path: string;
  label: string;
  Icone: LucideIcon;
  admin?: boolean;
  fonte?: Fonte;
  absoluto?: boolean;
}

export interface NavArea {
  id: "resumo" | "conteudo" | "anuncios" | "vendas" | "relatorio";
  label: string;
  /** Rótulo da barra inferior do celular (cabe em 1/6 da tela). */
  curto?: string;
  descricao: string;
  Icone: LucideIcon;
  tabs: NavTab[];
}

// Cinco grupos (pedido de out/2026): Resumo, Conteúdo, Anúncios, Atendimento e vendas, Relatório.
// Nenhuma tela saiu e nenhum endereço mudou: cada rota antiga é um item de um grupo. A primeira aba é a
// página inicial do grupo (em Conteúdo, a aba "Conteúdo"). O que é da equipe fica em "Sistema".
export const AREAS: NavArea[] = [
  {
    id: "resumo",
    label: "Resumo",
    descricao: "O que está acontecendo e o que fazer",
    Icone: Home,
    tabs: [
      { path: "", label: "Resumo", Icone: Activity },
      { path: "/proximas-acoes", label: "Próximas ações", Icone: ListTodo },
      { path: "/campanhas", label: "Campanhas do mês", Icone: Megaphone },
      { path: "/oportunidades", label: "Oportunidades (score)", Icone: Target },
    ],
  },
  {
    id: "conteudo",
    label: "Conteúdo",
    descricao: "Instagram: posts, público e ideias",
    Icone: AlignLeft,
    tabs: [
      { path: "/conteudo", label: "Conteúdo", Icone: AlignLeft },
      { path: "/posts", label: "Posts", Icone: LayoutGrid, fonte: "instagram" },
      { path: "/top", label: "Top conteúdos", Icone: Trophy, fonte: "instagram" },
      { path: "/audiencia", label: "Audiência", Icone: Users, fonte: "instagram" },
      { path: "/ideias", label: "Ideias", Icone: Lightbulb },
      { path: "/inspiracao", label: "Inspiração", Icone: Star },
    ],
  },
  {
    id: "anuncios",
    label: "Anúncios",
    descricao: "Investimento e resultado por objetivo",
    Icone: Megaphone,
    tabs: [
      { path: "/anuncios", label: "Anúncios", Icone: Megaphone, fonte: "anuncios" },
    ],
  },
  {
    id: "vendas",
    label: "Atendimento e vendas",
    curto: "Vendas",
    descricao: "CRM, WhatsApp, dúvidas e jornada",
    Icone: Briefcase,
    tabs: [
      { path: "/crm-painel", label: "Comercial", Icone: Briefcase, fonte: "crm" },
      { path: "/crm-guia", label: "Organizar o CRM", Icone: ClipboardList, fonte: "crm" },
      { path: "/atendimento", label: "WhatsApp", Icone: MessageCircle, fonte: "atendimento" },
      { path: "/conversas", label: "Conversas e auditoria", Icone: MessagesSquare, admin: true, fonte: "atendimento" },
      { path: "/duvidas", label: "Dúvidas", Icone: HelpCircle, fonte: "instagram" },
      { path: "/jornada", label: "Jornada", Icone: Route, admin: true },
    ],
  },
  {
    id: "relatorio",
    label: "Relatório",
    descricao: "Texto e PDF para enviar ao cliente",
    Icone: FileText,
    tabs: [{ path: "/relatorio", label: "Relatório", Icone: FileText }],
  },
];

/**
 * "Equipe": ferramentas da equipe Doctor Creator PARA ESTE CLIENTE (só admin). Médico e viewer nunca veem.
 * As páginas de portfólio (todos os clientes: saúde das fontes, referência, conferência, relatórios da
 * semana, SAP de todas as clínicas) ficam no menu do /admin; daqui sai um link só, "Todos os clientes".
 * Vendas, Consultas e Automações são telas ainda não construídas ("Fase 2/3"): saíram do menu, os
 * endereços continuam funcionando.
 */
export const AVANCADO: NavTab[] = [
  { path: "/aquisicao", label: "Sistema de Aquisição (SAP)", Icone: Target, admin: true },
  { path: "/admin/$clientId", label: "Configurar este cliente", Icone: Settings, admin: true, absoluto: true },
  { path: "/crm-estrutura", label: "Etapas do CRM", Icone: Network, admin: true, fonte: "crm" },
  { path: "/vendas-kommo", label: "Vendas por origem (Kommo)", Icone: ShoppingBag, admin: true, fonte: "crm" },
  { path: "/admin", label: "Todos os clientes", Icone: LayoutDashboard, admin: true, absoluto: true },
];

// Clientes que só têm CRM ligado e não têm Business Manager: veem só o
// Comercial. Quem abrir outro endereço é levado ao Funil. Dra. Fernanda Nunes (RD Station CRM).
export const CLIENTES_SO_CRM = new Set(["8770500e-ab5d-4ae8-9489-c49c9991303c"]);
export const ROTAS_DO_CRM = ["/crm-painel", "/crm-guia", "/crm-estrutura", "/vendas-kommo"];

// Clientes sem Business Manager próprio: a Meta não libera a Audiência ao vivo
// (cidades, idade, gênero), então a aba fica escondida e o endereço direto volta
// para o Resultado. Dra. Marcelly Achkar. Para voltar, tire o id daqui.
export const CLIENTES_SEM_AUDIENCIA = new Set(["633e6ee6-cb55-4796-8ffe-ce9c6e34cc12"]);

export function fonteOk(fonte: Fonte | undefined, fontes: Fontes): boolean {
  if (!fonte || !fontes) return true;
  if (fonte === "instagram") return fontes.tem_instagram;
  if (fonte === "anuncios") return fontes.tem_anuncios;
  if (fonte === "crm") return fontes.tem_crm;
  if (fonte === "atendimento") return fontes.tem_atendimento;
  return true;
}

export interface Visibilidade {
  isAdmin: boolean;
  fontes: Fontes;
  soCrm: boolean;
  semAudiencia?: boolean;
  /** Papel no cliente. Muda só a ORDEM de apresentação, nunca o acesso. */
  papel?: "admin" | "owner" | "strategist" | "viewer" | null;
}

// Médico (owner) e viewer: resultado, oportunidades e relatório primeiro.
// Estrategista e equipe: análise primeiro. Todas as áreas continuam disponíveis.
const ORDEM_POR_PAPEL: Record<string, NavArea["id"][]> = {
  owner: ["resumo", "relatorio", "conteudo", "anuncios", "vendas"],
  viewer: ["resumo", "relatorio", "conteudo", "anuncios", "vendas"],
  strategist: ["resumo", "conteudo", "anuncios", "vendas", "relatorio"],
  admin: ["resumo", "conteudo", "anuncios", "vendas", "relatorio"],
};

export function tabVisivel(t: NavTab, v: Visibilidade): boolean {
  return (!t.admin || v.isAdmin) && fonteOk(t.fonte, v.fontes) && (!v.soCrm || !!t.admin || t.fonte === "crm") && !(v.semAudiencia && t.path.endsWith("audiencia"));
}

export type AreaVisivel = NavArea & { visiveis: NavTab[] };

export function areasVisiveis(v: Visibilidade): AreaVisivel[] {
  const ordem = ORDEM_POR_PAPEL[v.papel ?? (v.isAdmin ? "admin" : "strategist")] ?? ORDEM_POR_PAPEL.strategist;
  return AREAS.map((a) => ({ ...a, visiveis: a.tabs.filter((t) => tabVisivel(t, v)) }))
    .filter((a) => a.visiveis.length > 0)
    .sort((x, y) => ordem.indexOf(x.id) - ordem.indexOf(y.id));
}

/** Itens de Sistema/Admin: só a equipe (app admin). Médico (owner) e viewer nunca veem. */
export function avancadoVisivel(v: Visibilidade): NavTab[] {
  if (!v.isAdmin || v.papel === "owner" || v.papel === "viewer") return [];
  return AVANCADO.filter((t) => tabVisivel(t, v));
}

/** Parte do endereço depois de /<clientId>: "" para a página do cliente, "/posts" etc. */
export function subcaminho(pathname: string, clientId: string): string {
  const base = `/${clientId}`;
  if (!pathname.startsWith(base)) return pathname;
  const resto = pathname.slice(base.length).replace(/\/+$/, "");
  return resto;
}

/** Área ativa para o endereço atual. "mais" quando a tela está no Avançado. */
export function areaDoCaminho(sub: string): NavArea["id"] | "mais" | null {
  for (const a of AREAS) if (a.tabs.some((t) => t.path === sub)) return a.id;
  if (AVANCADO.some((t) => !t.absoluto && t.path === sub)) return "mais";
  return null;
}
