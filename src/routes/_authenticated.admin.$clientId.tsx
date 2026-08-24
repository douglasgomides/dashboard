import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/client-data";
import {
  connectInstagramAccount,
  createClientUser,
  createCrmConnection,
  listClientMembers,
  listCrmConnections,
  listInstagramAccounts,
  removeClientMember,
  removeCrmConnection,
  sendPasswordReset,
  type CreateClientUserInput,
} from "@/lib/admin-data";
import type { CrmProvider } from "@/integrations/supabase/types";

const CRM_PROVIDER_LABELS: Record<CrmProvider, string> = {
  kommo: "Kommo",
  feegow: "Feegow",
  ninsaude: "Ninsaúde",
};

export const Route = createFileRoute("/_authenticated/admin/$clientId")({
  component: AdminClientDetailPage,
});

function ConnectInstagramForm({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [windsorAccountId, setWindsorAccountId] = useState("");
  const [igUsername, setIgUsername] = useState("");

  const mutation = useMutation({
    mutationFn: () => connectInstagramAccount({ client_id: clientId, windsor_account_id: windsorAccountId, ig_username: igUsername || undefined }),
    onSuccess: () => {
      setWindsorAccountId("");
      setIgUsername("");
      queryClient.invalidateQueries({ queryKey: ["admin-ig-accounts", clientId] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!windsorAccountId.trim()) return;
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          ID da conta Instagram
        </label>
        <input
          value={windsorAccountId}
          onChange={(e) => setWindsorAccountId(e.target.value)}
          required
          placeholder="17841400869970479"
          className="mt-1 w-56 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          @Instagram (opcional)
        </label>
        <input
          value={igUsername}
          onChange={(e) => setIgUsername(e.target.value)}
          className="mt-1 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--accent)" }}
      >
        {mutation.isPending ? "Conectando…" : "Conectar conta"}
      </button>
      {mutation.isError && (
        <p className="w-full text-sm" style={{ color: "var(--danger)" }}>
          {(mutation.error as Error).message}
        </p>
      )}
    </form>
  );
}

function ConnectCrmForm({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<CrmProvider>("kommo");
  const [subdomain, setSubdomain] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createCrmConnection({
        client_id: clientId,
        provider,
        subdomain: subdomain || undefined,
        access_token: accessToken || undefined,
      }),
    onSuccess: () => {
      setSubdomain("");
      setAccessToken("");
      queryClient.invalidateQueries({ queryKey: ["admin-crm-connections", clientId] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          CRM
        </label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as CrmProvider)}
          className="mt-1 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          {(Object.entries(CRM_PROVIDER_LABELS) as [CrmProvider, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          Subdomínio
        </label>
        <input
          value={subdomain}
          onChange={(e) => setSubdomain(e.target.value)}
          placeholder="dralanatorres"
          className="mt-1 w-44 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          Token de acesso
        </label>
        <input
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          className="mt-1 w-64 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--accent)" }}
      >
        {mutation.isPending ? "Conectando…" : "Conectar CRM"}
      </button>
      {mutation.isError && (
        <p className="w-full text-sm" style={{ color: "var(--danger)" }}>
          {(mutation.error as Error).message}
        </p>
      )}
    </form>
  );
}

function CrmConnectionsList({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const { data: connections } = useQuery({
    queryKey: ["admin-crm-connections", clientId],
    queryFn: () => listCrmConnections(clientId),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeCrmConnection(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-crm-connections", clientId] }),
  });

  if (!connections?.length) return null;
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {connections.map((c) => (
        <li key={c.id} className="flex items-center gap-2" style={{ color: "var(--text-dim)" }}>
          <span className="font-medium" style={{ color: "var(--text)" }}>
            {CRM_PROVIDER_LABELS[c.provider]}
          </span>
          {c.subdomain ? ` · ${c.subdomain}` : ""}
          {!c.active && " · inativo"}
          <button
            type="button"
            onClick={() => removeMutation.mutate(c.id)}
            className="text-xs"
            style={{ color: "var(--danger)" }}
          >
            Remover
          </button>
        </li>
      ))}
    </ul>
  );
}

function NewUserForm({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CreateClientUserInput["role"]>("owner");
  const [result, setResult] = useState<{ user_id: string; temporary_password: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () => createClientUser({ email, client_id: clientId, role }),
    onSuccess: (data) => {
      setResult(data);
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin-members", clientId] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setResult(null);
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          E-mail
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 w-64 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          Papel
        </label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as CreateClientUserInput["role"])}
          className="mt-1 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          <option value="owner">Owner (o médico)</option>
          <option value="strategist">Strategist</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--accent)" }}
      >
        {mutation.isPending ? "Criando…" : "Criar usuário"}
      </button>
      {mutation.isError && (
        <p className="w-full text-sm" style={{ color: "var(--danger)" }}>
          {(mutation.error as Error).message}
        </p>
      )}
      {result && (
        <div
          className="w-full rounded-lg border p-3 text-sm"
          style={{ background: "var(--good-bg)", borderColor: "var(--good-border)" }}
        >
          Usuário criado. Senha temporária (copie e envie por um canal seguro — não é mostrada de novo):{" "}
          <code className="font-mono font-semibold">{result.temporary_password}</code>
        </div>
      )}
    </form>
  );
}

function MembersList({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const { data: members } = useQuery({
    queryKey: ["admin-members", clientId],
    queryFn: () => listClientMembers(clientId),
  });
  const [resetEmail, setResetEmail] = useState("");

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeClientMember(memberId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-members", clientId] }),
  });

  const resetMutation = useMutation({
    mutationFn: (email: string) => sendPasswordReset(email),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
        <div className="flex-1">
          <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Enviar redefinição de senha (e-mail do usuário)
          </label>
          <input
            type="email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            className="mt-1 w-64 rounded-md border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          />
        </div>
        <button
          type="button"
          disabled={!resetEmail.trim() || resetMutation.isPending}
          onClick={() => resetMutation.mutate(resetEmail)}
          className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          {resetMutation.isPending ? "Enviando…" : "Enviar link"}
        </button>
        {resetMutation.isSuccess && <span style={{ color: "var(--good)" }}>Link enviado.</span>}
        {resetMutation.isError && <span style={{ color: "var(--danger)" }}>{(resetMutation.error as Error).message}</span>}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs" style={{ color: "var(--text-faint)" }}>
            <th className="pb-2">User ID</th>
            <th className="pb-2">Papel</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {(members ?? []).map((m) => (
            <tr key={m.id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-2 font-mono text-xs">{m.user_id}</td>
              <td className="py-2">{m.role}</td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  onClick={() => removeMutation.mutate(m.id)}
                  className="text-xs"
                  style={{ color: "var(--danger)" }}
                >
                  Remover
                </button>
              </td>
            </tr>
          ))}
          {(members ?? []).length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-center" style={{ color: "var(--text-dim)" }}>
                Nenhum usuário vinculado ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function InstagramAccountsList({ clientId }: { clientId: string }) {
  const { data: accounts } = useQuery({
    queryKey: ["admin-ig-accounts", clientId],
    queryFn: () => listInstagramAccounts(clientId),
  });

  if (!accounts?.length) return null;
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {accounts.map((a) => (
        <li key={a.id} style={{ color: "var(--text-dim)" }}>
          <code className="font-mono">{a.windsor_account_id}</code>
          {a.ig_username ? ` · @${a.ig_username}` : ""}
        </li>
      ))}
    </ul>
  );
}

function AdminClientDetailPage() {
  const { clientId } = Route.useParams();
  const { data: client } = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId) });

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin" className="text-sm" style={{ color: "var(--accent)" }}>
          ← Todos os clientes
        </Link>
        <h2 className="mt-2 text-lg font-semibold">{client?.name ?? "Carregando…"}</h2>
        <Link to="/$clientId" params={{ clientId }} className="text-sm" style={{ color: "var(--accent)" }}>
          Ver o painel deste cliente →
        </Link>
      </div>

      <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h3 className="mb-3 text-sm font-semibold">Conta Instagram</h3>
        <ConnectInstagramForm clientId={clientId} />
        <InstagramAccountsList clientId={clientId} />
      </section>

      <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h3 className="mb-3 text-sm font-semibold">CRM</h3>
        <ConnectCrmForm clientId={clientId} />
        <CrmConnectionsList clientId={clientId} />
      </section>

      <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h3 className="mb-3 text-sm font-semibold">Novo usuário para este cliente</h3>
        <NewUserForm clientId={clientId} />
      </section>

      <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h3 className="mb-3 text-sm font-semibold">Usuários vinculados</h3>
        <MembersList clientId={clientId} />
      </section>
    </div>
  );
}
