import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FERRAMENTAS_MCP, URL_DESCOBERTA_OAUTH, URL_MCP } from "@/lib/mcp";

// Integrações → Assistentes de IA → Doctor Creator MCP: status, como conectar (Claude, ChatGPT), acessos concedidos
// com revogação (OAuth grants do Supabase Auth) e histórico de consultas (mcp_chamadas). Só leitura no MVP.
export const Route = createFileRoute("/_authenticated/assistentes-ia")({ component: AssistentesIa });

type Grant = { client: { id: string; name: string; uri: string }; scopes: string[]; granted_at: string };
type Chamada = { id: number; ferramenta: string; ok: boolean; erro: string | null; ms: number | null; em: string; oauth_client_id: string | null };

function AssistentesIa() {
  const qc = useQueryClient();
  const [copiado, setCopiado] = useState(false);
  const status = useQuery({
    queryKey: ["oauth-servidor-status"],
    retry: false,
    queryFn: async () => {
      const r = await fetch(URL_DESCOBERTA_OAUTH);
      return r.ok;
    },
  });
  const grants = useQuery({
    queryKey: ["oauth-grants"],
    enabled: status.data === true,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.auth as any).oauth.listGrants();
      if (error) throw new Error(error.message);
      return (data ?? []) as Grant[];
    },
  });
  const historico = useQuery({
    queryKey: ["mcp-chamadas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mcp_chamadas").select("id, ferramenta, ok, erro, ms, em, oauth_client_id").order("em", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as Chamada[];
    },
  });
  const revogar = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await (supabase.auth as any).oauth.revokeGrant({ clientId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oauth-grants"] }),
  });
  const caixa = { borderColor: "var(--border)", background: "var(--surface)" };
  const dim = { color: "var(--text-dim)" };
  const nomeCliente = (id: string | null) => grants.data?.find((g) => g.client.id === id)?.client.name ?? "assistente";
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Assistentes de IA · Doctor Creator MCP</h1>
        <p className="mt-1 text-sm" style={dim}>Conecte o Claude, o ChatGPT ou outro assistente compatível com MCP para perguntar sobre as suas clínicas em linguagem natural. Só leitura, com as mesmas permissões que você tem no Hub e sem dados de pacientes.</p>
      </div>

      <section className="rounded-xl border p-4 text-sm" style={caixa}>
        <h2 className="font-semibold">Status</h2>
        {status.isLoading ? <p className="mt-1">Verificando…</p> : status.data ? (
          <p className="mt-1" style={{ color: "var(--good, #1a7f37)" }}>Pronto para conectar: o login OAuth do Doctor Creator está ligado.</p>
        ) : (
          <p className="mt-1" style={{ color: "var(--warn, #9a6700)" }}>Ainda não disponível: o login OAuth precisa ser ligado pela equipe técnica (Supabase → Authentication → OAuth Server). Até lá, nenhum assistente consegue se conectar.</p>
        )}
        <p className="mt-3 font-medium">Endereço do servidor</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="rounded px-2 py-1 text-xs" style={{ background: "var(--bg)" }}>{URL_MCP}</code>
          <button type="button" className="text-xs underline" onClick={() => { void navigator.clipboard?.writeText(URL_MCP); setCopiado(true); }}>{copiado ? "Copiado" : "Copiar"}</button>
        </div>
      </section>

      <section className="rounded-xl border p-4 text-sm" style={caixa}>
        <h2 className="font-semibold">Como conectar</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li><b>Claude</b> (claude.ai ou app): Configurações → Conectores → Adicionar conector personalizado → cole o endereço acima → Conectar. Você será levado ao login do Hub para autorizar.</li>
          <li><b>ChatGPT</b> (planos com conectores): Configurações → Conectores → Criar → cole o endereço acima, autenticação OAuth → Conectar e autorizar no Hub.</li>
          <li><b>Claude Code / outros clientes MCP</b>: adicione um servidor MCP remoto (HTTP) com o endereço acima; o cliente abre o login do Hub na primeira vez.</li>
        </ul>
        <p className="mt-2 text-xs" style={dim}>Os passos de cada assistente podem mudar com o tempo; o que não muda é o endereço e a autorização pelo Hub.</p>
      </section>

      <section className="rounded-xl border p-4 text-sm" style={caixa}>
        <h2 className="font-semibold">O que pode ser consultado</h2>
        <ul className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--ink-2)" }}>
          {FERRAMENTAS_MCP.map((f) => <li key={f.name}><b>{f.title}:</b> {f.description}</li>)}
        </ul>
      </section>

      <section className="rounded-xl border p-4 text-sm" style={caixa}>
        <h2 className="font-semibold">Acessos concedidos</h2>
        {status.data !== true ? <p className="mt-1" style={dim}>Aparecem aqui depois que o login OAuth for ligado e você autorizar um assistente.</p> :
          grants.isLoading ? <p className="mt-1">Carregando…</p> :
          grants.error ? <p className="mt-1" style={{ color: "var(--crit)" }}>{(grants.error as Error).message}</p> :
          !grants.data?.length ? <p className="mt-1" style={dim}>Nenhum assistente autorizado.</p> : (
            <ul className="mt-1 space-y-1.5">
              {grants.data.map((g) => (
                <li key={g.client.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{g.client.name || g.client.id}</b> <span className="text-xs" style={dim}>desde {new Date(g.granted_at).toLocaleDateString("pt-BR")}{g.scopes?.length ? ` · ${g.scopes.join(", ")}` : ""}</span></span>
                  <button type="button" disabled={revogar.isPending} className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: "var(--border)" }} onClick={() => { if (confirm(`Revogar o acesso de ${g.client.name || "este assistente"}? Ele para de consultar o Hub na hora.`)) revogar.mutate(g.client.id); }}>Revogar</button>
                </li>
              ))}
            </ul>
          )}
        {revogar.isError && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{(revogar.error as Error).message}</p>}
      </section>

      <section className="rounded-xl border p-4 text-sm" style={caixa}>
        <h2 className="font-semibold">Histórico de consultas</h2>
        {historico.isLoading ? <p className="mt-1">Carregando…</p> : !historico.data?.length ? <p className="mt-1" style={dim}>Nenhuma consulta feita por assistente ainda.</p> : (
          <table className="mt-1 w-full text-xs">
            <tbody>
              {historico.data.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1">{new Date(c.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-1">{nomeCliente(c.oauth_client_id)}</td>
                  <td className="py-1">{FERRAMENTAS_MCP.find((f) => f.name === c.ferramenta)?.title ?? c.ferramenta}</td>
                  <td className="py-1 text-right" style={{ color: c.ok ? undefined : "var(--crit)" }}>{c.ok ? "ok" : `erro: ${c.erro ?? ""}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
