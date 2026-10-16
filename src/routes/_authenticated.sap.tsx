import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarClock, FileText, KeyRound, ClipboardCheck, Flag, Gauge, LayoutDashboard, ListChecks, ListTodo, Megaphone, Menu, Network, Target, ArrowLeftRight, Radar, Presentation, UsersRound, UserRoundCheck, BookOpen, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LogoutButton } from "@/components/logout-button";
import { TrocaProduto } from "@/components/troca-produto";
import { BotaoAjuda, PrimeiroAcesso } from "@/components/sap-ajuda";
import { getClient } from "@/lib/client-data";
import { diaAtual, faseDoDia, getClinicaSap } from "@/lib/sap-data";

// Sistema de Aquisição de Pacientes: produto separado do Doctor Creator Hub, com menu, entrada (sap.*) e
// página inicial próprios. Usa o mesmo login e os mesmos dados (CRM, WhatsApp, Meta) que o Hub já lê;
// as regras de acesso são as mesmas (RLS por cliente).
export const Route = createFileRoute("/_authenticated/sap")({
  component: SapLayout,
});

// Menu da clínica em 5 grupos: Minhas tarefas, Painel da clínica, Implantação, Rotina semanal e Resultado.
// clinica: o que a clínica vê (menu enxuto). O resto é ferramenta da equipe. Rotas antigas (/semana, /passo-a-passo)
// redirecionam para Minhas tarefas.
const ITENS = [
  { grupo: "", sub: "", label: "Minhas tarefas", Icone: ListTodo, clinica: true },
  { grupo: "", sub: "/painel", label: "Painel da clínica", Icone: Flag, clinica: true },
  { grupo: "Implantação", sub: "/cronograma", label: "Cronograma", Icone: CalendarClock, clinica: true },
  { grupo: "Implantação", sub: "/sessao", label: "Reuniões", Icone: Presentation, admin: true },
  { grupo: "Implantação", sub: "/onboarding", label: "Ficha e acessos", Icone: KeyRound },
  { grupo: "Implantação", sub: "/rastreamento", label: "Rastreamento", Icone: Radar },
  { grupo: "Implantação", sub: "/anuncios", label: "Banco de anúncios", Icone: Megaphone, admin: true },
  { grupo: "Implantação", sub: "/etapas", label: "Etapas do funil", Icone: Network, admin: true },
  { grupo: "Implantação", sub: "/papeis", label: "Quem é quem", Icone: UserRoundCheck },
  { grupo: "Rotina semanal", sub: "/leitura", label: "Leitura da semana", Icone: ClipboardCheck, clinica: true },
  { grupo: "Rotina semanal", sub: "/execucao", label: "Execução e saúde", Icone: ListChecks },
  { grupo: "Rotina semanal", sub: "/midia", label: "Mídia", Icone: Gauge },
  { grupo: "Resultado", sub: "/metas", label: "Metas e garantia", Icone: Target, clinica: true },
  { grupo: "Resultado", sub: "/documentos", label: "Plano e relatório D90", Icone: FileText, clinica: true },
] as const;
// Na visão da clínica, os grupos viram um só e alguns nomes ficam mais diretos.
const ROTULO_CLINICA: Record<string, string> = { "/cronograma": "Agenda do programa", "/leitura": "Números da semana", "/documentos": "Plano e relatório" };
const TITULOS: Record<string, string> = { "/sap/guia": "Como operamos", "/sap/docs": "Documentos do SAP", "/sap/comece": "Comece aqui" };

