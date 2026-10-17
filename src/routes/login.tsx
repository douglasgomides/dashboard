import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { ProductBrand } from "@/components/product-brand";
import { supabase } from "@/integrations/supabase/client";
import { sendPasswordReset } from "@/lib/admin-data";
import { ehEnderecoSap } from "@/lib/marca";
import { loginDestination } from "@/lib/login-destination";

// A apresentação segue o produto do endereço. As permissões vêm da identidade
// autenticada e das rotas protegidas, nunca do tipo de acesso escolhido na entrada.
export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
    acesso: s.acesso === "admin" || s.acesso === "equipe" ? s.acesso : undefined,
  }),
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
  const { redirect: voltarPara, acesso } = Route.useSearch();
  const sap = ehEnderecoSap();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Digite seu e-mail acima antes de pedir o link.");
      return;
    }
    setError(null);
    setResetSent(false);
    setResetLoading(true);
    try {
      await sendPasswordReset(email.trim());
      setResetSent(true);
    } catch (err) {
      setError("Não foi possível solicitar o link. Verifique sua conexão e tente novamente.");
    } finally {
      setResetLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError(MENSAGEM_ERRO[error.message] ?? "Não foi possível entrar. Verifique sua conexão e tente novamente.");
        return;
      }
      const destino = loginDestination(voltarPara, window.location.origin);
      if (destino) {
        window.location.assign(destino);
        return;
      }
      await navigate({ to: "/" });
    } catch {
      setError("Não foi possível entrar. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  // This changes presentation only. Authentication and permissions still come
  // from the existing identity and protected routes, never from this query.
  const internal = acesso === "equipe" || acesso === "admin";
  const product = sap ? "sap" : "nexo";
  const name = sap ? "SAP" : "Nexo";
  return (
    <div className="nx-login">
      <a className="nx-skip" href="#login-main">Ir para o login</a>
      <aside className="nx-login-aside">
        <ProductBrand product={product} dark />
        <div className="nx-login-copy">
          <p className="nx-kicker">{acesso === "admin" ? "Administração Doctor Creator" : internal ? "Equipe Doctor Creator" : sap ? "Sistema de Aquisição de Pacientes" : "Agentes de IA para marketing e vendas"}</p>
          <h1>{acesso === "admin" ? <>Uma visão completa.<br /><em>Acesso com responsabilidade.</em></> : internal ? <>Contexto para analisar.<br /><em>Clareza para entregar.</em></> : sap ? <>Sua jornada de aquisição,<br /><em>etapa por etapa.</em></> : <>Marketing e vendas,<br /><em>com inteligência em ação.</em></>}</h1>
          <p>{internal ? "Acesse seu ambiente de trabalho e acompanhe as análises, entregas e responsabilidades da sua operação." : sap ? "Da atração ao follow-up: acompanhe suas tarefas, as sessões e as entregas do programa de 90 dias." : "Acompanhe os dados da sua clínica, o conhecimento preparado pelos agentes e as prioridades de marketing e vendas."}</p>
          <div className="nx-login-context"><ShieldCheck size={17} aria-hidden /><p>Seu acesso é individual. As áreas disponíveis seguem as permissões concedidas ao seu usuário.</p></div>
        </div>
        <p className="nx-login-aside-footer">{name} · Doctor Creator</p>
      </aside>
      <main id="login-main" className="nx-login-pane" tabIndex={-1}>
        <Link className="nx-back" to="/conhecer"><ArrowLeft size={14} aria-hidden />Voltar à apresentação</Link>
        <form onSubmit={handleSubmit} className="nx-login-form" aria-labelledby="titulo-login">
          <p className="nx-access-label">{acesso === "admin" ? "Administrativo" : internal ? "Equipe interna" : "Acesso da clínica"} / {name}</p>
          <h2 id="titulo-login">Bem-vindo de volta.</h2>
          <p className="nx-login-intro">{internal ? "Acesse seu ambiente de trabalho." : "Entre no ambiente da sua clínica."}</p>
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
          <label htmlFor="senha">Senha</label>
          <div className="nx-password"><input id="senha" type={ver ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} /><button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? "Esconder senha" : "Mostrar senha"}>{ver ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}</button></div>
          {error && <p role="alert" className="nx-form-error">{error}</p>}
          <button type="submit" disabled={loading || resetLoading} className="nx-button nx-button--primary nx-login-submit">{loading ? "Entrando…" : `Entrar no ${name}`}<ArrowRight size={16} aria-hidden /></button>
          <button type="button" disabled={loading || resetLoading} onClick={handleForgotPassword} className="nx-forgot">{resetLoading ? "Solicitando link…" : "Esqueci minha senha"}</button>
          {resetSent && <p role="status" className="nx-form-status">Link enviado. Confira seu e-mail para recuperar o acesso.</p>}
          <p className="nx-login-help">Ainda não tem acesso? Solicite um convite ao responsável pela sua clínica ou à equipe Doctor Creator.</p>
        </form>
        <p className="nx-login-footer">{name} · Acesso individual</p>
      </main>
    </div>
  );
}

export function Marca({ claro = false }: { claro?: boolean }) {
  return <ProductBrand dark={claro} />;
}
