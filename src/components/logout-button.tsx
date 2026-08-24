import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function LogoutButton() {
  const navigate = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-sm"
      style={{ color: "var(--text-dim)" }}
    >
      Sair
    </button>
  );
}
