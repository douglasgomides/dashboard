import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, KeyRound, ClipboardCheck, Flag, ListOrdered, Gauge, LayoutDashboard, ListChecks, Network, Target, ArrowLeftRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LogoutButton } from "@/components/logout-button";
import { getClient } from "@/lib/client-data";
import { diaAtual, faseDoDia, getClinicaSap } from "@/lib/sap-data";

// Sistema de Aquisição de Pacientes: produto separado do Doctor Creator Hub, com menu, entrada (sap.*) e
// página inicial próprios. Usa o mesmo login e os mesmos dados (CRM, WhatsApp, Meta) que o Hub já lê;
// as regras de acesso são as mesmas (RLS por cliente).
export const Route = createFileRoute("/_authenticated/sap")({
  component: SapLayout,
});

const ITENS = [
  { sub: "/passo-a-passo", label: "Passo a passo", Icone: ListOrdered },
  { sub: "", label: "Programa", Icone: Flag },
  { sub: "/cronograma", label: "Cronograma e prazos", Icone: CalendarClock },
  { sub: "/onboarding", label: "Ficha e acessos", Icone: KeyRound },
  { sub: "/metas", label: "Metas e garantia", Icone: Target },
  { sub: "/leitura", label: "Leitura da semana", Icone: ClipboardCheck },
  { sub: "/execucao", label: "Execução e saúde", Icone: ListChecks },
  { sub: "/midia", label: "Mídia", Icone: Gauge },
  { sub: "/etapas", label: "Etapas no funil (equipe)", Icone: Network, admin: true },
] as const;

function SapLayout() {
  const { isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname }).replace(/\/+$/, "") || "/sap";
  const clientId = /^\/sap\/([0-9a-f-]{36})/.exec(pathname)?.[1] ?? null;
  const sub = clientId ? pathname.slice(`/sap/${clientId}`.length) : null;
  const { data: cliente } = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId!), enabled: !!clientId });
  const { data: clinica } = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId!), enabled: !!clientId });
  const dia = diaAtual(clinica?.d0 ?? null, clinica?.pausas);
  const itens = ITENS.filter((i) => !("admin" in i) || isAdmin);
  const titulo = clientId ? (cliente?.name ?? "Carregando…") : isAdmin ? "Todas as clínicas" : "Sistema de Aquisição";

  const links = (parte: "todas" | "clinica") => (
    <>
      {parte === "todas" && isAdmin && (
        <Link to="/sap" activeOptions={{ exact: true }} activeProps={{ "aria-current": "page" }} >
          <LayoutDashboard aria-hidden size={18} />
          <span>Todas as clínicas</span>
        </Link>
      )}
      {parte === "clinica" &&
        clientId &&
        itens.map((it) => (
          <Link
            key={it.sub}
            to={`/sap/$clientId${it.sub}` as never}
            params={{ clientId } as never}
            activeOptions={{ exact: true }}
            data-on={sub === it.sub ? "" : undefined}
            aria-current={sub === it.sub ? "page" : undefined}
          >
            <it.Icone aria-hidden size={18} />
            <span>{it.label}</span>
          </Link>
        ))}
    </>
  );

  return (
    <div className="app">
      <aside aria-label="Menu do Sistema de Aquisição">
        <div className="brand">
          <span className="logo" style={{ background: "#C49A5C" }}>
            <i />
          </span>
          <span className="so-aberta">Sistema de Aquisição</span>
        </div>
        <nav className="side">
          {links("todas")}
          {clientId && <div className="lbl">{cliente?.name ?? "Clínica"}</div>}
          {links("clinica")}
        </nav>
        <div className="side-foot so-aberta">
          {/* Troca de produto (não é item de menu): leva ao painel do Hub. */}
          <Link to={clientId ? "/$clientId" : isAdmin ? "/admin" : "/"} params={(clientId ? { clientId } : undefined) as never} className="inline-flex items-center gap-1.5 text-sm">
            <ArrowLeftRight size={14} aria-hidden /> Ir para o Doctor Creator Hub
          </Link>
          <LogoutButton className="text-sm text-left min-h-[36px]" />
          <span>Sistema de Aquisição de Pacientes · Doctor Creator</span>
        </div>
      </aside>
      <div className="mainwrap">
        <div className="top admin-top">
          <div className="who">
            <div style={{ minWidth: 0 }}>
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "#C49A5C" }}>
                Sistema de Aquisição de Pacientes
                {clientId && clinica?.d0 && dia !== null ? ` · ${dia > 90 ? "acompanhamento" : dia < 0 ? `começa em ${-dia} dia(s)` : `D${dia} de 90 · ${faseDoDia(dia)}`}` : ""}
              </span>
              <h1>{titulo}</h1>
            </div>
          </div>
        </div>
        {/* Celular: os mesmos atalhos numa linha que rola de lado. */}
        <nav className="admin-mnav" aria-label="Menu do Sistema de Aquisição">
          {isAdmin && (
            <Link to="/sap" activeOptions={{ exact: true }} activeProps={{ "aria-current": "page" }}>
              Todas as clínicas
            </Link>
          )}
          {clientId &&
            itens.map((it) => (
              <Link key={it.sub} to={`/sap/$clientId${it.sub}` as never} params={{ clientId } as never} activeOptions={{ exact: true }} aria-current={sub === it.sub ? "page" : undefined}>
                {it.label}
              </Link>
            ))}
          <LogoutButton className="text-sm" />
        </nav>
        <div className="mt-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
