import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/login", search: { redirect: location.href } as any });
    }
    // Primeiro acesso de quem recebeu convite: criar a própria senha e ver o tour antes de entrar.
    if (data.user.user_metadata?.primeiro_acesso === true && !location.pathname.startsWith("/bem-vindo")) {
      throw redirect({ to: "/bem-vindo" });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm" style={{ color: "var(--text-dim)" }}>
        Carregando…
      </div>
    );
  }
  return <Outlet />;
}
