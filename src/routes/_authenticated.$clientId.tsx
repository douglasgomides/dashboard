import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Activity,
  AlignLeft,
  LayoutGrid,
  Megaphone,
  Briefcase,
  MessageCircle,
  HelpCircle,
  Lightbulb,
  FileText,
  Star,
  Settings,
  Search,
  Menu,
  X,
  ShieldCheck,
  ListChecks,
  Users,
  Trophy,
} from "lucide-react";
import { getClient, getClientFontes } from "@/lib/client-data";
import { listAllClients } from "@/lib/admin-data";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { LogoutButton } from "@/components/logout-button";
import { DateRangePicker } from "@/components/date-range-picker";
import { ClientAvatar } from "@/components/client-avatar";
import { SyncFreshnessBadge } from "@/components/sync-freshness-badge";
import type { DateRangeState, RangePreset } from "@/lib/date-range";

export const Route = createFileRoute("/_authenticated/$clientId")({
  component: ClientLayout,
  validateSearch: (search: Record<string, unknown>): DateRangeState => ({
    preset: (search.preset as RangePreset) ?? "90d",
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
  }),
});

// Clientes que só têm CRM ligado e não têm Business Manager: mostram só a aba
// Comercial. As demais abas ficam escondidas e quem abrir o endereço delas é
// levado ao Comercial. Dra. Fernanda Nunes (RD Station CRM).
const CLIENTES_SO_CRM = new Set(["8770500e-ab5d-4ae8-9489-c49c9991303c"]);
const ROTAS_DO_CRM = ["/crm-painel", "/crm-estrutura", "/vendas-kommo"];

type Fonte = "instagram" | "anuncios" | "crm" | "atendimento";
type NavItem = { to: string; label: string; Icone: typeof LayoutGrid; exact?: boolean; admin?: boolean; fonte?: Fonte };
type NavGroup = { titulo: string; itens: NavItem[] };

// Navegação unificada (protótipo v3). Grupos: Portfólio · Cliente · Biblioteca ·
// Sistema. Abas que dependem de uma fonte (Posts/Dúvidas=instagram, Anúncios,
// Comercial=crm, WhatsApp=atendimento) só aparecem com a fonte conectada — pra
// ninguém cair em aba vazia. O "mostrar e explicar a falta" do adendo entra no
// M3, quando as páginas ganharem o estado de dado ausente.
function buildGroups(clientName: string): NavGroup[] {
  return [
    { titulo: "Portfólio", itens: [{ to: "/admin", label: "Visão geral", Icone: LayoutDashboard, admin: true }] },
    {
      titulo: `Cliente · ${clientName}`,
      itens: [
        { to: "/$clientId", label: "Resultado", Icone: Activity, exact: true },
        { to: "/$clientId/conteudo", label: "Conteúdo", Icone: AlignLeft },
        { to: "/$clientId/posts", label: "Posts", Icone: LayoutGrid, fonte: "instagram" },
        { to: "/$clientId/top", label: "Top conteúdos", Icone: Trophy, fonte: "instagram" },
        { to: "/$clientId/audiencia", label: "Audiência", Icone: Users, fonte: "instagram" },
        { to: "/$clientId/anuncios", label: "Anúncios", Icone: Megaphone, fonte: "anuncios" },
        { to: "/$clientId/crm-painel", label: "Comercial", Icone: Briefcase, fonte: "crm" },
        { to: "/$clientId/atendimento", label: "WhatsApp", Icone: MessageCircle, fonte: "atendimento" },
        { to: "/$clientId/duvidas", label: "Dúvidas", Icone: HelpCircle, fonte: "instagram" },
        { to: "/$clientId/ideias", label: "Ideias", Icone: Lightbulb },
        { to: "/$clientId/relatorio", label: "Relatório", Icone: FileText },
        { to: "/$clientId/analisar", label: "A analisar", Icone: ListChecks, admin: true, fonte: "crm" },
      ],
    },
    { titulo: "Biblioteca", itens: [{ to: "/$clientId/inspiracao", label: "Inspiração", Icone: Star }] },
    { titulo: "Sistema", itens: [{ to: "/admin", label: "Admin", Icone: Settings, admin: true }] },
  ];
}

