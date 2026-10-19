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
  CalendarDays,
  GitCompare,
  Megaphone,
  MessageCircle,
  Network,
  Settings,
  ShoppingBag,
  Star,
  Trophy,
  Users,
  type LucideIcon,
  ClipboardList,
  ListTodo,
  Bot,
  Link2,
} from "lucide-react";

// Navegação por finalidade. Os endereços e as regras de acesso são preservados.
export type Fonte = "instagram" | "anuncios" | "crm" | "atendimento";
export type Fontes =
  | {
      tem_instagram: boolean;
      tem_anuncios: boolean;
      tem_crm: boolean;
      tem_atendimento: boolean;
    }
  | null
  | undefined;

export type ContentView = "roteiros" | "semana" | "ideias";
export function parseContentView(value: unknown): ContentView {
  return value === "semana" || value === "ideias" ? value : "roteiros";
}
export function parseContentViewSearch(search: Record<string, unknown>): { visao: ContentView } {
  return { visao: parseContentView(search.visao) };
}

export interface NavTab {
  /** Sufixo depois de /$clientId ("" = a própria página do cliente). Fora do cliente: caminho absoluto com `absoluto`. */
  path: string;
  search?: { visao: ContentView };
  label: string;
  Icone: LucideIcon;
  descricao?: string;
  termos?: string;
  grupo?: string;
  admin?: boolean;
  /** Preserva as restrições da navegação administrativa ao mover uma ferramenta para sua área. */
  equipe?: boolean;
  fonte?: Fonte;
  absoluto?: boolean;
  /** Tela do Sistema de Aquisição: aparece para o cliente só com o SAP ativo (a equipe sempre vê). */
  sap?: boolean;
}

export interface NavArea {
  id: "resumo" | "marketing" | "comercial" | "acoes" | "relatorio";
  label: string;
  /** Rótulo da barra inferior do celular (cabe na barra inferior). */
  curto?: string;
  descricao: string;
  Icone: LucideIcon;
  tabs: NavTab[];
}

