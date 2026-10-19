import { ProductBrand } from "@/components/product-brand";
import { createFileRoute, Navigate, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Brain, ClipboardCheck, FileText, Inbox, LayoutDashboard, Plug, Scale, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LogoutButton } from "@/components/logout-button";
import { TrocaProduto } from "@/components/troca-produto";
import { getClient } from "@/lib/client-data";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: isAdmin } = await supabase.rpc("is_app_admin");
    if (!isAdmin) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

// Admin no MESMO layout do painel do cliente (barra lateral, tipografia, cartões): parece parte do mesmo produto.
const ITENS = [
  { to: "/admin/caixa", label: "Caixa de entrada", Icone: Inbox },
  { to: "/admin", label: "Clientes do Nexo", Icone: LayoutDashboard, exato: true },
  { to: "/admin/referencia", label: "Referência entre clientes", Icone: Scale },
  { to: "/admin/conferencia", label: "Conferência de dados", Icone: ClipboardCheck },
  { to: "/admin/relatorios", label: "Relatórios da semana", Icone: FileText },
  { to: "/admin/agentes", label: "Central de Agentes", Icone: Bot },
  { to: "/admin/brain", label: "Brand Brain", Icone: Brain },
  { to: "/admin/integracoes", label: "Integrações", Icone: Plug },
  { to: "/admin/equipe", label: "Equipe", Icone: Users },
] as const;

const GRUPOS = [
  { label: "Operação do dia", paths: ["/admin/caixa", "/admin/agentes"] },
  { label: "Clínicas e resultados", paths: ["/admin", "/admin/relatorios", "/admin/referencia"] },
  { label: "Inteligência e controle", paths: ["/admin/brain", "/admin/conferencia", "/admin/integracoes", "/admin/equipe"] },
];

const TITULO: Record<string, string> = {
  "/admin/caixa": "Caixa de entrada",
  "/admin": "Clientes do Nexo",
  "/admin/referencia": "Referência entre clientes",
  "/admin/conferencia": "Conferência de dados",
  "/admin/relatorios": "Relatórios da semana",
  "/admin/agentes": "Central de Agentes",
  "/admin/brain": "Brand Brain",
  "/admin/integracoes": "Integrações",
  "/admin/equipe": "Equipe",
};

function AdminLayout() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <AdminContent />;
}

function AdminContent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname }).replace(/\/+$/, "") || "/admin";
  // Dentro de um cliente (/admin/<id>): o título é o nome do cliente.
  const idCliente = /^\/admin\/([0-9a-f-]{36})$/.exec(pathname)?.[1] ?? null;
  const { data: cliente } = useQuery({ queryKey: ["client", idCliente], queryFn: () => getClient(idCliente!), enabled: !!idCliente });
  const titulo = idCliente ? (cliente?.name ?? "Carregando…") : (TITULO[pathname] ?? "Nexo · Administração");

  const itens = (paths: string[]) => ITENS.filter((it) => paths.includes(it.to)).map((it) => (
    <Link key={it.to} to={it.to} activeOptions={{ exact: "exato" in it ? true : false }} activeProps={{ "aria-current": "page" }}>
      <it.Icone aria-hidden size={18} /><span>{it.label}</span>
    </Link>
  ));

  return (
    <div className="app product-workspace workspace-admin">
      <aside aria-label="Menu do admin">
        <div className="brand">
          <ProductBrand product="nexo" dark />
        </div>
        <TrocaProduto atual="hub" clientId={null} />
        <nav className="side" aria-label="Ferramentas administrativas">
          {GRUPOS.map((g) => <div className="workspace-nav-section" key={g.label}><p>{g.label}</p>{itens(g.paths)}</div>)}
        </nav>
        <div className="side-foot so-aberta">
          <LogoutButton className="text-sm text-left min-h-[36px]" />
          <span>Nexo · Doctor Creator</span>
        </div>
      </aside>
      <div className="mainwrap">
        <div className="top admin-top">
          <div className="who">
            <div style={{ minWidth: 0 }}>
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                {idCliente ? "Cliente · configuração" : "Nexo · Administração"}
              </span>
              <h1>{titulo}</h1>
            </div>
          </div>
        </div>
        <details className="ws-admin-menu" key={pathname}>
          <summary>Áreas da administração <span aria-hidden>⌄</span></summary>
          <TrocaProduto atual="hub" clientId={null} />
          <nav aria-label="Menu do admin">{GRUPOS.map((g) => <div key={g.label}><h2>{g.label}</h2>{itens(g.paths)}</div>)}</nav>
          <LogoutButton className="ws-action ws-action--secondary" />
        </details>
        <main className="mt-6" id="admin-content"><Outlet /></main>
      </div>
    </div>
  );
}
