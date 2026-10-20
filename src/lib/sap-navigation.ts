import {
  CalendarClock,
  CalendarCheck,
  FileText,
  KeyRound,
  ClipboardCheck,
  Flag,
  Gauge,
  ListChecks,
  ListTodo,
  Megaphone,
  Network,
  Target,
  Radar,
  Presentation,
  UsersRound,
  UserRoundCheck,
  Bot,
} from "lucide-react";

// Mapa do programa em seis áreas, preservando os destinos e as regras de visibilidade.
// clinica: o que a clínica vê (menu enxuto). O resto é ferramenta da equipe. Rotas antigas (/semana, /passo-a-passo)
// redirecionam para Minhas tarefas.
export const ITENS = [
  {
    grupo: "",
    sub: "",
    label: "Minhas tarefas",
    Icone: ListTodo,
    clinica: true,
  },
  {
    grupo: "",
    sub: "/plano",
    label: "Plano da semana",
    Icone: CalendarCheck,
    clinica: true,
  },
  {
    grupo: "",
    sub: "/painel",
    label: "Resultados da clínica",
    Icone: Flag,
    clinica: true,
  },
  {
    grupo: "Implantação",
    sub: "/cronograma",
    label: "Cronograma",
    Icone: CalendarClock,
    clinica: true,
  },
  {
    grupo: "Implantação",
    sub: "/sessao",
    label: "Reuniões",
    Icone: Presentation,
    admin: true,
  },
  {
    grupo: "Implantação",
    sub: "/onboarding",
    label: "Ficha e acessos",
    Icone: KeyRound,
  },
  {
    grupo: "Implantação",
    sub: "/rastreamento",
    label: "Rastreamento",
    Icone: Radar,
  },
  {
    grupo: "Implantação",
    sub: "/anuncios",
    label: "Banco de anúncios",
    Icone: Megaphone,
    admin: true,
  },
  {
    grupo: "Implantação",
    sub: "/etapas",
    label: "Etapas do funil",
    Icone: Network,
    admin: true,
  },
  {
    grupo: "Implantação",
    sub: "/papeis",
    label: "Responsáveis",
    Icone: UserRoundCheck,
  },
  {
    grupo: "Rotina semanal",
    sub: "/leitura",
    label: "Leitura da semana",
    Icone: ClipboardCheck,
    clinica: true,
  },
  {
    grupo: "Rotina semanal",
    sub: "/execucao",
    label: "Execução e saúde",
    Icone: ListChecks,
  },
  { grupo: "Rotina semanal", sub: "/midia", label: "Mídia", Icone: Gauge },
  {
    grupo: "Rotina semanal",
    sub: "/agentes",
    label: "Agentes de IA",
    Icone: Bot,
    clinica: true,
  },
  {
    grupo: "Resultado",
    sub: "/metas",
    label: "Metas e garantia",
    Icone: Target,
    clinica: true,
  },
  {
    grupo: "Resultado",
    sub: "/documentos",
    label: "Plano e relatório D90",
    Icone: FileText,
    clinica: true,
  },
] as const;
// Na visão da clínica, os grupos viram um só e alguns nomes ficam mais diretos.
export const ROTULO_CLINICA: Record<string, string> = {
  "/cronograma": "Agenda do programa",
  "/leitura": "Números da semana",
  "/documentos": "Plano e relatório",
};
// Groups reuse the existing permission-filtered items; every original destination stays available.
export const AREAS_SAP = [
  {
    id: "visao",
    label: "Resultados",
    hint: "Números, evolução e metas",
    Icone: Flag,
    subs: ["/painel", "/leitura", "/metas"],
  },
  {
    id: "tarefas",
    label: "Minha semana",
    hint: "Plano, prioridades e tarefas",
    Icone: ListTodo,
    subs: ["/plano", ""],
  },
  {
    id: "implantacao",
    label: "Implantação",
    hint: "Etapas e entregas",
    Icone: CalendarClock,
    subs: ["/cronograma", "/sessao", "/rastreamento", "/anuncios", "/etapas"],
  },
  {
    id: "resultado",
    label: "Rotina e execução",
    hint: "Saúde, mídia e agentes",
    Icone: Gauge,
    subs: ["/execucao", "/midia", "/agentes"],
  },
  {
    id: "materiais",
    label: "Plano e materiais",
    hint: "Decisões e continuidade",
    Icone: FileText,
    subs: ["/documentos"],
  },
  {
    id: "equipe",
    label: "Equipe e acessos",
    hint: "Responsáveis e preparação",
    Icone: UsersRound,
    subs: ["/papeis", "/onboarding"],
  },
];

/** Catálogo de apresentação filtrado pelas permissões já existentes. */
export function areasSapVisiveis(isAdmin: boolean) {
  const itens = ITENS.filter((i) => isAdmin || "clinica" in i).map((i) => ({
    ...i,
    label: isAdmin ? i.label : (ROTULO_CLINICA[i.sub] ?? i.label),
  }));
  return AREAS_SAP.map((area) => ({
    ...area,
    itens: area.subs.flatMap((sub) => itens.filter((i) => i.sub === sub)),
  })).filter((area) => area.itens.length);
}
