import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FERRAMENTAS_MCP } from "@/lib/mcp";

// Tela de consentimento do OAuth 2.1 (Supabase Auth). Um assistente de IA (Claude, ChatGPT...) pede acesso ao
// Doctor Creator MCP; o Supabase manda a pessoa para cá com ?authorization_id=. Quem não está logado passa pelo
// login (_authenticated) e volta. Aprovar dá ao assistente só leitura, com as mesmas permissões que a pessoa já tem.
export const Route = createFileRoute("/_authenticated/oauth/consent")({
  validateSearch: (s: Record<string, unknown>) => ({ authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "" }),
  component: Consentimento,
});

type Detalhes = { authorization_id: string; redirect_uri: string; client: { id: string; name: string; uri: string; logo_uri: string }; user: { id: string; email: string }; scope: string };

function Consentimento() {
  const { authorization_id } = Route.useSearch();
  const [enviando, setEnviando] = useState<null | "aprovar" | "negar">(null);
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["oauth-consent", authorization_id],
    enabled: !!authorization_id,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.auth as any).oauth.getAuthorizationDetails(authorization_id);
      if (error) throw new Error(error.message);
      if (data && "redirect_url" in data && !("authorization_id" in data)) {
        window.location.href = data.redirect_url; // já aprovado antes: volta direto para o assistente
        return null;
      }
      return data as Detalhes;
    },
  });
  async function decidir(aprovar: boolean) {
    setEnviando(aprovar ? "aprovar" : "negar");
    setErro(null);
    const oauth = (supabase.auth as any).oauth;
    const { data, error } = aprovar ? await oauth.approveAuthorization(authorization_id) : await oauth.denyAuthorization(authorization_id);
    if (error) { setErro(error.message); setEnviando(null); return; }
    window.location.href = data.redirect_url;
  }
  const caixa = { borderColor: "var(--border)", background: "var(--surface)" };
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-xl font-semibold">Conectar assistente de IA</h1>
      {!authorization_id && <p className="mt-3 text-sm">Link de autorização incompleto. Volte ao assistente e comece a conexão de novo.</p>}
      {q.isLoading && <p className="mt-3 text-sm">Carregando o pedido de acesso…</p>}
      {q.error && <p className="mt-3 text-sm" style={{ color: "var(--crit)" }}>Não consegui ler o pedido: {(q.error as Error).message}. O link pode ter expirado (vale 10 minutos).</p>}
      {q.data && (
        <div className="mt-4 rounded-xl border p-4 text-sm" style={caixa}>
          <p><b>{q.data.client.name || "Um assistente de IA"}</b> quer consultar o Doctor Creator Hub como <b>{q.data.user.email}</b>.</p>
          {q.data.client.uri && <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>Site do aplicativo: {q.data.client.uri}</p>}
          <p className="mt-3 font-medium">O que ele vai poder fazer</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Só ler. Nada é criado, alterado, publicado ou enviado.</li>
            <li>Só as clínicas que você já vê no Hub, com as mesmas permissões.</li>
            <li>Só números agregados: nenhum nome, telefone ou conversa de paciente.</li>
          </ul>
          <p className="mt-3 font-medium">Consultas disponíveis</p>
          <ul className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--ink-2)" }}>
            {FERRAMENTAS_MCP.map((f) => <li key={f.name}><b>{f.title}:</b> {f.description}</li>)}
          </ul>
          {q.data.scope && <p className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>Escopos pedidos: {q.data.scope}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={!!enviando} onClick={() => decidir(true)} className="min-h-[38px] rounded-lg px-4 font-medium disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>{enviando === "aprovar" ? "Autorizando…" : "Autorizar"}</button>
            <button type="button" disabled={!!enviando} onClick={() => decidir(false)} className="min-h-[38px] rounded-lg border px-4 disabled:opacity-50" style={{ borderColor: "var(--border)" }}>{enviando === "negar" ? "Negando…" : "Negar"}</button>
          </div>
          {erro && <p className="mt-2 text-xs" style={{ color: "var(--crit)" }}>{erro}</p>}
          <p className="mt-3 text-xs" style={{ color: "var(--text-dim)" }}>Você pode revogar este acesso a qualquer momento em <Link to="/assistentes-ia" className="underline">Assistentes de IA</Link>.</p>
        </div>
      )}
    </div>
  );
}
