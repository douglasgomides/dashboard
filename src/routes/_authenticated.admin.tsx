import { createFileRoute, Outlet, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogoutButton } from "@/components/logout-button";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: isAdmin } = await supabase.rpc("is_app_admin");
    if (!isAdmin) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span
            className="text-xs font-mono uppercase tracking-wide"
            style={{ color: "var(--text-faint)" }}
          >
            Painel admin
          </span>
          <h1 className="text-xl font-semibold">
            <Link to="/admin">Clientes</Link>
          </h1>
        </div>
        <LogoutButton />
      </header>
      <Outlet />
    </div>
  );
}