function ClientLayout() {
  const { clientId } = Route.useParams();
  const dateRange = Route.useSearch();
  const navigate = useNavigate();
  const currentPathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useAuth();
  const { tema, setTema } = useTheme();

  const { data: client } = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId) });
  const { data: fontes } = useQuery({ queryKey: ["client-fontes", clientId], queryFn: () => getClientFontes(clientId) });

  // Aba com fonte só aparece se a fonte estiver conectada. Enquanto fontes não
  // carregam, mostra tudo (não pisca cadeado à toa).
  const fonteOk = (fonte?: Fonte): boolean => {
    if (!fonte || !fontes) return true;
    if (fonte === "instagram") return fontes.tem_instagram;
    if (fonte === "anuncios") return fontes.tem_anuncios;
    if (fonte === "crm") return fontes.tem_crm;
    if (fonte === "atendimento") return fontes.tem_atendimento;
    return true;
  };

  const soCrm = CLIENTES_SO_CRM.has(clientId);
  useEffect(() => {
    if (!soCrm) return;
    const dentroDoCrm = ROTAS_DO_CRM.some((r) => currentPathname.endsWith(r));
    if (!dentroDoCrm) {
      navigate({ to: "/$clientId/crm-painel", params: { clientId }, search: dateRange, replace: true });
    }
  }, [soCrm, currentPathname, clientId, navigate, dateRange]);

  const [drawer, setDrawer] = useState(false);
  const [pal, setPal] = useState(false);

  useEffect(() => setDrawer(false), [currentPathname]);

  // Ctrl/Cmd+K abre a busca de cliente (admin). Esc fecha drawer/paleta.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && isAdmin) {
        e.preventDefault();
        setPal((v) => !v);
      }
      if (e.key === "Escape") {
        setPal(false);
        setDrawer(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isAdmin]);

  const groups = buildGroups(client?.name ?? "…");

  const nav = (
    <nav className="side">
      {groups.map((g) => {
        const itens = g.itens.filter(
          (it) =>
            (!it.admin || isAdmin) &&
            fonteOk(it.fonte) &&
            (!soCrm || it.admin || it.fonte === "crm"),
        );
        if (itens.length === 0) return null;
        return (
          <div key={g.titulo}>
            <div className="lbl">{g.titulo}</div>
            {itens.map((it) =>
              it.to.startsWith("/$clientId") ? (
                <Link
                  key={it.to}
                  to={it.to}
                  params={{ clientId }}
                  search={dateRange}
                  activeOptions={{ exact: it.exact ?? false }}
                  activeProps={{ "aria-current": "page" }}
                >
                  <it.Icone />
                  <span>{it.label}</span>
                </Link>
              ) : (
                <Link key={it.to + it.label} to={it.to} activeProps={{ "aria-current": "page" }}>
                  <it.Icone />
                  <span>{it.label}</span>
                </Link>
              )
            )}
          </div>
        );
      })}
    </nav>
  );

  const sidebarInner = (
    <>
      <div className="brand">
        <span className="logo">
          <i />
        </span>
        <span>Intelligence Hub</span>
      </div>
      {isAdmin && (
        <button type="button" className="kbar" onClick={() => setPal(true)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Search size={15} /> Buscar cliente…
          </span>
          <kbd>Ctrl K</kbd>
        </button>
      )}
      {nav}
      <div className="side-foot">
        <div className="themes">
          <button type="button" aria-pressed={tema === "light"} onClick={() => setTema("light")}>
            Claro
          </button>
          <button type="button" aria-pressed={tema === "dark"} onClick={() => setTema("dark")}>
            Escuro
          </button>
        </div>
        <LogoutButton />
        <span>Intelligence Hub · Doctor Creator</span>
      </div>
    </>
  );

  return (
    <div className="app">
      <aside>{sidebarInner}</aside>

      {/* Drawer no mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40" style={{ display: "block" }}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.5)" }} onClick={() => setDrawer(false)} />
          <aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto p-4"
            style={{ background: "var(--side)", borderRight: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <div className="brand">
                <span className="logo">
                  <i />
                </span>
                <span>Intelligence Hub</span>
              </div>
              <button type="button" onClick={() => setDrawer(false)} aria-label="Fechar menu" style={{ color: "var(--muted)" }}>
                <X size={18} />
              </button>
            </div>
            {nav}
            <div className="side-foot">
              <div className="themes">
                <button type="button" aria-pressed={tema === "light"} onClick={() => setTema("light")}>
                  Claro
                </button>
                <button type="button" aria-pressed={tema === "dark"} onClick={() => setTema("dark")}>
                  Escuro
                </button>
              </div>
              <LogoutButton />
            </div>
          </aside>
        </div>
      )}

      <div className="mainwrap">
        <div className="top">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Abrir menu"
            className="hidden max-[820px]:inline-flex"
            style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 6, color: "var(--ink-2)" }}
          >
            <Menu size={17} />
          </button>
          <div className="who">
            <ClientAvatar nome={client?.name ?? "?"} url={client?.avatar_url} tamanho={46} />
            <div style={{ minWidth: 0 }}>
              <h1>{client?.name ?? "Carregando…"}</h1>
              {(client?.specialty || client?.instagram_handle) && (
                <p>
                  {client?.specialty}
                  {client?.instagram_handle ? ` · @${client.instagram_handle}` : ""}
                </p>
              )}
            </div>
          </div>
          {client?.cfm_score_status === "verde" && (
            <span className="hchip good" title="Status definido pela equipe no cadastro do cliente (campo cfm_score_status). Não é uma verificação automática das publicações.">
              <ShieldCheck /> CFM em conformidade
            </span>
          )}
          <SyncFreshnessBadge clientId={clientId} />
          <span className="spacer" />
          <DateRangePicker
            value={dateRange}
            onChange={(next) => navigate({ to: currentPathname, search: next, replace: true })}
          />
        </div>

        <Outlet />
      </div>

      {isAdmin && pal && <ClientPalette clientId={clientId} onClose={() => setPal(false)} />}
    </div>
  );
}

function ClientPalette({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: clients } = useQuery({ queryKey: ["admin-clients"], queryFn: listAllClients });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = clients ?? [];
    if (!term) return list.slice(0, 40);
    return list
      .filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.specialty ?? "").toLowerCase().includes(term) ||
          (c.instagram_handle ?? "").toLowerCase().includes(term)
      )
      .slice(0, 40);
  }, [q, clients]);

  function go(id: string) {
    onClose();
    navigate({ to: "/$clientId", params: { clientId: id }, search: { preset: "90d" } });
  }

  return (
    <div className="pal on" onClick={onClose}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente por nome, especialidade ou @…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered[0]) go(filtered[0].id);
          }}
        />
        <ul>
          {filtered.map((c) => (
            <li key={c.id}>
              <button type="button" className={c.id === clientId ? "sel" : ""} onClick={() => go(c.id)}>
                <span>{c.name}</span>
                <small>{c.specialty ?? c.instagram_handle ?? ""}</small>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li>
              <button type="button" disabled>
                <span style={{ color: "var(--muted)" }}>Nenhum cliente encontrado.</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