export const AREAS: NavArea[] = [
  {
    id: "resumo",
    label: "Início",
    descricao: "Resultados da clínica e a prioridade do momento",
    Icone: Home,
    tabs: [
      {
        path: "",
        label: "Início",
        Icone: Activity,
        descricao: "Entenda os resultados e por onde começar.",
        termos: "resumo painel dashboard resultado crescimento",
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    descricao: "Conteúdo, campanhas e aquisição de pacientes",
    Icone: Megaphone,
    tabs: [
      {
        path: "/marketing",
        label: "Visão geral de Marketing",
        Icone: LayoutDashboard,
        descricao: "Escolha entre produzir conteúdo, planejar campanhas e analisar resultados.",
        termos: "marketing aquisicao visao geral",
      },
      {
        path: "/ideias",
        search: { visao: "roteiros" },
        label: "Revisar roteiros",
        Icone: Lightbulb,
        descricao: "Leia os roteiros prontos e revise o que será produzido.",
        termos: "roteiro criar reels carrossel legenda",
        grupo: "Conteúdo",
      },
      {
        path: "/ideias",
        search: { visao: "semana" },
        label: "Planejar a semana",
        Icone: CalendarDays,
        descricao: "Organize as pautas, as datas e o andamento da produção.",
        termos: "calendario editorial agenda planejamento semana",
        grupo: "Conteúdo",
      },
      {
        path: "/ideias",
        search: { visao: "ideias" },
        label: "Encontrar ideias",
        Icone: Lightbulb,
        descricao: "Encontre temas a partir dos posts e das dúvidas do público.",
        termos: "ideias temas perguntas sugestoes",
        grupo: "Conteúdo",
      },
      {
        path: "/inteligencia-criativa",
        label: "Inteligência Criativa",
        admin: true,
        Icone: Network,
        fonte: "instagram",
        descricao:
          "Analise referências e adapte estruturas de conteúdo.",
        termos:
          "inteligencia criativa video editar analise multimodal biblioteca radar aprendizado",
        grupo: "Conteúdo",
      },
      {
        path: "/inspiracao",
        label: "Referências salvas",
        Icone: Star,
        descricao: "Encontre inspirações guardadas para novos conteúdos.",
        termos: "inspiracao modelos templates referencias",
        grupo: "Conteúdo",
      },
      {
        path: "/conteudo",
        label: "Analisar desempenho",
        Icone: AlignLeft,
        descricao: "Compare temas e formatos para orientar a produção.",
        termos: "desempenho metricas analise conteudo",
        grupo: "Conteúdo",
      },
      {
        path: "/posts",
        label: "Consultar publicações",
        Icone: LayoutGrid,
        fonte: "instagram",
        descricao: "Consulte os posts publicados e seus indicadores.",
        termos: "posts instagram publicados",
        grupo: "Conteúdo",
      },
      {
        path: "/top",
        label: "Encontrar destaques",
        Icone: Trophy,
        fonte: "instagram",
        descricao: "Identifique as publicações que mais se destacaram.",
        termos: "top melhores conteudos campeoes performance ranking",
        grupo: "Conteúdo",
      },
      {
        path: "/campanhas",
        label: "Estratégias e campanhas",
        Icone: Megaphone,
        descricao: "Planeje as campanhas e os canais de aquisição.",
        termos: "campanhas do mes estrategia online offline marketing",
        grupo: "Campanhas e anúncios",
      },
      {
        path: "/anuncios",
        label: "Resultados dos anúncios",
        Icone: Megaphone,
        fonte: "anuncios",
        descricao: "Acompanhe investimento, campanhas e resultados.",
        termos: "trafego pago meta ads custo cpl campanhas",
        grupo: "Campanhas e anúncios",
      },
      {
        path: "/links",
        label: "Links rastreados",
        Icone: Link2,
        grupo: "Campanhas e anúncios",
      },
      {
        path: "/audiencia",
        label: "Público do Instagram",
        Icone: Users,
        fonte: "instagram",
        descricao: "Entenda quem acompanha o perfil.",
        termos: "audiencia seguidores cidades idade genero",
        grupo: "Público e demanda",
      },
      {
        path: "/conteudo-comercial",
        label: "Conteúdo × Comercial",
        Icone: GitCompare,
        fonte: "instagram",
        descricao: "Cruze os posts com as conversas e os agendamentos por dia, horário e tema.",
        termos: "cruzamento conteudo comercial conversas whatsapp temas objecoes horario agendamento",
        grupo: "Público e demanda",
      },
      {
        path: "/duvidas",
        label: "Dúvidas do público",
        Icone: HelpCircle,
        fonte: "instagram",
        termos: "perguntas comentarios duvidas",
        grupo: "Público e demanda",
      },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    descricao: "Atendimento, CRM e resultados comerciais",
    Icone: Briefcase,
    tabs: [
      {
        path: "/crm-painel",
        label: "Funil comercial",
        Icone: Briefcase,
        fonte: "crm",
        descricao: "Veja os leads e as oportunidades em cada etapa.",
        termos: "crm comercial conversao vendas leads",
        grupo: "CRM e oportunidades",
      },
      {
        path: "/crm-guia",
        label: "Guia de organização do CRM",
        termos: "organizar crm manual guia preenchimento",
        descricao: "Veja o que ajustar no CRM externo e como organizar os dados.",
        Icone: ClipboardList,
        fonte: "crm",
        grupo: "CRM e oportunidades",
      },
      {
        path: "/atendimento",
        label: "Qualidade do atendimento",
        Icone: MessageCircle,
        fonte: "atendimento",
        descricao: "Analise as conversas e os pontos de atenção do WhatsApp.",
        termos: "whatsapp atendimento auditoria conversas resposta",
        grupo: "Atendimento",
      },
      {
        path: "/vendas-kommo",
        label: "Resultados por origem do CRM",
        Icone: ShoppingBag,
        admin: true,
        equipe: true,
        fonte: "crm",
        descricao: "Consulte as vendas por origem registradas no Kommo.",
        grupo: "Resultados comerciais",
      },
      {
        path: "/jornada",
        label: "Jornada comercial",
        Icone: Route,
        admin: true,
        termos: "atribuicao receita aquisicao comparecimento",
        grupo: "Jornada comercial",
      },
    ],
  },
  {
    id: "acoes",
    label: "Plano de ação",
    curto: "Ações",
    descricao: "Prioridades, entregas dos agentes e execução da equipe",
    Icone: ListTodo,
    tabs: [
      {
        path: "/proximas-acoes",
        label: "Prioridades da equipe",
        Icone: ListTodo,
        descricao: "Veja o que precisa de atenção, quem cuida e o andamento.",
        termos: "tarefas fazer pendencias proximas acoes responsavel",
      },
      {
        path: "/agentes",
        label: "Agentes e entregas",
        Icone: Bot,
        descricao:
          "Acompanhe os agentes, revise entregas e aprove o que depende de você.",
        termos: "agentes inteligencia artificial ia automacao aprovacoes trabalhos execucoes entregas",
      },
      {
        path: "/oportunidades",
        label: "Oportunidades de melhoria",
        Icone: Target,
        descricao: "Investigue os sinais encontrados nos dados antes de agir.",
        termos: "score diagnostico gargalos oportunidades",
      },
    ],
  },
  {
    id: "relatorio",
    label: "Relatórios",
    descricao: "Síntese dos resultados para compartilhar",
    Icone: FileText,
    tabs: [
      {
        path: "/relatorio",
        label: "Relatório do período",
        Icone: FileText,
        descricao: "Prepare uma síntese dos resultados para compartilhar.",
        termos: "pdf exportar download relatorio",
      },
    ],
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
  {
    path: "/admin/$clientId",
    label: "Configurar este cliente",
    Icone: Settings,
    admin: true,
    absoluto: true,
  },
  {
    path: "/crm-estrutura",
    label: "Etapas do CRM",
    Icone: Network,
    admin: true,
    fonte: "crm",
  },
  {
    path: "/admin",
    label: "Todos os clientes",
    Icone: LayoutDashboard,
    admin: true,
    absoluto: true,
  },
];

// Clientes que só têm CRM ligado e não têm Business Manager: veem só o
// Comercial. Quem abrir outro endereço é levado ao Funil. Dra. Fernanda Nunes (RD Station CRM).
export const CLIENTES_SO_CRM = new Set([
  "8770500e-ab5d-4ae8-9489-c49c9991303c",
]);
export const ROTAS_DO_CRM = [
  "/crm-painel",
  "/crm-guia",
  "/crm-estrutura",
  "/vendas-kommo",
];

// Clientes sem Business Manager próprio: a Meta não libera a Audiência ao vivo
// (cidades, idade, gênero), então a aba fica escondida e o endereço direto volta
// para o Resultado. Dra. Marcelly Achkar. Para voltar, tire o id daqui.
export const CLIENTES_SEM_AUDIENCIA = new Set([
  "633e6ee6-cb55-4796-8ffe-ce9c6e34cc12",
]);

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
  /** Cliente com o Sistema de Aquisição ativo (linha em sap_clinicas). */
  sap?: boolean;
  /** Papel no cliente, usado nas restrições das ferramentas administrativas. */
  papel?: "admin" | "owner" | "strategist" | "viewer" | null;
}

// A ordem do menu é a mesma para todos. Permissões e fontes filtram apenas os destinos disponíveis.
export function tabVisivel(t: NavTab, v: Visibilidade): boolean {
  return (
    (!t.admin || v.isAdmin) &&
    (!t.equipe || (v.papel !== "owner" && v.papel !== "viewer")) &&
    (!t.sap || !!v.sap || v.isAdmin) &&
    fonteOk(t.fonte, v.fontes) &&
    (!v.soCrm || !!t.admin || t.fonte === "crm" || (!!t.sap && !!v.sap)) &&
    !(v.semAudiencia && t.path.endsWith("audiencia"))
  );
}

export type AreaVisivel = NavArea & { visiveis: NavTab[] };

export function areasVisiveis(v: Visibilidade): AreaVisivel[] {
  return AREAS.map((a) => ({
    ...a,
    visiveis: a.tabs.filter((t) => tabVisivel(t, v)),
  }))
    .filter((a) => a.visiveis.length > 0);
}

/** Itens de Sistema/Admin: só a equipe (app admin). Médico (owner) e viewer nunca veem. */
export function avancadoVisivel(v: Visibilidade): NavTab[] {
  if (!v.isAdmin || v.papel === "owner" || v.papel === "viewer") return [];
  return AVANCADO.filter((t) => tabVisivel(t, v));
}

/** Parte do endereço depois de /<clientId>: "" para a página do cliente, "/posts" etc. */
export function subcaminho(pathname: string, clientId: string): string {
  const base = `/${clientId}`;
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return pathname;
  const resto = pathname.slice(base.length).replace(/\/+$/, "");
  return resto;
}

/** Área ativa para o endereço atual. "mais" quando a tela está no Avançado. */
export function areaDoCaminho(sub: string): NavArea["id"] | "mais" | null {
  for (const a of AREAS) if (a.tabs.some((t) => t.path === sub)) return a.id;
  if (AVANCADO.some((t) => !t.absoluto && t.path === sub)) return "mais";
  return null;
}

export interface TelaEncontrada {
  tab: NavTab;
  area: string;
}

/** Busca local: só indexa os destinos visíveis para esta clínica e este papel. */
export function buscarTelas(
  v: Visibilidade,
  consulta: string,
): TelaEncontrada[] {
  const normalizar = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const palavras = normalizar(consulta).trim().split(/\s+/).filter(Boolean);
  const telas = areasVisiveis(v).flatMap((a) =>
    a.visiveis.map((tab) => ({ tab, area: a.label })),
  );
  telas.push(...avancadoVisivel(v).map((tab) => ({ tab, area: "Equipe" })));
  return telas.filter(({ tab, area }) => {
    const texto = normalizar(
      [area, tab.label, tab.descricao, tab.termos].filter(Boolean).join(" "),
    );
    const termos = texto.split(/[^a-z0-9]+/).filter(Boolean);
    return palavras.every((p) => termos.some((termo) => termo.startsWith(p)));
  });
}

/** A mesma rota pode ter atalhos para visões diferentes, sem duplicar a ferramenta. */
export function navTabKey(tab: NavTab): string {
  return tab.path + (tab.search ? `?visao=${tab.search.visao}` : "");
}
export function tabAtiva(tab: NavTab, path: string, search: Record<string, unknown> = {}): boolean {
  return tab.path === path && (!tab.search || tab.search.visao === parseContentView(search.visao));
}
export function navSearch<T extends object>(tab: NavTab, period: T) {
  return { ...period, ...tab.search };
}
