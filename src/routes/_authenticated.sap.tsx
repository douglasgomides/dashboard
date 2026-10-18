import { ProductBrand } from "@/components/product-brand";
import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CalendarClock, FileText, KeyRound, ClipboardCheck, Flag, Gauge, LayoutDashboard, ListChecks, ListTodo, Megaphone, Menu, Network, Target, Radar, Presentation, UsersRound, UserRoundCheck, BookOpen, Bot, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LogoutButton } from "@/components/logout-button";
import { TrocaProduto } from "@/components/troca-produto";
import { BotaoAjuda, PrimeiroAcesso } from "@/components/sap-ajuda";
import { getClient } from "@/lib/client-data";
import { supabase } from "@/integrations/supabase/client";
import "@/sap-workspace.css";
import { diaAtual, faseDoDia, getClinicaSap } from "@/lib/sap-data";

// Sistema de Aquisição de Pacientes: produto separado do Doctor Creator Hub, com menu, entrada (sap.*) e
// página inicial próprios. Usa o mesmo login e os mesmos dados (CRM, WhatsApp, Meta) que o Hub já lê;
// as regras de acesso são as mesmas (RLS por cliente).
// Cliente que só usa o Hub não vê o SAP: quem não é da equipe e não tem clínica no SAP vai para o Hub antes de a
// tela abrir (sem moldura e sem o tour do programa). Os dados já eram protegidos pelo banco; isto evita mostrar a tela.
export const Route = createFileRoute("/_authenticated/sap")({
  beforeLoad: async ({ location }) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: admin } = await supabase.rpc("is_app_admin");
    if (admin) return;
    const idNaRota = /^\/sap\/([0-9a-f-]{36})/.exec(location.pathname)?.[1] ?? null;
    const { data } = await supabase.from("client_members").select("client_id").eq("user_id", u.user.id).order("created_at", { ascending: true });
    const ids = ((data ?? []) as { client_id: string }[]).map((m) => m.client_id);
    const alvo = idNaRota ? [idNaRota] : ids;
    const comSap = await Promise.all(alvo.map(async (id) => !!(await getClinicaSap(id))));
    if (comSap.some(Boolean)) return;
    const destino = idNaRota ?? ids[0];
    if (destino) throw redirect({ to: "/$clientId", params: { clientId: destino } });
    throw redirect({ to: "/sem-acesso" });
  },
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
  { grupo: "Implantação", sub: "/papeis", label: "Responsáveis", Icone: UserRoundCheck },
  { grupo: "Rotina semanal", sub: "/leitura", label: "Leitura da semana", Icone: ClipboardCheck, clinica: true },
  { grupo: "Rotina semanal", sub: "/execucao", label: "Execução e saúde", Icone: ListChecks },
  { grupo: "Rotina semanal", sub: "/midia", label: "Mídia", Icone: Gauge },
  { grupo: "Rotina semanal", sub: "/agentes", label: "Agentes de IA", Icone: Bot, clinica: true },
  { grupo: "Resultado", sub: "/metas", label: "Metas e garantia", Icone: Target, clinica: true },
  { grupo: "Resultado", sub: "/documentos", label: "Plano e relatório D90", Icone: FileText, clinica: true },
] as const;
// Na visão da clínica, os grupos viram um só e alguns nomes ficam mais diretos.
const ROTULO_CLINICA: Record<string, string> = { "/cronograma": "Agenda do programa", "/leitura": "Números da semana", "/documentos": "Plano e relatório" };
// Groups reuse the existing permission-filtered items; every original destination stays available.
const AREAS_SAP = [
  { id: "visao", label: "Visão geral", hint: "Programa e resultados", Icone: Flag, subs: ["/painel"] },
  { id: "tarefas", label: "Minha semana", hint: "Prioridades e tarefas", Icone: ListTodo, subs: [""] },
  { id: "implantacao", label: "Implantação", hint: "Etapas e entregas", Icone: CalendarClock, subs: ["/cronograma", "/sessao", "/rastreamento", "/anuncios", "/etapas"] },
  { id: "resultado", label: "Acompanhamento", hint: "Números e evolução", Icone: Gauge, subs: ["/leitura", "/metas", "/execucao", "/midia"] },
  { id: "materiais", label: "Plano e materiais", hint: "Decisões e continuidade", Icone: FileText, subs: ["/documentos"] },
  { id: "equipe", label: "Equipe e acessos", hint: "Responsáveis e preparação", Icone: UsersRound, subs: ["/papeis", "/onboarding"] },
];
const TITULOS: Record<string, string> = { "/sap/guia": "Como operamos", "/sap/docs": "Documentos do SAP", "/sap/comece": "Comece aqui" };

function SapLayout() {
  const { isAdmin } = useAuth();
  return <SapConteudo isAdmin={isAdmin} />;
}

