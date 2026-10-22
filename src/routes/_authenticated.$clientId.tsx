import { configCrm } from "@/lib/crm-operacao-data";
import { getClinicaSap } from "@/lib/sap-data";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createFileRoute,
  useNavigate,
  useRouterState,
  Outlet,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getClient, getClientFontes } from "@/lib/client-data";
import { supabase } from "@/integrations/supabase/client";
import { listAllClients } from "@/lib/admin-data";
import { useAuth } from "@/hooks/use-auth";
import { AppShell, BottomSheet } from "@/components/app-shell";
import {
  SyncFreshnessBadge,
  DisponibilidadeFontes,
} from "@/components/sync-freshness-badge";
import { useClientRole } from "@/hooks/use-client-role";
import {
  CLIENTES_SO_CRM,
  CLIENTES_SEM_AUDIENCIA,
  ROTAS_DO_CRM,
} from "@/lib/nav";
import { parseDateRangeSearch, resolveDateRange } from "@/lib/date-range";
import { CoberturaPeriodo } from "@/components/cobertura-periodo";

export const Route = createFileRoute("/_authenticated/$clientId")({
  component: ClientLayout,
  validateSearch: parseDateRangeSearch,
});

// Configuração da navegação em nav.ts; permissões e dados continuam nesta rota.
function ClientLayout() {
  const { clientId } = Route.useParams();
  const dateRange = parseDateRangeSearch(Route.useSearch());
  const currentSearch = useRouterState({ select: (s) => s.location.search }) as unknown as Record<string, unknown>;
  const navigate = useNavigate();
  const currentPathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const { isAdmin } = useAuth();
  const { papel } = useClientRole(clientId);

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient(clientId),
  });
  const { data: fontes } = useQuery({
    queryKey: ["client-fontes", clientId],
    queryFn: () => getClientFontes(clientId),
  });
  // Sistema de Aquisição ativo (linha em sap_clinicas): acende a área do SAP para o cliente.
  const { data: clinicaSap } = useQuery({
    queryKey: ["sap-cadastro", clientId],
    queryFn: () => getClinicaSap(clientId),
  });

  const operacao = useQuery({ queryKey: ["crm-operacao-config", clientId], queryFn: () => configCrm(clientId), retry: false, staleTime: 60_000 });
  const soCrm = CLIENTES_SO_CRM.has(clientId);
  const semAudiencia = CLIENTES_SEM_AUDIENCIA.has(clientId);
  useEffect(() => {
    if (semAudiencia && currentPathname.endsWith("/audiencia")) {
      navigate({
        to: "/$clientId",
        params: { clientId },
        search: dateRange,
        replace: true,
      });
    }
  }, [semAudiencia, currentPathname, clientId, navigate, dateRange]);
  useEffect(() => {
    if (!soCrm) return;
    const dentroDoCrm = ROTAS_DO_CRM.some((r) => currentPathname.endsWith(r));
    if (!dentroDoCrm) {
      navigate({
        to: "/$clientId/crm-painel",
        params: { clientId },
        search: dateRange,
        replace: true,
      });
    }
  }, [soCrm, currentPathname, clientId, navigate, dateRange]);

  // Primeiro dia com dado de cada fonte: a tela só oferece período que tem dado.
  const { data: cobertura } = useQuery({
    queryKey: ["cobertura-geral", clientId],
    queryFn: async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data } = await (supabase as any).rpc("cobertura_periodo", {
        p_client: clientId,
        p_de: hoje,
        p_ate: hoje,
      });
      return (
        ((data ?? []) as { fonte: string; primeiro_geral: string | null }[]) ??
        []
      );
    },
    staleTime: 30 * 60_000,
    retry: false,
  });
  const primeiro = (f: string) =>
    cobertura?.find((c) => c.fonte === f)?.primeiro_geral ?? null;
  const fonteDaTela = /\/anuncios/.test(currentPathname)
    ? ["anuncios"]
    : /\/(crm|vendas|consultas|jornada|analisar)/.test(currentPathname)
      ? ["crm"]
      : /\/(atendimento|conversas)/.test(currentPathname)
        ? ["whatsapp"]
        : /\/(relatorio|oportunidades)/.test(currentPathname)
          ? []
          : ["instagram"];
  const inicioDados =
    fonteDaTela.map(primeiro).filter(Boolean).sort()[0] ?? null;

  const [pal, setPal] = useState(false);

  return (
    <>
      <AppShell
        clientId={clientId}
        client={client ?? undefined}
        pathname={currentPathname}
        dateRange={dateRange}
        currentSearch={currentSearch}
        onDateRange={(next) =>
          navigate({ to: currentPathname, search: (prev: Record<string, unknown>) => ({ ...prev, ...next, from: next.from, to: next.to }) as never, replace: true })
        }
        vis={{ isAdmin, fontes, soCrm, semAudiencia, papel, sap: !!clinicaSap, crmOperacional: operacao.data?.ativo === true }}
        frescor={<SyncFreshnessBadge clientId={clientId} />}
        frescorCompacto={<SyncFreshnessBadge clientId={clientId} compacto />}
        fontesLinha={
          <DisponibilidadeFontes clientId={clientId} fontes={fontes} />
        }
        onBuscarCliente={isAdmin ? () => setPal(true) : undefined}
        inicioDados={inicioDados}
      >
        <CoberturaPeriodo
          clientId={clientId}
          {...resolveDateRange(dateRange)}
          onUsarPeriodo={(from, to) =>
            navigate({
              to: currentPathname,
              search: (prev: Record<string, unknown>) => ({ ...prev, preset: "personalizado", from, to }) as never,
              replace: true,
            })
          }
        />
        <Outlet />
      </AppShell>
      {isAdmin && pal && (
        <ClientPalette clientId={clientId} onClose={() => setPal(false)} />
      )}
    </>
  );
}

function ClientPalette({
  clientId,
  onClose,
}: {
  clientId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: clients } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: listAllClients,
  });

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
          (c.instagram_handle ?? "").toLowerCase().includes(term),
      )
      .slice(0, 40);
  }, [q, clients]);

  function go(id: string) {
    onClose();
    navigate({
      to: "/$clientId",
      params: { clientId: id },
      search: { preset: "30d" },
    });
  }

  return (
    <BottomSheet aberto onFechar={onClose} titulo="Trocar de clínica">
      <div className="workspace-clinic-search">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar clínica"
          data-dialog-focus
          className="workspace-search"
          autoFocus
          placeholder="Nome, especialidade ou @…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered[0]) go(filtered[0].id);
          }}
        />
        <ul>
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === clientId ? "sel" : ""}
                onClick={() => go(c.id)}
              >
                <span>{c.name}</span>
                <small>{c.specialty ?? c.instagram_handle ?? ""}</small>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li>
              <button type="button" disabled>
                <span style={{ color: "var(--muted)" }}>
                  Nenhum cliente encontrado.
                </span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </BottomSheet>
  );
}
