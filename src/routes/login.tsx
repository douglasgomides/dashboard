import { useState, type FormEvent } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { BarChart3, Eye, EyeOff, Target, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendPasswordReset } from "@/lib/admin-data";
import { ehEnderecoSap } from "@/lib/marca";

// Entrada do Doctor Creator Hub: apresentação curta (o que é) + login. É a página inicial de quem não está
// logado. No endereço sap.* o texto fala do Sistema de Aquisição. As regras de acesso não mudam: só entra
// quem foi convidado (admin cria o acesso), e depois do login cada um vai para o que pode ver.
export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: typeof s.redirect === "string" ? s.redirect : undefined }),
  // Já logado: a página de entrada leva direto para o painel.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

const MENSAGEM_ERRO: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "E-mail ainda não confirmado. Fale com a equipe Doctor Creator.",
};

function LoginPage() {
  const navigate = useNavigate();
  const { redirect: voltarPara } = Route.useSearch();
  const sap = ehEnderecoSap();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
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
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(MENSAGEM_ERRO[error.message] ?? error.message);
      return;
    }
    // Volta para onde a pessoa estava (só caminhos internos); senão, a página inicial decide.
    if (voltarPara && voltarPara.startsWith("/") && !voltarPara.startsWith("//") && !voltarPara.startsWith("/login")) {
      window.location.assign(voltarPara);
      return;
    }
    navigate({ to: "/" });
  }

  const itens = sap
    ? [
        { I: Target, t: "Os 90 dias num lugar só", d: "Linha do tempo do D0 ao D90, marcos e o que cada lado entrega na quinzena." },
        { I: BarChart3, t: "Metas e garantia com o seu dado", d: "Baseline do D0, metas assinadas e os KPIs da garantia medidos direto do CRM e do WhatsApp." },
        { I: Wallet, t: "Leitura da semana pronta", d: "Onde a clínica mais perde paciente, quanto isso custa e a ação da semana." },
      ]
    : [
        { I: Wallet, t: "Quanto voltou do que foi investido", d: "Investimento em anúncios, vendas do CRM e retorno no período." },
        { I: BarChart3, t: "Conteúdo, anúncios e atendimento juntos", d: "Instagram, Meta, WhatsApp e CRM lidos todo dia, sem planilha." },
        { I: Target, t: "O que fazer agora", d: "Onde o funil trava e a próxima ação, em linguagem simples." },
      ];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]" style={{ background: "var(--bg)" }}>
      {/* Apresentação */}
      <section className="flex flex-col justify-between px-6 py-8 sm:px-10 lg:px-14 lg:py-12" style={{ background: "#0F172A", color: "#E2E8F0" }}>
        <div>
          <Marca claro />
          <h1 className="mt-10 max-w-xl text-2xl font-semibold leading-tight text-white sm:text-3xl lg:mt-16 lg:text-4xl">
            {sap ? "Sistema de Aquisição de Pacientes" : "De onde vêm os seus pacientes e quanto volta do que você investe."}
          </h1>
          <p className="mt-3 max-w-lg text-sm sm:text-base" style={{ color: "#94A3B8" }}>
            {sap
              ? "O acompanhamento do programa de 90 dias: metas, garantia e a leitura de cada semana, com os números da sua clínica."
              : "O painel da Doctor Creator para médicos e clínicas: conteúdo, anúncios, atendimento e vendas, com os números da sua clínica."}
          </p>
          <ul className="mt-8 hidden max-w-lg space-y-5 sm:block lg:mt-12">
            {itens.map(({ I, t, d }) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(196,154,92,0.15)", color: "#C49A5C" }}>
                  <I size={18} aria-hidden />
                </span>
                <div>
                  <div className="font-semibold text-white">{t}</div>
                  <div className="text-sm" style={{ color: "#94A3B8" }}>{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 hidden text-xs sm:block" style={{ color: "#64748B" }}>
          Acesso por convite da equipe Doctor Creator. Os dados de cada clínica só aparecem para quem foi convidado por ela.
        </p>
      </section>

      {/* Login */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm" aria-labelledby="titulo-login">
          <h2 id="titulo-login" className="text-xl font-semibold" style={{ color: "var(--ink, var(--text))" }}>
            Entrar
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>
            Para médicos, equipes de clínica e equipe Doctor Creator.
          </p>

          <label htmlFor="email" className="mt-6 block text-sm font-medium">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 min-h-[44px] w-full rounded-lg border px-3 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          />

          <label htmlFor="senha" className="mt-4 block text-sm font-medium">
            Senha
          </label>
          <div className="relative mt-1">
            <input
              id="senha"
              type={ver ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border px-3 pr-11 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              aria-label={ver ? "Esconder senha" : "Mostrar senha"}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md"
              style={{ color: "var(--text-dim)" }}
            >
              {ver ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm" style={{ color: "var(--crit, var(--danger))" }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="mt-6 min-h-[44px] w-full rounded-lg text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
            {loading ? "Entrando…" : "Entrar"}
          </button>

          <button type="button" onClick={handleForgotPassword} className="mt-3 min-h-[40px] w-full text-center text-sm" style={{ color: "var(--text-dim)" }}>
            {resetSent ? "Link enviado: confira seu e-mail" : "Esqueci minha senha"}
          </button>

          <p className="mt-8 text-center text-xs" style={{ color: "var(--muted)" }}>
            Ainda não tem acesso? Peça à equipe Doctor Creator: o convite chega com o link e uma senha temporária.
          </p>
        </form>
      </section>
    </div>
  );
}

export function Marca({ claro = false }: { claro?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xl" style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: claro ? "#fff" : "var(--ink, var(--text))" }}>
        Doctor<strong style={{ color: "#C49A5C" }}>Creator</strong>
      </span>
      <span className="rounded-md px-1.5 py-0.5 text-xs font-semibold" style={{ background: claro ? "rgba(255,255,255,0.1)" : "var(--accent-soft)", color: claro ? "#E2E8F0" : "var(--accent)" }}>
        Hub
      </span>
    </div>
  );
}
