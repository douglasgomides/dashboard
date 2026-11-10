import { useEffect, useState } from "react";
import { createFileRoute, Navigate, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LogoutButton } from "@/components/logout-button";
import { BottomSheet } from "@/components/app-shell";
import { BuscaDeTelas } from "@/components/busca-de-telas";
import { MarcaNexo, MenuEquipe } from "@/components/menu-equipe";
import { IconeTabler } from "@/components/icons/tabler";
import { AvatarGerado } from "@/components/avatar-gerado";
import { getClient } from "@/lib/client-data";
import { useAuth } from "@/hooks/use-auth";
import { registrarBloqueada } from "@/lib/rota-log-instalar";
import { gravarUltimaClinica, lerUltimaClinica } from "@/lib/ultima-clinica";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    const { data: isAdmin } = await supabase.rpc("is_app_admin");
    if (!isAdmin) {
      // D-16: a tela negada ganha uma linha bloqueada (síncrona, nunca lança); o destino grava redirecionamento.
      registrarBloqueada(location.pathname);
      throw redirect({ to: "/" });
    }
  },
  component: AdminLayout,
});

// Casca /admin com o mesmo Menu da equipe, a mesma busca e o mesmo rodapé da casca da clínica (Phase 3, MENU-02/03, D-01).
// O menu não autoriza nada: a guarda is_app_admin continua no beforeLoad acima (T-03-15).
const PERFIL_ADMIN = { isAdmin: true, papel: null } as const;

// Dica do atalho no campo Buscar tela (decorativa, aria-hidden): ⌘ K no Mac, Ctrl K nos outros.
const ATALHO_BUSCA =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘ K" : "Ctrl K";

// Títulos das telas do /admin (cabeçalho da página e do celular).
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
  const { user } = useAuth();
  const email = (user?.email ?? "").toLowerCase();
  const nomeDoUsuario = email.split("@")[0];

  // D-02: Clínica e a busca usam a clínica desta tela (/admin/<id>) ou a última aberta naquele navegador.
  const clientIdDoMenu = idCliente ?? lerUltimaClinica();
  useEffect(() => {
    if (idCliente) gravarUltimaClinica(idCliente);
  }, [idCliente]);

  const [busca, setBusca] = useState(false);
  const [menu, setMenu] = useState(false);
  // Sem clínica lembrada: Clínica (ou um resultado da busca que precisa de clínica) fica na Carteira com a dica.
  const [pedirClinica, setPedirClinica] = useState(false);
  useEffect(() => {
    setMenu(false);
    setBusca(false);
    if (pathname !== "/admin") setPedirClinica(false);
  }, [pathname]);
  const semClinica = () => setPedirClinica(true);
  function abrirBusca() {
    setMenu(false);
    setBusca(true);
  }

  return (
    <div className="app product-workspace workspace-admin">
      <aside aria-label="Menu do admin" data-origem="menu" className="nx-barra">
        <div className="nx-barra-topo">
          <MarcaNexo />
        </div>
        <button type="button" className="nx-buscar" onClick={abrirBusca} aria-keyshortcuts="Control+K Meta+K">
          <IconeTabler nome="search" tamanho={16} />
          <span className="nx-buscar-texto">Buscar tela</span>
          <kbd aria-hidden="true">{ATALHO_BUSCA}</kbd>
        </button>
        <MenuEquipe
          variante="barra"
          perfil={PERFIL_ADMIN}
          clientId={clientIdDoMenu}
          pathname={pathname}
          onSemClinica={semClinica}
        />
        <hr className="nx-sep so-aberta" />
        <div className="nx-rodape so-aberta">
          <Link to="/bem-vindo">Conheça o Nexo</Link>
          <LogoutButton rotulo="Sair da conta" />
          {email && (
            <div className="nx-usuario">
              <AvatarGerado nome={email} tamanho={40} />
              <div className="nx-usuario-texto">
                <b>{nomeDoUsuario}</b>
                <span>{email}</span>
              </div>
            </div>
          )}
        </div>
      </aside>
      <div className="mainwrap">
        <header className="mhead">
          {/* Cabeçalho do celular: sem clínica atual, a marca N fica no lugar do tile (FA-13). */}
          <div className="mhead-linha nx-mhead">
            <MarcaNexo recolhida />
            <b className="nx-mhead-nome">{titulo}</b>
            <button type="button" className="nx-mhead-buscar" onClick={abrirBusca}>
              <IconeTabler nome="search" tamanho={20} />
              <span>Buscar tela</span>
            </button>
            <button
              type="button"
              className="icobtn nx-mhead-menu"
              onClick={() => setMenu(true)}
              aria-label="Abrir menu"
              aria-haspopup="dialog"
            >
              <IconeTabler nome="menu-2" tamanho={20} />
            </button>
          </div>
        </header>
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
        {pedirClinica && pathname === "/admin" && (
          <p role="status" className="nx-dica-clinica">
            Escolha uma clínica para abrir os resultados dela.
          </p>
        )}
        <main className="mt-6" id="admin-content"><Outlet /></main>
      </div>
      <BottomSheet aberto={menu} onFechar={() => setMenu(false)} titulo="Menu" origem="menu">
        <MenuEquipe
          variante="folha"
          perfil={PERFIL_ADMIN}
          clientId={clientIdDoMenu}
          pathname={pathname}
          onEscolher={() => setMenu(false)}
          onSemClinica={semClinica}
        />
        <hr className="nx-sep" />
        <LogoutButton rotulo="Sair da conta" className="mais-item mais-sair" />
      </BottomSheet>
      <BuscaDeTelas
        aberto={busca}
        onAbrir={abrirBusca}
        onFechar={() => setBusca(false)}
        perfil={PERFIL_ADMIN}
        clientId={clientIdDoMenu}
        onSemClinica={semClinica}
      />
    </div>
  );
}
