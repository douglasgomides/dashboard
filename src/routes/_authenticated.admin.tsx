import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, FileText, LayoutDashboard, Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LogoutButton } from "@/components/logout-button";
import { TrocaProduto } from "@/components/troca-produto";
import { getClient } from "@/lib/client-data";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: isAdmin } = await supabase.rpc("is_app_admin");
    if (!isAdmin) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

// Admin no MESMO layout do painel do cliente (barra lateral, tipografia, cartões): parece parte do mesmo produto.
const ITENS = [
  { to: "/admin", label: "Clientes do Hub", Icone: LayoutDashboard, exato: true },
  { to: "/admin/referencia", label: "Referência entre clientes", Icone: Scale },
  { to: "/admin/conferencia", label: "Conferência de dados", Icone: ClipboardCheck },
  { to: "/admin/relatorios", label: "Relatórios da semana", Icone: FileText },
] as const;

const TITULO: Record<string, string> = {
  "/admin": "Clientes do Hub",
  "/admin/referencia": "Referência entre clientes",
  "/admin/conferencia": "Conferência de dados",
  "/admin/relatorios": "Relatórios da semana",
};

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname }).replace(/\/+$/, "") || "/admin";
  // Dentro de um cliente (/admin/<id>): o título é o nome do cliente.
  const idCliente = /^\/admin\/([0-9a-f-]{36})$/.exec(pathname)?.[1] ?? null;
  const { data: cliente } = useQuery({ queryKey: ["client", idCliente], queryFn: () => getClient(idCliente!), enabled: !!idCliente });
  const titulo = idCliente ? (cliente?.name ?? "Carregando…") : (TITULO[pathname] ?? "Painel admin");

  const itens = ITENS.map((it) => (
    <Link key={it.to} to={it.to} activeOptions={{ exact: "exato" in it ? true : false }} activeProps={{ "aria-current": "page" }}>
      <it.Icone aria-hidden size={18} />
      <span>{it.label}</span>
    </Link>
  ));

  return (
    <div className="app">
      <aside aria-label="Menu do admin">
        <div className="brand">
          <span className="logo">
            <i />
          </span>
          <span className="so-aberta">Doctor Creator Hub</span>
        </div>
        <TrocaProduto atual="hub" clientId={null} />
        <nav className="side">
          <div className="lbl">Portfólio</div>
          {itens}
        </nav>
        <div className="side-foot so-aberta">
          <LogoutButton className="text-sm text-left min-h-[36px]" />
          <span>Doctor Creator Hub</span>
        </div>
      </aside>
      <div className="mainwrap">
        <div className="top admin-top">
          <div className="who">
            <div style={{ minWidth: 0 }}>
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                {idCliente ? "Cliente · configuração" : "Painel admin"}
              </span>
              <h1>{titulo}</h1>
            </div>
          </div>
        </div>
        {/* Celular: a barra lateral some; os mesmos atalhos numa linha que rola de lado. */}
        <nav className="admin-mnav" aria-label="Menu do admin">
          {ITENS.map((it) => (
            <Link key={it.to} to={it.to} activeOptions={{ exact: "exato" in it ? true : false }} activeProps={{ "aria-current": "page" }}>
              {it.label}
            </Link>
          ))}
          <LogoutButton className="text-sm" />
        </nav>
        <div className="mt-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
