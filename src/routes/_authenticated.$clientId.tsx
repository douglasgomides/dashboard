import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/client-data";

export const Route = createFileRoute("/_authenticated/$clientId")({
  component: ClientLayout,
});

const CFM_DOT: Record<string, string> = {
  verde: "var(--good)",
  amarelo: "var(--warn)",
  vermelho: "var(--danger)",
};

function ClientLayout() {
  const { clientId } = Route.useParams();
  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient(clientId),
  });

  const tabs: { to: string; label: string; exact: boolean }[] = [
    { to: "/$clientId", label: "Visão geral do mês", exact: true },
    { to: "/$clientId/posts", label: "Ranking & próximos ângulos", exact: false },
    { to: "/$clientId/consultas", label: "O que virou paciente", exact: false },
    { to: "/$clientId/vendas", label: "O que virou venda", exact: false },
    { to: "/$clientId/automacoes", label: "Automações", exact: false },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{client?.name ?? "Carregando…"}</h1>
            {client?.cfm_score_status && (
              <span
                title={`Selo CFM: ${client.cfm_score_status}`}
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: CFM_DOT[client.cfm_score_status] }}
              />
            )}
          </div>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            {client?.specialty}
            {client?.instagram_handle ? ` · @${client.instagram_handle}` : ""}
          </p>
        </div>
      </header>

      <nav className="mb-8 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ clientId }}
            activeOptions={{ exact: tab.exact }}
            className="px-3 py-2 text-sm font-medium"
            activeProps={{ style: { color: "var(--accent)", borderBottom: "2px solid var(--accent)" } }}
            inactiveProps={{ style: { color: "var(--text-dim)" } }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
