import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, useRouterState, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getClient, getClientFontes } from "@/lib/client-data";
import { listAllClients } from "@/lib/admin-data";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";
import { SyncFreshnessBadge, DisponibilidadeFontes } from "@/components/sync-freshness-badge";
import { useClientRole } from "@/hooks/use-client-role";
import { CLIENTES_SO_CRM, ROTAS_DO_CRM } from "@/lib/nav";
import type { DateRangeState, RangePreset } from "@/lib/date-range";

export const Route = createFileRoute("/_authenticated/$clientId")({
  component: ClientLayout,
  validateSearch: (search: Record<string, unknown>): DateRangeState => ({
    preset: (search.preset as RangePreset) ?? "90d",
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
  }),
});

// Navegação: 5 categorias (Início, Social, Comercial, Oportunidades, Relatórios)
// com abas dentro, mais "Operação" para a equipe. A configuração (rótulos, abas, quem vê
// o quê) fica em src/lib/nav.ts; a casca visual em src/components/app-shell.tsx.
function ClientLayout() {
  const { clientId } = Route.useParams();
  const dateRange = Route.useSearch();
  const navigate = useNavigate();
  const currentPathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useAuth();
  const { papel } = useClientRole(clientId);

  const { data: client } = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId) });
  const { data: fontes } = useQuery({ queryKey: ["client-fontes", clientId], queryFn: () => getClientFontes(clientId) });

  const soCrm = CLIENTES_SO_CRM.has(clientId);
  useEffect(() => {
    if (!soCrm) return;
    const dentroDoCrm = ROTAS_DO_CRM.some((r) => currentPathname.endsWith(r));
    if (!dentroDoCrm) {
      navigate({ to: "/$clientId/crm-painel", params: { clientId }, search: dateRange, replace: true });
    }
  }, [soCrm, currentPathname, clientId, navigate, dateRange]);

  const [pal, setPal] = useState(false);

  // Ctrl/Cmd+K abre a busca de cliente (admin). Esc fecha a paleta.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && isAdmin) {
        e.preventDefault();
        setPal((v) => !v);
      }
      if (e.key === "Escape") setPal(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isAdmin]);

  return (
    <>
      <AppShell
        clientId={clientId}
        client={client ?? undefined}
        pathname={currentPathname}
        dateRange={dateRange}
        onDateRange={(next) => navigate({ to: currentPathname, search: next, replace: true })}
        vis={{ isAdmin, fontes, soCrm, papel }}
        frescor={<SyncFreshnessBadge clientId={clientId} />}
        frescorCompacto={<SyncFreshnessBadge clientId={clientId} compacto />}
        fontesLinha={<DisponibilidadeFontes clientId={clientId} fontes={fontes} />}
        onBuscarCliente={isAdmin ? () => setPal(true) : undefined}
      >
        <Outlet />
      </AppShell>
      {isAdmin && pal && <ClientPalette clientId={clientId} onClose={() => setPal(false)} />}
    </>
  );
}

function ClientPalette({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: clients } = useQuery({ queryKey: ["admin-clients"], queryFn: listAllClients });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = clients ?? [];
    if (!term) return list.slice(0, 40);
    return list
      .filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.specialty ?? "").toLowerCase().includes(term) ||
          (c.instagram_handle ?? "").toLowerCase().includes(term)
      )
      .slice(0, 40);
  }, [q, clients]);

  function go(id: string) {
    onClose();
    navigate({ to: "/$clientId", params: { clientId: id }, search: { preset: "90d" } });
  }

  return (
    <div className="pal on" onClick={onClose}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente por nome, especialidade ou @…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered[0]) go(filtered[0].id);
          }}
        />
        <ul>
          {filtered.map((c) => (
            <li key={c.id}>
              <button type="button" className={c.id === clientId ? "sel" : ""} onClick={() => go(c.id)}>
                <span>{c.name}</span>
                <small>{c.specialty ?? c.instagram_handle ?? ""}</small>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li>
              <button type="button" disabled>
                <span style={{ color: "var(--muted)" }}>Nenhum cliente encontrado.</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
