import {
  Activity,
  AlignLeft,
  Briefcase,
  CalendarCheck,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Network,
  ShoppingBag,
  Star,
  Trophy,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

// Navegação do Hub: no máximo 5 áreas com nome simples e uma frase que diz para
// que serve cada uma. Dentro de cada área, abas (as telas que já existiam, com
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
  id: "resumo" | "conteudo" | "anuncios" | "comercial" | "ideias";
  label: string;
  descricao: string;
  Icone: LucideIcon;
  tabs: NavTab[];
}

export const AREAS: NavArea[] = [
  {
    id: "resumo",
    label: "Resumo",
    descricao: "O que aconteceu e o que fazer esta semana",
    Icone: Activity,
    tabs: [
      { path: "", label: "Resumo", Icone: Activity },
      { path: "/relatorio", label: "Relatório", Icone: FileText },
    ],
  },
  {
    id: "conteudo",
    label: "Conteúdo",
    descricao: "Como o Instagram está indo",
    Icone: AlignLeft,
    tabs: [
      { path: "/conteudo", label: "Visão", Icone: AlignLeft },
      { path: "/posts", label: "Posts", Icone: LayoutGrid, fonte: "instagram" },
      { path: "/top", label: "Melhores", Icone: Trophy, fonte: "instagram" },
      { path: "/audiencia", label: "Público", Icone: Users, fonte: "instagram" },
    ],
  },
  {
    id: "anuncios",
    label: "Anúncios",
    descricao: "Onde a verba rende e onde vaza",
    Icone: Megaphone,
    tabs: [{ path: "/anuncios", label: "Anúncios", Icone: Megaphone, fonte: "anuncios" }],
  },
  {
    id: "comercial",
    label: "Comercial",
    descricao: "Do contato ao paciente",
    Icone: Briefcase,
    tabs: [
      { path: "/crm-painel", label: "Funil", Icone: Briefcase, fonte: "crm" },
      { path: "/atendimento", label: "WhatsApp", Icone: MessageCircle, fonte: "atendimento" },
      { path: "/jornada", label: "Jornada", Icone: Activity, admin: true },
    ],
  },
  {
    id: "ideias",
    label: "Ideias",
    descricao: "O que postar a seguir",
    Icone: Lightbulb,
    tabs: [
      { path: "/ideias", label: "Ideias", Icone: Lightbulb },
      { path: "/duvidas", label: "Dúvidas dos pacientes", Icone: HelpCircle, fonte: "instagram" },
      { path: "/inspiracao", label: "Inspiração", Icone: Star },
    ],
  },
];

/** "Avançado": telas de uso da equipe. Fica recolhido. */
export const AVANCADO: NavTab[] = [
  { path: "/conversas", label: "Conversas", Icone: MessagesSquare, admin: true, fonte: "atendimento" },
  { path: "/analisar", label: "A analisar", Icone: ListChecks, admin: true, fonte: "crm" },
  { path: "/crm-estrutura", label: "Estrutura do CRM", Icone: Network, admin: true, fonte: "crm" },
  { path: "/vendas-kommo", label: "Vendas (Kommo)", Icone: ShoppingBag, admin: true, fonte: "crm" },
  { path: "/vendas", label: "Vendas", Icone: ShoppingBag, admin: true },
  { path: "/consultas", label: "Consultas", Icone: CalendarCheck, admin: true },
  { path: "/automacoes", label: "Automações", Icone: Workflow, admin: true },
  { path: "/admin", label: "Admin · Portfólio", Icone: LayoutDashboard, admin: true, absoluto: true },
];

// Clientes que só têm CRM ligado e não têm Business Manager: veem só o
// Comercial. Quem abrir outro endereço é levado ao Funil. Dra. Fernanda Nunes (RD Station CRM).
export const CLIENTES_SO_CRM = new Set(["8770500e-ab5d-4ae8-9489-c49c9991303c"]);
export const ROTAS_DO_CRM = ["/crm-painel", "/crm-estrutura", "/vendas-kommo"];

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
}

export function tabVisivel(t: NavTab, v: Visibilidade): boolean {
  return (!t.admin || v.isAdmin) && fonteOk(t.fonte, v.fontes) && (!v.soCrm || !!t.admin || t.fonte === "crm");
}

export type AreaVisivel = NavArea & { visiveis: NavTab[] };

export function areasVisiveis(v: Visibilidade): AreaVisivel[] {
  return AREAS.map((a) => ({ ...a, visiveis: a.tabs.filter((t) => tabVisivel(t, v)) })).filter((a) => a.visiveis.length > 0);
}

export function avancadoVisivel(v: Visibilidade): NavTab[] {
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
  if (AVANCADO.some((t) => t.path === sub)) return "mais";
  return null;
}