function SapConteudo({ isAdmin }: { isAdmin: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname }).replace(/\/+$/, "") || "/sap";
  const clientId = /^\/sap\/([0-9a-f-]{36})/.exec(pathname)?.[1] ?? null;
  const sub = clientId ? pathname.slice(`/sap/${clientId}`.length) : null;
  const { data: cliente } = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId!), enabled: !!clientId });
  const { data: clinica } = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId!), enabled: !!clientId });
  const dia = diaAtual(clinica?.d0 ?? null, clinica?.pausas);
  const itens = (isAdmin ? ITENS.filter(() => true) : ITENS.filter((i) => "clinica" in i))
    .map((i) => ({ ...i, grupo: isAdmin ? i.grupo : "", label: isAdmin ? i.label : (ROTULO_CLINICA[i.sub] ?? i.label) }));
  const areas = AREAS_SAP.map(area => ({ ...area, itens: area.subs.flatMap(caminho => itens.filter(it => it.sub === caminho)) })).filter(area => area.itens.length);
  const areaAtual = areas.find(area => area.subs.includes(sub ?? "__nenhuma__"));
  const pagina = itens.find(it => it.sub === sub);
  const titulo = clientId ? (sub === "" ? "Minha semana" : pagina?.label ?? "Programa da clínica") : TITULOS[pathname] ?? (isAdmin ? "Todas as clínicas" : "Sistema de Aquisição");
  const [gaveta, setGaveta] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const openMenuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!gaveta) return;
    const menu = menuRef.current;
    const opener = openMenuRef.current;
    const focusable = () => Array.from(menu?.querySelectorAll<HTMLElement>("a[href],button:not([disabled])") ?? []).filter(el => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setGaveta(false); }
      if (event.key !== "Tab") return;
      const items = focusable(), first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const desktop = window.matchMedia("(min-width: 821px)");
    const onDesktop = () => { if (desktop.matches) setGaveta(false); };
    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onDesktop);
    return () => { document.removeEventListener("keydown", onKey); desktop.removeEventListener("change", onDesktop); opener?.focus(); };
  }, [gaveta]);
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
      {parte === "clinica" && clientId && areas.map(area => (
        <Link key={area.id} to={`/sap/$clientId${area.itens[0].sub}` as never} params={{ clientId } as never} activeOptions={{ exact: true }}
          data-on={areaAtual?.id === area.id ? "" : undefined}
          aria-current={sub === area.itens[0].sub ? "page" : undefined}>
          <area.Icone aria-hidden size={18} /><span><strong>{area.label}</strong><small>{area.hint}</small></span>
        </Link>
      ))}

    </>
  );

  return (
    <div className="app sap-workspace">
      <a className="nx-skip" href="#sap-main">Ir para o conteúdo</a>
      {gaveta && <div className="sap-fundo-gaveta" aria-hidden onClick={() => setGaveta(false)} />}
      <aside ref={menuRef} role={gaveta ? "dialog" : undefined} aria-modal={gaveta ? true : undefined} aria-label="Menu do Sistema de Aquisição" className={gaveta ? "gaveta" : undefined}>
        {gaveta && (
          <button type="button" aria-label="Fechar o menu" onClick={() => setGaveta(false)} className="sap-fechar-gaveta self-end rounded-md p-1"><X size={20} /></button>
        )}
        <div className="brand">
          <ProductBrand product="sap" dark />
        </div>
        {isAdmin && <TrocaProduto atual="sap" clientId={clientId} />}
        {clientId && <div className="sap-clinic-context"><span>Programa da clínica</span><strong>{cliente?.name ?? "Carregando…"}</strong>{dia !== null && <small>{dia < 0 ? "Início agendado" : dia > 90 ? "Continuidade" : `Dia ${dia} de 90`}</small>}</div>}
        {clientId && <nav className="side sap-area-nav" aria-label="Áreas do SAP">{links("clinica")}</nav>}
        <nav className="side sap-system-nav" aria-label="Recursos do programa">{clientId && <div className="lbl">{isAdmin ? "Operação" : "Referências"}</div>}{links("todas")}</nav>
        <div className="side-foot so-aberta">
          <LogoutButton className="text-sm text-left min-h-[36px]" />
          <span>Sistema de Aquisição de Pacientes · Doctor Creator</span>
        </div>
      </aside>
      <div className="mainwrap" inert={gaveta || undefined}>
        <header className="top admin-top sap-workspace-header">
          <div className="who">
            <button ref={openMenuRef} type="button" aria-label="Abrir o menu" aria-expanded={gaveta} onClick={() => setGaveta(true)} className="sap-menu-btn mr-2 rounded-md border p-1.5" style={{ borderColor: "var(--border)" }}><Menu size={20} /></button>
            <div style={{ minWidth: 0 }}>
              <span className="sap-workspace-kicker">SAP / {clientId ? areaAtual?.label ?? "Programa" : "Operação Doctor Creator"}</span>
              <h1>{titulo}</h1>
            </div>
          </div>
          <div className="sap-header-tools">
            {clientId && clinica?.d0 && dia !== null && <span className="sap-phase-tag">{dia > 90 ? "Acompanhamento" : dia < 0 ? `Começa em ${-dia} dia(s)` : `D${dia} de 90 · ${faseDoDia(dia)}`}</span>}
            <BotaoAjuda isAdmin={isAdmin} />
          </div>
        </header>
        {clientId && areaAtual && areaAtual.itens.length > 1 && <nav className="sap-context-tabs" aria-label={`Telas de ${areaAtual.label}`}>{areaAtual.itens.map(it => <Link key={it.sub} to={`/sap/$clientId${it.sub}` as never} params={{ clientId } as never} aria-current={sub === it.sub ? "page" : undefined}>{it.label}</Link>)}</nav>}
        <PrimeiroAcesso isAdmin={isAdmin} clientId={clientId} />
        <main className="sap-workspace-content" id="sap-main" tabIndex={-1}><Outlet /></main>
      </div>
    </div>
  );
}