function SapLayout() {
  const { isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname }).replace(/\/+$/, "") || "/sap";
  const clientId = /^\/sap\/([0-9a-f-]{36})/.exec(pathname)?.[1] ?? null;
  const sub = clientId ? pathname.slice(`/sap/${clientId}`.length) : null;
  const { data: cliente } = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId!), enabled: !!clientId });
  const { data: clinica } = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId!), enabled: !!clientId });
  const dia = diaAtual(clinica?.d0 ?? null, clinica?.pausas);
  const itens = (isAdmin ? ITENS.filter(() => true) : ITENS.filter((i) => "clinica" in i))
    .map((i) => ({ ...i, grupo: isAdmin ? i.grupo : "", label: isAdmin ? i.label : (ROTULO_CLINICA[i.sub] ?? i.label) }));
  const titulo = TITULOS[pathname] ?? (clientId ? (cliente?.name ?? "Carregando…") : isAdmin ? "Todas as clínicas" : "Sistema de Aquisição");
  const [gaveta, setGaveta] = useState(false);
  useEffect(() => { setGaveta(false); }, [pathname]);

  const links = (parte: "todas" | "clinica") => (
    <>
      {parte === "todas" && isAdmin && (
        <Link to="/sap" activeOptions={{ exact: true }} activeProps={{ "aria-current": "page" }} >
          <LayoutDashboard aria-hidden size={18} />
          <span>Todas as clínicas</span>
        </Link>
      )}
      {parte === "todas" && isAdmin && (
        <Link to="/sap/guia" activeOptions={{ exact: true }} activeProps={{ "aria-current": "page" }}>
          <UsersRound aria-hidden size={18} />
          <span>Como operamos</span>
        </Link>
      )}
      {parte === "todas" && (
        <Link to="/sap/docs" activeOptions={{ exact: true }} activeProps={{ "aria-current": "page" }}>
          <BookOpen aria-hidden size={18} />
          <span>Documentos do SAP</span>
        </Link>
      )}
      {parte === "clinica" &&
        clientId &&
        itens.map((it, i) => [
          it.grupo && (i === 0 || itens[i - 1].grupo !== it.grupo) ? <div key={`g-${it.grupo}`} className="lbl" style={{ fontSize: 10, opacity: 0.8 }}>{it.grupo}</div> : null,
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
          </Link>,
        ])}
    </>
  );

  return (
    <div className="app">
      {gaveta && <div className="sap-fundo-gaveta" aria-hidden onClick={() => setGaveta(false)} />}
      <aside aria-label="Menu do Sistema de Aquisição" className={gaveta ? "gaveta" : undefined}>
        {gaveta && (
          <button type="button" aria-label="Fechar o menu" onClick={() => setGaveta(false)} className="sap-fechar-gaveta self-end rounded-md p-1"><X size={20} /></button>
        )}
        <div className="brand">
          <span className="logo" style={{ background: "#C49A5C" }}>
            <i />
          </span>
          <span className="so-aberta">Sistema de Aquisição</span>
        </div>
        {isAdmin && <TrocaProduto atual="sap" clientId={clientId} />}
        <nav className="side">
          {links("todas")}
          {clientId && <div className="lbl">{cliente?.name ?? "Clínica"}</div>}
          {links("clinica")}
        </nav>
        <div className="side-foot so-aberta">
          {/* A clínica vê o Hub como a continuação do programa (acompanhamento). A equipe troca de produto no topo. */}
          {!isAdmin && (
            <Link to={clientId ? "/$clientId" : "/"} params={(clientId ? { clientId } : undefined) as never} className="inline-flex items-center gap-1.5 text-sm">
              <ArrowLeftRight size={14} aria-hidden /> Acompanhamento no Doctor Creator Hub
            </Link>
          )}
          <LogoutButton className="text-sm text-left min-h-[36px]" />
          <span>Sistema de Aquisição de Pacientes · Doctor Creator</span>
        </div>
      </aside>
      <div className="mainwrap">
        <div className="top admin-top">
          <div className="who">
            <button type="button" aria-label="Abrir o menu" aria-expanded={gaveta} onClick={() => setGaveta(true)} className="sap-menu-btn mr-2 rounded-md border p-1.5" style={{ borderColor: "var(--border)" }}><Menu size={20} /></button>
            <div style={{ minWidth: 0 }}>
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "#C49A5C" }}>
                Sistema de Aquisição de Pacientes
                {clientId && clinica?.d0 && dia !== null ? ` · ${dia > 90 ? "acompanhamento" : dia < 0 ? `começa em ${-dia} dia(s)` : `D${dia} de 90 · ${faseDoDia(dia)}`}` : ""}
              </span>
              <h1>{titulo}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BotaoAjuda isAdmin={isAdmin} />
          </div>
        </div>
        <PrimeiroAcesso isAdmin={isAdmin} clientId={clientId} />
        <div className="mt-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
