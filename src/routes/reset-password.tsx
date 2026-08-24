import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase troca o link de recuperação por uma sessão temporária e
    // dispara PASSWORD_RECOVERY assim que o hash da URL é processado.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate({ to: "/" }), 1500);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border p-8" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h1 className="text-lg font-semibold">Nova senha</h1>

        {!ready && (
          <p className="mt-3 text-sm" style={{ color: "var(--text-dim)" }}>
            Abrindo o link de redefinição…
          </p>
        )}

        {ready && !done && (
          <form onSubmit={handleSubmit}>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
              Nova senha
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            />
            {error && (
              <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {loading ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}

        {done && (
          <p className="mt-3 text-sm" style={{ color: "var(--good)" }}>
            Senha atualizada. Te levando pro painel…
          </p>
        )}
      </div>
    </div>
  );
}
