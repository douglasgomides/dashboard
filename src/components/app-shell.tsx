import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronDown,
  Menu,
  Search,
  ShieldCheck,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ArrowRight,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LogoutButton } from "@/components/logout-button";
import { BuscaDeTelas } from "@/components/busca-de-telas";
import { ehEquipe } from "@/lib/registro-de-telas";
import { MarcaNexo, MenuEquipe } from "@/components/menu-equipe";
import { IconeTabler } from "@/components/icons/tabler";
import { AvatarGerado } from "@/components/avatar-gerado";
import { ClientAvatar } from "@/components/client-avatar";
import { DateRangePicker, rotuloPeriodo } from "@/components/date-range-picker";
import type { DateRangeState } from "@/lib/date-range";
import {
  navTabKey,
  tabAtiva,
  navSearch,
  areaDoCaminho,
  areasVisiveis,
  navegacaoClinica,
  avancadoVisivel,
  buscarTelas,
  subcaminho,
  type AreaVisivel,
  type NavTab,
  type Visibilidade,
} from "@/lib/nav";
import "@/styles/workspace-navigation.css";
import "@/styles/databoard-shell.css";

export interface ShellClient {
  name: string;
  specialty?: string | null;
  instagram_handle?: string | null;
  avatar_url?: string | null;
  cfm_score_status?: string | null;
}

export interface AppShellProps {
  clientId: string;
  client: ShellClient | undefined;
  pathname: string;
  dateRange: DateRangeState;
  onDateRange: (next: DateRangeState) => void;
  vis: Visibilidade;
  currentSearch?: Record<string, unknown>;
  frescor?: ReactNode;
  frescorCompacto?: ReactNode;
  fontesLinha?: ReactNode;
  onBuscarCliente?: () => void;
  inicioDados?: string | null;
  semPeriodo?: boolean;
  children: ReactNode;
}

// Dica do atalho no campo Buscar tela (decorativa, aria-hidden): ⌘ K no Mac, Ctrl K nos outros.
const ATALHO_BUSCA =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘ K" : "Ctrl K";

