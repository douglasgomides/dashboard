import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlignLeft, Briefcase, CheckCircle2, FileText, KeyRound, Megaphone, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

// Primeiro acesso de quem recebeu o convite (user_metadata.primeiro_acesso, gravado ao criar o acesso no admin):
// 1) cria a própria senha; 2) tour de como o painel está organizado; 3) o mínimo do CRM para o painel mostrar
// o retorno do investimento. Também serve de tour para rever depois (sem o passo da senha).
export const Route = createFileRoute("/_authenticated/bem-vindo")({
  component: BemVindo,
});

const GRUPOS = [
  { Icone: Activity, nome: "Resumo", texto: "Comece aqui. No topo, o retorno do investimento: quanto foi investido em anúncios e quanto voltou em vendas. Abaixo, o que fazer agora." },
  { Icone: AlignLeft, nome: "Conteúdo", texto: "Como o Instagram está indo: posts, público e ideias de conteúdo e de anúncio prontas para gravar." },
  { Icone: Megaphone, nome: "Anúncios", texto: "Quanto foi investido e o resultado de cada campanha, julgada pelo objetivo dela." },
  { Icone: Briefcase, nome: "Atendimento e vendas", texto: "O funil do CRM, o WhatsApp e as dúvidas dos pacientes: onde as pessoas param antes de virar consulta." },
  { Icone: FileText, nome: "Relatório", texto: "O resumo do período em texto e PDF, para ler com calma ou compartilhar." },
];

const CRM_ESSENCIAL = [
  { nome: "Etapa certa", texto: "Cada contato na etapa que representa onde ele está: novo, em atendimento, agendado, compareceu, fechou ou perdido." },
  { nome: "Valor ao fechar", texto: "Ao marcar como fechado (ganho), preencher o valor. Sem isso, não existe receita no painel." },
  { nome: "Origem do lead", texto: "De onde a pessoa veio (anúncio, Instagram, indicação). É o que separa o retorno dos anúncios." },
];

function BemVindo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const primeiroAcesso = user?.user_metadata?.primeiro_acesso === true;
  const [passo, setPasso] = useState<1 | 2 | 3>(primeiroAcesso ? 1 : 2);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { data: clientes } = useQuery({
    queryKey: ["meus-clientes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("client_members").select("client_id, clients(name)").eq("user_id", user!.id);
      return ((data ?? []) as any[]).map((m) => ({ id: m.client_id as string, nome: (m.clients?.name as string) ?? "" }));
    },
  });
  const cliente = clientes?.[0] ?? null;

  async function salvarSenha(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres.");
    if (senha !== senha2) return setErro("As duas senhas não são iguais.");
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return setErro(error.message);
    setPasso(2);
  }

  async function concluir() {
    setSalvando(true);
    await supabase.auth.updateUser({ data: { primeiro_acesso: false, onboarding_em: new Date().toISOString() } });
    setSalvando(false);
    if (cliente) navigate({ to: "/$clientId", params: { clientId: cliente.id }, search: { preset: "30d" } as never });
    else navigate({ to: "/" });
  }

  const passos = primeiroAcesso ? ["Sua senha", "Como o painel funciona", "O que o CRM precisa ter"] : ["Como o painel funciona", "O que o CRM precisa ter"];
  const atual = primeiroAcesso ? passo - 1 : passo - 2;

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <header>
          <div className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Doctor Creator Hub</div>
          <h1 className="mt-1 text-2xl font-semibold" style={{ color: "var(--ink)" }}>
            {primeiroAcesso ? "Bem-vindo(a) ao seu painel" : "Tour do painel"}
            {cliente?.nome ? `, ${cliente.nome}` : ""}
          </h1>
          <ol className="mt-3 flex flex-wrap gap-2" aria-label="Etapas">
            {passos.map((p, i) => (
              <li key={p} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: i === atual ? "var(--accent)" : "var(--border)", color: i <= atual ? "var(--ink)" : "var(--muted)", background: "var(--surface)" }} aria-current={i === atual ? "step" : undefined}>
                {i < atual ? <CheckCircle2 size={13} aria-hidden style={{ color: "var(--good)" }} /> : <span>{i + 1}.</span>} {p}
              </li>
            ))}
          </ol>
        </header>

        <section className="rounded-xl border p-5" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {passo === 1 && (
            <form onSubmit={salvarSenha} className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound size={18} aria-hidden /> Crie a sua senha</h2>
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>A senha que você recebeu é temporária. Escolha uma só sua (pelo menos 8 caracteres).</p>
              <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Nova senha" aria-label="Nova senha" className="min-h-[44px] w-full rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }} />
              <input type="password" autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} placeholder="Repita a nova senha" aria-label="Repita a nova senha" className="min-h-[44px] w-full rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }} />
              {erro && <p className="text-sm" style={{ color: "var(--crit)" }}>{erro}</p>}
              <button type="submit" disabled={salvando} className="min-h-[44px] rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
                {salvando ? "Salvando…" : "Salvar senha e continuar"}
              </button>
            </form>
          )}

          {passo === 2 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Como o painel está organizado</h2>
              <ul className="space-y-2">
                {GRUPOS.map((g) => (
                  <li key={g.nome} className="flex gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                    <g.Icone size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
                    <div>
                      <div className="font-semibold" style={{ color: "var(--ink)" }}>{g.nome}</div>
                      <div className="text-sm" style={{ color: "var(--ink-2)" }}>{g.texto}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>No alto da tela você escolhe o período (o padrão é os últimos 30 dias). Os ícones "i" explicam de onde vem cada número.</p>
              <button type="button" onClick={() => setPasso(3)} className="min-h-[44px] rounded-lg px-4 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
                Continuar
              </button>
            </div>
          )}

          {passo === 3 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">O que o CRM precisa ter para o painel mostrar o retorno</h2>
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>O painel lê o CRM da clínica. Com estes três cuidados, ele mostra quanto voltou do que foi investido.</p>
              <ul className="space-y-2">
                {CRM_ESSENCIAL.map((c, i) => (
                  <li key={c.nome} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                    <div className="font-semibold" style={{ color: "var(--ink)" }}>{i + 1}. {c.nome}</div>
                    <div className="text-sm" style={{ color: "var(--ink-2)" }}>{c.texto}</div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => (await import("@/lib/pdf-manual-crm")).baixarManualCrm(cliente?.nome)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-4 text-sm font-semibold"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--surface)" }}
                >
                  <Printer size={15} aria-hidden /> Baixar o manual do CRM (PDF) para a equipe
                </button>
                {cliente && (
                  <Link to="/$clientId/crm-guia" params={{ clientId: cliente.id }} className="inline-flex min-h-[44px] items-center rounded-lg border px-4 text-sm font-semibold" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
                    Ver o guia do CRM desta clínica
                  </Link>
                )}
              </div>
              <button type="button" onClick={concluir} disabled={salvando} className="min-h-[44px] rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
                {salvando ? "Abrindo…" : "Ir para o painel"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
