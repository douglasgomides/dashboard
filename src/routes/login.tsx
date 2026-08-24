import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { sendPasswordReset } from "@/lib/admin-data";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Digite seu e-mail acima antes de pedir o link.");
      return;
    }
    setError(null);
    await sendPasswordReset(email).catch((err) => setError((err as Error).message));
    setResetSent(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border p-8"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <h1 className="text-lg font-semibold">Doctor Creator Intelligence Hub</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
          Entre com seu acesso de estrategista.
        </p>

        <label className="mt-6 block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          E-mail
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />

        <label className="mt-4 block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          Senha
        </label>
        <input
          type="password"
          required
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
          {loading ? "Entrando…" : "Entrar"}
        </button>

        <button
          type="button"
          onClick={handleForgotPassword}
          className="mt-3 w-full text-center text-xs"
          style={{ color: "var(--text-dim)" }}
        >
          {resetSent ? "Link enviado — confira seu e-mail" : "Esqueci minha senha"}
        </button>
      </form>
    </div>
  );
}