// Iniciais do tile da clínica no cabeçalho do celular (UI-SPEC §Avatares: clínica não é pessoa, não usa o personagem).
const PALAVRAS_MENORES = new Set(["da", "de", "do", "das", "dos", "e"]);
function iniciaisDaClinica(nome: string | undefined): string {
  if (!nome) return "";
  const palavras = nome
    .replace(/^(cl[ií]nica|dra?\.?)\s+/i, "")
    .split(/\s+/)
    .filter((p) => p && !PALAVRAS_MENORES.has(p.toLowerCase()));
  return palavras
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function TabLink({
  tab,
  clientId,
  dateRange,
  className,
  children,
  ativo,
  onClick,
}: {
  tab: NavTab;
  clientId: string;
  dateRange: DateRangeState;
  className?: string;
  children: ReactNode;
  ativo: boolean;
  onClick?: () => void;
}) {
  const comum = {
    className,
    onClick,
    "data-on": ativo ? "" : undefined,
    activeOptions: { exact: true, includeSearch: !!tab.search },
    "aria-current": ativo ? (tab.path === "/marketing" ? "location" as const : "page" as const) : undefined,
  };
  if (tab.absoluto)
    return (
      <Link
        to={tab.path as never}
        params={
          (tab.path.includes("$clientId") ? { clientId } : undefined) as never
        }
        {...comum}
      >
        {children}
      </Link>
    );
  return (
    <Link
      to={`/$clientId${tab.path}` as never}
      params={{ clientId } as never}
      search={navSearch(tab, dateRange) as never}
      {...comum}
    >
      {children}
    </Link>
  );
}

/** O dialog nativo mantém o foco dentro da folha e torna o restante da página inerte. */
export function BottomSheet({
  aberto,
  onFechar,
  titulo,
  origem,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  /** Origem declarada para o log por rota (data-origem): links dentro da folha gravam menu ou busca. */
  origem?: "menu" | "busca";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !aberto) return;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-dialog-focus]")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      className="workspace-dialog"
      aria-label={titulo}
      data-origem={origem}
      onCancel={(e) => {
        e.preventDefault();
        onFechar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="sheet-topo">
        <h2>{titulo}</h2>
        <button
          type="button"
          className="icobtn"
          onClick={onFechar}
          aria-label="Fechar"
        >
          <X size={20} />
        </button>
      </div>
      <div className="sheet-corpo">{children}</div>
    </dialog>
  );
}

function TelasDaArea({
  area,
  sub,
  clientId,
  dateRange,
  onEscolher,
  currentSearch,
  compacto = false,
}: {
  compacto?: boolean;
  currentSearch?: Record<string, unknown>;
  area: AreaVisivel;
  sub: string;
  clientId: string;
  dateRange: DateRangeState;
  onEscolher?: () => void;
}) {
  const item = (t: NavTab) => (
    <TabLink key={navTabKey(t)} tab={t} clientId={clientId} dateRange={dateRange} ativo={tabAtiva(t, sub, currentSearch)} onClick={onEscolher}>
      <t.Icone size={16} aria-hidden /><span>{t.label}</span>
    </TabLink>
  );
  if (compacto && area.id === "marketing") {
    const grupos = [...new Set(area.visiveis.map(t => t.grupo).filter((g): g is string => !!g))];
    return <nav className="workspace-pages" aria-label={`Telas de ${area.label}`}>
      {area.visiveis.filter(t => !t.grupo).map(item)}
      {grupos.map((grupo, index) => {
        const telas = area.visiveis.filter(t => t.grupo === grupo);
        const ativo = telas.some(t => tabAtiva(t, sub, currentSearch));
        return <details key={grupo} className="workspace-nav-group" open={ativo || (sub === "/marketing" && index === 0)}>
          <summary><span>{grupo}</span><span className="workspace-nav-count">{telas.length}</span><ChevronDown size={14} aria-hidden /></summary>
          <div>{telas.map(item)}</div>
        </details>;
      })}
    </nav>;
  }
  return <nav className="workspace-pages" aria-label={`Telas de ${area.label}`}>
    {area.visiveis.map((t, i) => <div key={navTabKey(t)}>
      {t.grupo && t.grupo !== area.visiveis[i - 1]?.grupo && <p className="workspace-nav-label">{t.grupo}</p>}
      {item(t)}
    </div>)}
  </nav>;
}

export function AppShell({
  clientId,
  client,
  pathname,
  dateRange,
  onDateRange,
  vis,
  currentSearch = {},
  frescor,
  frescorCompacto,
  fontesLinha,
  onBuscarCliente,
  inicioDados,
  semPeriodo = false,
  children,
}: AppShellProps) {
  const sub = subcaminho(pathname, clientId);
  const ativa = areaDoCaminho(sub);
  const todasAreas = areasVisiveis(vis);
  const { principais, detalhes } = navegacaoClinica(todasAreas, vis.isAdmin);
  // Equipe (admin do app ou estrategista, D-03) usa a busca nova "Buscar tela"; o médico (owner/viewer) segue igual.
  const perfilEquipe = { isAdmin: vis.isAdmin, papel: vis.papel };
  const equipe = ehEquipe(perfilEquipe);
  // Bloco do usuário no rodapé da barra da equipe: semente do avatar é o e-mail em minúsculas; o nome é a parte local.
  const { user } = useAuth();
  const email = (user?.email ?? "").toLowerCase();
  const nomeDoUsuario = email.split("@")[0];
  const areas = [...principais, ...detalhes];
  const avancado = avancadoVisivel(vis);
  const area = areas.find((a) => a.id === ativa);
  const tela =
    area?.visiveis.find((t) => tabAtiva(t, sub, currentSearch)) ??
    avancado.find((t) => !t.absoluto && t.path === sub);
  const [recolhida, setRecolhida] = useState(() => {
    try {
      return localStorage.getItem("hub-sidebar-recolhida") === "1";
    } catch {
      return false;
    }
  });
  const [mais, setMais] = useState(false);
  const [periodo, setPeriodo] = useState(false);
  const [busca, setBusca] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [avancadoAberto, setAvancadoAberto] = useState(ativa === "mais");
  const titulo = tela?.label ?? area?.label ?? "Análise da clínica";
  const descricao = tela?.descricao ?? area?.descricao;
  const nome = client?.name ?? "Carregando…";
  const linhaInfo = [
    client?.specialty,
    client?.instagram_handle ? `@${client.instagram_handle}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const encontrados = busca && !equipe ? buscarTelas(vis, consulta) : [];
  const atalhosMobile = vis.isAdmin ? areas.filter(a => ["resumo", "marketing", "comercial", "acoes"].includes(a.id)) : principais;

  useEffect(() => {
    setMais(false);
    setBusca(false);
    setPeriodo(false);
  }, [pathname]);
  useEffect(() => {
    if (ativa === "mais") setAvancadoAberto(true);
  }, [ativa]);
  useEffect(() => {
    // Para a equipe o atalho mora na BuscaDeTelas: ligar os dois abriria e fecharia na mesma tecla.
    if (equipe) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMais(false);
        setPeriodo(false);
        setConsulta("");
        setBusca((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [equipe]);

  function alternarRecolhida() {
    setRecolhida((v) => {
      try {
        localStorage.setItem("hub-sidebar-recolhida", v ? "0" : "1");
      } catch {
        /* sem storage */
      }
      return !v;
    });
  }
  function abrirBusca() {
    setMais(false);
    setConsulta("");
    setBusca(true);
  }
  const listaAvancado = avancado.map((t) => (
    <TabLink
      key={t.path}
      tab={t}
      clientId={clientId}
      dateRange={dateRange}
      ativo={!t.absoluto && t.path === sub}
      onClick={() => setMais(false)}
    >
      <t.Icone aria-hidden />
      <span>{t.label}</span>
    </TabLink>
  ));
  const cfm = client?.cfm_score_status === "verde" && (
    <span
      className="hchip good"
      title="Status registrado pela equipe. Não substitui a revisão das publicações e das regras aplicáveis."
    >
      <ShieldCheck /> CFM · status da equipe
    </span>
  );

  return (
    <div
      className={`app product-workspace workspace-guided${recolhida ? " recolhida" : ""}`}
    >
      <a className="workspace-skip" href="#workspace-content">
        Ir para o conteúdo
      </a>
      <aside aria-label="Menu principal" data-origem="menu" className={equipe ? "nx-barra" : undefined}>
        {equipe ? (
          // Barra da equipe (03-02, MENU-02/03, D-01): marca N, campo Buscar tela e o Menu da equipe. Sem Aparência e sem
          // seletor de produto (UI-SPEC D8). No celular a equipe usa o cabeçalho com Buscar tela e a folha Menu (03-04).
          <>
            <div className="nx-barra-topo">
              <MarcaNexo recolhida={recolhida} />
              <button
                type="button"
                className="nx-recolher"
                onClick={alternarRecolhida}
                aria-label={recolhida ? "Abrir menu lateral" : "Recolher menu lateral"}
              >
                <IconeTabler nome={recolhida ? "chevron-right" : "chevron-left"} tamanho={20} />
              </button>
            </div>
            <button
              type="button"
              className="nx-buscar"
              onClick={abrirBusca}
              aria-keyshortcuts="Control+K Meta+K"
              title={recolhida ? "Buscar tela" : undefined}
            >
              <IconeTabler nome="search" tamanho={recolhida ? 20 : 16} />
              <span className={recolhida ? "sr-only" : "nx-buscar-texto"}>Buscar tela</span>
              {!recolhida && <kbd aria-hidden="true">{ATALHO_BUSCA}</kbd>}
            </button>
            <MenuEquipe
              variante="barra"
              perfil={perfilEquipe}
              clientId={clientId}
              pathname={pathname}
              dateRange={dateRange}
              recolhida={recolhida}
            />
            <hr className="nx-sep so-aberta" />
            <div className="nx-rodape so-aberta">
              <Link to="/bem-vindo">Conheça o Nexo</Link>
              <LogoutButton rotulo="Sair da conta" />
              {email && (
                <div className="nx-usuario">
                  <AvatarGerado nome={email} tamanho={40} />
                  <div className="nx-usuario-texto">
                    <b>{nomeDoUsuario}</b>
                    <span>{email}</span>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
        <>
        <div className="brand">
          {/* D-10: o médico ganha a marca N Cobalto; itens e áreas não mudam. */}
          <MarcaNexo recolhida={recolhida} />
          <button
            type="button"
            className="recolher"
            onClick={alternarRecolhida}
            aria-label={
              recolhida ? "Abrir menu lateral" : "Recolher menu lateral"
            }
          >
            {recolhida ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>
        <button
          type="button"
          className="kbar"
          onClick={abrirBusca}
          aria-keyshortcuts="Control+K Meta+K"
          title="Buscar ferramenta · Ctrl+K ou ⌘K"
        >
          <Search size={16} aria-hidden />
          <span>Encontrar uma ferramenta</span>
          <kbd aria-hidden>Ctrl K</kbd>
        </button>
        <nav className="side areas" aria-label="Áreas do Nexo">
          {principais.map((a) => (
            <TabLink
              key={a.id}
              tab={a.visiveis[0]}
              clientId={clientId}
              dateRange={dateRange}
              ativo={a.id === ativa}
            >
              <a.Icone aria-hidden />
              <span className="so-aberta">{a.label}</span>
              {recolhida && <span className="sr-only">{a.label}</span>}
            </TabLink>
          ))}
        </nav>
        {detalhes.length > 0 && <details className="workspace-section so-aberta" open={detalhes.some(a => a.id === ativa)}>
          <summary className="workspace-nav-label">Explorar análises e ferramentas</summary>
          <nav className="side areas" aria-label="Análises detalhadas">{detalhes.map(a => <TabLink key={a.id} tab={a.visiveis[0]} clientId={clientId} dateRange={dateRange} ativo={a.id === ativa}><a.Icone aria-hidden /><span>{a.label}</span></TabLink>)}</nav>
        </details>}
        {area && area.visiveis.length > 1 && (
          <div className="workspace-section so-aberta">
            <p className="workspace-nav-label">Em {area.label}</p>
            <TelasDaArea
              compacto
              area={area}
              currentSearch={currentSearch}
              sub={sub}
              clientId={clientId}
              dateRange={dateRange}
            />
          </div>
        )}
        {avancado.length > 0 && (
          <div className="avancado so-aberta">
            <button
              type="button"
              aria-expanded={avancadoAberto}
              onClick={() => setAvancadoAberto((v) => !v)}
              className="avancado-btn"
            >
              <Settings size={16} aria-hidden />
              Equipe e configuração
              <ChevronDown size={16} aria-hidden />
            </button>
            {avancadoAberto && (
              <nav className="workspace-pages" aria-label="Equipe">
                {listaAvancado}
              </nav>
            )}
          </div>
        )}
        <div className="side-foot so-aberta">
          <Link to="/bem-vindo" className="text-sm">
            Conheça o Nexo
          </Link>
          <LogoutButton dark className="text-sm text-left min-h-[36px]" />
          <span>Nexo · Marketing e vendas</span>
        </div>
        </>
        )}
      </aside>
      <div className="mainwrap">
        <header className="mhead">
          {equipe ? (
            // Cabeçalho do celular da equipe (MENU-02/03, D-01): tile da clínica, nome, Buscar tela sempre com texto e Menu.
            // A base opaca do .mhead é do 03-03; aqui entra só o conteúdo.
            <>
              <div className="mhead-linha nx-mhead">
                <span className="nx-tile" aria-hidden="true">{iniciaisDaClinica(client?.name)}</span>
                <b className="nx-mhead-nome">{nome}</b>
                <button type="button" className="nx-mhead-buscar" onClick={abrirBusca}>
                  <IconeTabler nome="search" tamanho={20} />
                  <span>Buscar tela</span>
                </button>
                <button
                  type="button"
                  className="icobtn nx-mhead-menu"
                  onClick={() => setMais(true)}
                  aria-label="Abrir menu"
                  aria-haspopup="dialog"
                >
                  <IconeTabler nome="menu-2" tamanho={20} />
                </button>
              </div>
              {(!semPeriodo || frescorCompacto) && (
                <div className="nx-mhead-periodo">
                  {!semPeriodo && (
                    <button
                      type="button"
                      className="periodo-chip"
                      onClick={() => setPeriodo(true)}
                      aria-label={`Período: ${rotuloPeriodo(dateRange)}. Trocar período`}
                    >
                      <CalendarDays size={16} aria-hidden />
                      <span>{rotuloPeriodo(dateRange)}</span>
                    </button>
                  )}
                  {frescorCompacto}
                </div>
              )}
            </>
          ) : (
            <div className="mhead-linha">
              <ClientAvatar nome={nome} url={client?.avatar_url} tamanho={32} />
              <div className="mhead-nome">
                <b>{nome}</b>
                {frescorCompacto}
              </div>
              <button
                type="button"
                className="icobtn"
                onClick={abrirBusca}
                aria-label="Encontrar uma ferramenta"
              >
                <Search size={20} />
              </button>
              {!semPeriodo && <button
                type="button"
                className="periodo-chip"
                onClick={() => setPeriodo(true)}
                aria-label={`Período: ${rotuloPeriodo(dateRange)}. Trocar período`}
              >
                <CalendarDays size={16} aria-hidden />
                <span>{rotuloPeriodo(dateRange)}</span>
              </button>}
            </div>
          )}
        </header>
        <div className="workspace-context">
          <div className="workspace-clinic">
            <ClientAvatar nome={nome} url={client?.avatar_url} tamanho={32} />
            <div>
              <b>{nome}</b>
              {linhaInfo && <p>{linhaInfo}</p>}
            </div>
          </div>
          <div className="workspace-context-tools">
            {onBuscarCliente && (
              <button
                type="button"
                onClick={onBuscarCliente}
                className="ws-action ws-action--secondary"
                aria-label="Trocar de clínica"
              >
                <Users size={16} aria-hidden />
                Trocar de clínica
              </button>
            )}
            {!semPeriodo && <DateRangePicker
              value={dateRange}
              onChange={onDateRange}
              inicioDados={inicioDados}
            />}
          </div>
        </div>
        <header className="workspace-heading">
          <div>
            <p className="workspace-eyebrow">
              Nexo{area && area.label !== titulo ? ` / ${area.label}` : ""}
            </p>
            <h1>{titulo}</h1>
            {descricao && <p>{descricao}</p>}
          </div>
          {area && area.visiveis.length > 1 && (
            <button
              type="button"
              className="workspace-area-switch"
              onClick={() => setMais(true)}
            >
              Telas de {area.label}
              <ChevronDown size={16} aria-hidden />
            </button>
          )}
        </header>
        <div className="workspace-data-status">
          {frescorCompacto ?? frescor}
          {(fontesLinha || cfm) && (
            <details>
              <summary>Conferir fontes e atualização</summary>
              <div>
                {fontesLinha}
                {cfm}
              </div>
            </details>
          )}
        </div>
        <main id="workspace-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      {!equipe && (
      <nav className="bottomnav" aria-label="Áreas" data-origem="menu">
        {atalhosMobile.map((a) => (
          <TabLink
            key={a.id}
            tab={a.visiveis[0]}
            clientId={clientId}
            dateRange={dateRange}
            ativo={a.id === ativa}
          >
            <a.Icone aria-hidden />
            <span>{a.curto ?? a.label}</span>
          </TabLink>
        ))}
        <button
          type="button"
          onClick={() => setMais(true)}
          data-on={!atalhosMobile.some((a) => a.id === ativa) ? "" : undefined}
          aria-haspopup="dialog"
        >
          <Menu aria-hidden />
          <span>Menu</span>
        </button>
      </nav>
      )}
      <BottomSheet
        aberto={periodo && !semPeriodo}
        onFechar={() => setPeriodo(false)}
        titulo="Período"
      >
        <DateRangePicker
          variante="lista"
          inicioDados={inicioDados}
          value={dateRange}
          onChange={(next) => {
            onDateRange(next);
            if (next.preset !== "personalizado") setPeriodo(false);
          }}
        />
        <div className="sheet-frescor">{fontesLinha ?? frescor}</div>
      </BottomSheet>
      {equipe ? (
        // Folha Menu da equipe (MENU-02, D-08): os mesmos itens da barra, Trocar de clínica e Sair da conta.
        <BottomSheet aberto={mais} onFechar={() => setMais(false)} titulo="Menu" origem="menu">
          <MenuEquipe
            variante="folha"
            perfil={perfilEquipe}
            clientId={clientId}
            pathname={pathname}
            dateRange={dateRange}
            onEscolher={() => setMais(false)}
          />
          <hr className="nx-sep" />
          {onBuscarCliente && (
            <button
              type="button"
              className="mais-item"
              onClick={() => {
                setMais(false);
                onBuscarCliente();
              }}
            >
              <Users aria-hidden />
              Trocar de clínica
            </button>
          )}
          <LogoutButton rotulo="Sair da conta" className="mais-item mais-sair" />
        </BottomSheet>
      ) : (
      <BottomSheet
        aberto={mais}
        onFechar={() => setMais(false)}
        titulo="Navegar no Nexo"
        origem="menu"
      >
        <p className="workspace-menu-help">
          Escolha o que você precisa fazer em {nome}.
        </p>
        <button type="button" className="mais-item" onClick={abrirBusca}>
          <Search aria-hidden />
          Encontrar uma ferramenta
        </button>
        {areas.map((a) => (
            <details
              className="workspace-menu-group"
              key={a.id}
              open={a.id === ativa}
            >
              <summary>
                <a.Icone size={18} aria-hidden />
                <span>{a.label}</span>
                <ChevronDown size={16} aria-hidden />
              </summary>
              <TelasDaArea
                area={a}
                currentSearch={currentSearch}
                sub={sub}
                clientId={clientId}
                dateRange={dateRange}
                onEscolher={() => setMais(false)}
              />
            </details>
          ))}
        {onBuscarCliente && (
          <button
            type="button"
            className="mais-item"
            onClick={() => {
              setMais(false);
              onBuscarCliente();
            }}
          >
            <Users aria-hidden />
            Trocar de clínica
          </button>
        )}
        {avancado.length > 0 && (
          <details className="workspace-menu-group">
            <summary>
              <Settings size={18} aria-hidden />
              <span>Equipe e configuração</span>
              <ChevronDown size={16} aria-hidden />
            </summary>
            <nav className="workspace-pages" aria-label="Equipe">
              {listaAvancado}
            </nav>
          </details>
        )}
        <LogoutButton className="mais-item mais-sair" />
      </BottomSheet>
      )}
      {equipe ? (
        <BuscaDeTelas
          aberto={busca}
          onAbrir={abrirBusca}
          onFechar={() => setBusca(false)}
          perfil={perfilEquipe}
          clientId={clientId}
          dateRange={dateRange}
          fontes={vis.fontes}
        />
      ) : (
      <BottomSheet
        aberto={busca}
        onFechar={() => setBusca(false)}
        titulo="O que você quer fazer?"
      >
        <label className="workspace-search-label" htmlFor="workspace-search">
          Busque uma tarefa ou ferramenta
        </label>
        <input
          id="workspace-search"
          data-dialog-focus
          className="workspace-search"
          type="search"
          autoFocus
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Ex.: criar roteiro, ver o funil, relatório"
        />
        <p className="workspace-menu-help" role="status">
          {encontrados.length}{" "}
          {encontrados.length === 1
            ? "destino disponível"
            : "destinos disponíveis"}{" "}
          para esta clínica.
        </p>
        <nav
          className="workspace-search-results"
          aria-label="Resultados da busca"
          data-origem="busca"
        >
          {encontrados.map(({ tab, area: grupo }) => (
            <TabLink
              key={navTabKey(tab)}
              tab={tab}
              clientId={clientId}
              dateRange={dateRange}
              ativo={tabAtiva(tab, sub, currentSearch)}
              onClick={() => setBusca(false)}
            >
              <tab.Icone size={19} aria-hidden />
              <span>
                <small>{grupo}</small>
                <b>{tab.label}</b>
                {tab.descricao && <span>{tab.descricao}</span>}
              </span>
              <ArrowRight size={16} aria-hidden />
            </TabLink>
          ))}
        </nav>
        {!encontrados.length && (
          <p>
            Nenhuma ferramenta encontrada. Tente “conteúdo”, “atendimento” ou
            “relatório”.
          </p>
        )}
      </BottomSheet>
      )}
    </div>
  );
}
