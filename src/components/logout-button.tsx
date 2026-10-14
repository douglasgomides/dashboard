import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function LogoutButton({ className = "text-sm" }: { className?: string }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={className}
      style={{ color: "var(--text-dim)" }}
    >
      Sair
    </button>
  );
}
