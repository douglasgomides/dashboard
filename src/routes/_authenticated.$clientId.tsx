import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  TrendingUp,
  MessageCircleQuestion,
  Lightbulb,
  Megaphone,
  MessagesSquare,
  KanbanSquare,
  GitBranch,
  Settings2,
  UserCheck,
  DollarSign,
  Workflow,
  Menu,
  X,
} from "lucide-react";
import { getClient } from "@/lib/client-data";
import { useAuth } from "@/hooks/use-auth";
import { LogoutButton } from "@/components/logout-button";
import { DateRangePicker } from "@/components/date-range-picker";
import { ThemeMenu } from "@/components/theme-menu";
import type { DateRangeState, RangePreset } from "@/lib/date-range";

export const Route = createFileRoute("/_authenticated/$clientId")({
  component: ClientLayout,
  validateSearch: (search: Record<string, unknown>): DateRangeState => ({
    preset: (search.preset as RangePreset) ?? "90d",
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
  }),
});

const CFM_DOT: Record<string, string> = {
  verde: "var(--good)",
  amarelo: "var(--warn)",
  vermelho: "var(--danger)",
};

/*
 * Antes eram 12 abas numa fila só. No desktop já era muito para varrer com o
 * olho; no celular quebrava em três linhas e virava um paredão — e é o celular
 * que o médico usa.
 *
 * Agrupadas, a pergunta "onde vejo X?" passa a ter resposta antes de ler item
 * por item. O título do grupo carrega o qualificador, então o item pode ser
 * curto: "Atendimento › WhatsApp" em vez de "Atendimento (WhatsApp)".
 */
const GRUPOS: {
  titulo: string | null;
  itens: { to: string; label: string; exact?: boolean; Icone: typeof LayoutDashboard }[];
}[] = [
  {
    titulo: null,
    itens: [{ to: "/$clientId", label: "Visão geral do mês", exact: true, Icone: LayoutDashboard }],
  },
  {
    titulo: "Conteúdo",
    itens: [
      { to: "/$clientId/posts", label: "Ranking & próximos ângulos", Icone: TrendingUp },
      { to: "/$clientId/duvidas", label: "Dúvidas de pacientes", Icone: MessageCircleQuestion },
      { to: "/$clientId/inspiracao", label: "Inspiração", Icone: Lightbulb },
    ],
  },
  { titulo: "Mídia paga", itens: [{ to: "/$clientId/anuncios", label: "Anúncios", Icone: Megaphone }] },
  { titulo: "Atendimento", itens: [{ to: "/$clientId/atendimento", label: "WhatsApp", Icone: MessagesSquare }] },
  {
    titulo: "CRM",
    itens: [
      { to: "/$clientId/crm-painel", label: "Painel", Icone: KanbanSquare },
      { to: "/$clientId/vendas-kommo", label: "Vendas × origem", Icone: GitBranch },
      { to: "/$clientId/crm-estrutura", label: "Estrutura", Icone: Settings2 },
    ],
  },
  {
    titulo: "Resultado",
    itens: [
      { to: "/$clientId/consultas", label: "O que virou paciente", Icone: UserCheck },
      { to: "/$clientId/vendas", label: "O que virou venda", Icone: DollarSign },
    ],
  },
  { titulo: "Sistema", itens: [{ to: "/$clientId/automacoes", label: "Automações", Icone: Workflow }] },
];

function ClientLayout() {
  const { clientId } = Route.useParams();
  const dateRange = Route.useSearch();
  const navigate = useNavigate();
  // `useNavigate({ from: Route.fullPath })` resolvia sempre pra rota do
  // layout (a aba "Visão geral"), não pra aba realmente ativa — trocar o
  // período em qualquer outra aba (ex.: Ranking) jogava de volta pra Visão
  // geral. Navegar explicitamente pro pathname atual resolve, seja qual for
  // a aba aberta.
  const currentPathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useAuth();
  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient(clientId),
  });

  const [gavetaAberta, setGavetaAberta] = useState(false);

  // Navegou, fecha a gaveta. Sem isso o menu fica por cima do conteúdo que a
  // pessoa acabou de pedir.
  useEffect(() => {
    setGavetaAberta(false);
  }, [currentPathname]);

  useEffect(() => {
    if (!gavetaAberta) return;
    function noEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setGavetaAberta(false);
    }
    document.addEventListener("keydown", noEsc);
    return () => document.removeEventListener("keydown", noEsc);
  }, [gavetaAberta]);

  const menu = (
    <nav className="flex flex-col gap-5">
      {GRUPOS.map((grupo, i) => (
        <div key={grupo.titulo ?? `grupo-${i}`} className="flex flex-col gap-0.5">
          {grupo.titulo && (
            <div
              className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-faint)" }}
            >
              {grupo.titulo}
            </div>
          )}
          {grupo.itens.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              params={{ clientId }}
              search={dateRange}
              activeOptions={{ exact: item.exact ?? false }}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium"
              activeProps={{ style: { color: "var(--accent)", background: "var(--accent-soft)" } }}
              inactiveProps={{ style: { color: "var(--text-dim)" } }}
            >
              <item.Icone size={16} className="shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  const identidade = (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold leading-tight">{client?.name ?? "Carregando…"}</h1>
        {client?.cfm_score_status && (
          <span
            title={`Selo CFM: ${client.cfm_score_status}`}
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: CFM_DOT[client.cfm_score_status] }}
          />
        )}
      </div>
      {(client?.specialty || client?.instagram_handle) && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
          {client?.specialty}
          {client?.instagram_handle ? ` · @${client.instagram_handle}` : ""}
        </p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      {/* Coluna fixa no desktop */}
      <aside
        className="hidden border-r lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:gap-6 lg:p-4"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {identidade}
        <div className="flex-1 overflow-y-auto">{menu}</div>
        <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          {isAdmin && (
            <Link to="/admin/$clientId" params={{ clientId }} className="px-3 text-sm" style={{ color: "var(--accent)" }}>
              ← Painel admin
            </Link>
          )}
          <LogoutButton />
        </div>
      </aside>

      {/* Gaveta no celular */}
      {gavetaAberta && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,.5)" }}
            onClick={() => setGavetaAberta(false)}
          />
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto border-r p-4"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              {identidade}
              <button
                type="button"
                onClick={() => setGavetaAberta(false)}
                aria-label="Fechar menu"
                style={{ color: "var(--text-dim)" }}
              >
                <X size={18} />
              </button>
            </div>
            {menu}
            <div className="mt-auto flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
              {isAdmin && (
                <Link to="/admin/$clientId" params={{ clientId }} className="px-3 text-sm" style={{ color: "var(--accent)" }}>
                  ← Painel admin
                </Link>
              )}
              <LogoutButton />
            </div>
          </div>
        </div>
      )}

      <div className="min-w-0">
        {/* Barra fixa: o seletor de período precisa continuar alcançável no meio
            de uma tabela longa. */}
        <div
          className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-2.5"
          style={{ borderColor: "var(--border)", background: "var(--bg)" }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setGavetaAberta(true)}
              aria-label="Abrir menu"
              className="rounded-md border p-1.5 lg:hidden"
              style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
            >
              <Menu size={17} />
            </button>
            <span className="truncate text-sm font-medium lg:hidden">{client?.name ?? "Carregando…"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker
              value={dateRange}
              onChange={(next) => navigate({ to: currentPathname, search: next, replace: true })}
            />
            <ThemeMenu />
          </div>
        </div>

        <main className="mx-auto max-w-6xl px-5 py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
