import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function LogoutButton({ className = "text-sm", dark = false }: { className?: string; dark?: boolean }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleLogout() {
    setLoading(true);
    setError(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) { setError(true); return; }
      await navigate({ to: "/login" });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={className}
      style={{ color: dark ? "var(--side-ink-2)" : "var(--text-dim)" }}
    >
      {loading ? "Saindo…" : "Sair"}
    </button>
    {error && <span role="alert" className="text-xs" style={{ color: "var(--danger)" }}>Não foi possível sair. Tente novamente.</span>}
    </>
  );
}
