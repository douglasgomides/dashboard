import { ProductBrand } from "@/components/product-brand";
import { useEffect, useState, type ReactNode } from "react";
import { TrocaProduto } from "@/components/troca-produto";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, Menu, Search, ShieldCheck, X, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { LogoutButton } from "@/components/logout-button";
import { ClientAvatar } from "@/components/client-avatar";
import { DateRangePicker, rotuloPeriodo } from "@/components/date-range-picker";
import type { DateRangeState } from "@/lib/date-range";
import {
  areaDoCaminho,
  areasVisiveis,
  avancadoVisivel,
  subcaminho,
  type AreaVisivel,
  type NavTab,
  type Visibilidade,
} from "@/lib/nav";

// Casca do Hub: barra lateral (computador) ou cabeçalho compacto + barra
// inferior (celular), abas da área e o conteúdo. Não busca dado nenhum: quem
// usa passa cliente, visibilidade e período. Assim a mesma casca serve à rota
// real e à página de QA (src/routes/qa.layout.tsx, só em desenvolvimento).

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
  /** Selo de frescura completo (computador e folha do período). */
  frescor?: ReactNode;
  /** Selo de frescura curto (cabeçalho do celular). */
  frescorCompacto?: ReactNode;
  /** Linha 2 do cabeçalho: disponibilidade de cada fonte. */
  fontesLinha?: ReactNode;
  onBuscarCliente?: () => void;
  /** Primeiro dia com dado da fonte da tela atual (limita os períodos oferecidos). */
  inicioDados?: string | null;
  children: ReactNode;
}

function TabLink({ tab, clientId, dateRange, className, children, ativo }: { tab: NavTab; clientId: string; dateRange: DateRangeState; className?: string; children: ReactNode; ativo: boolean }) {
  // Estilo do item ativo vem de data-on (a área fica acesa em qualquer aba dela).
  // O aria-current fica com o Link, só na tela exata.
  const comum = { className, "data-on": ativo ? "" : undefined, activeOptions: { exact: true, includeSearch: false } };
  if (tab.absoluto) {
    return (
      <Link to={tab.path as never} params={(tab.path.includes("$clientId") ? { clientId } : undefined) as never} {...comum}>
        {children}
      </Link>
    );
  }
  return (
    <Link to={`/$clientId${tab.path}` as never} params={{ clientId } as never} search={dateRange as never} {...comum}>
      {children}
    </Link>
  );
}

/** Primeira aba visível da área: é para onde o item da área leva. */
function primeira(a: AreaVisivel): NavTab {
  return a.visiveis[0];
}

export function BottomSheet({ aberto, onFechar, titulo, children }: { aberto: boolean; onFechar: () => void; titulo: string; children: ReactNode }) {
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="sheet-fundo" onClick={onFechar} />
      <div className="sheet-caixa">
        <div className="sheet-alca" aria-hidden />
        <div className="sheet-topo">
          <h2>{titulo}</h2>
          <button type="button" className="icobtn" onClick={onFechar} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="sheet-corpo">{children}</div>
      </div>
    </div>
  );
}

function TemaBotoes() {
  const { tema, setTema } = useTheme();
  return (
    <div className="themes" role="group" aria-label="Aparência">
      <button type="button" aria-pressed={tema === "light"} onClick={() => setTema("light")}>
        Claro
      </button>
      <button type="button" aria-pressed={tema === "dark"} onClick={() => setTema("dark")}>
        Escuro
      </button>
    </div>
  );
}

/** Abas da área atual. No celular viram um controle segmentado que rola de lado. */
export function AreaTabs({ area, sub, clientId, dateRange }: { area: AreaVisivel | undefined; sub: string; clientId: string; dateRange: DateRangeState }) {
  if (!area || area.visiveis.length < 2) return null;
  return (
    <nav className="areatabs" aria-label={`Telas de ${area.label}`}>
      <div className="areatabs-trilho">
        {area.visiveis.map((t) => (
          <TabLink key={t.path} tab={t} clientId={clientId} dateRange={dateRange} ativo={t.path === sub}>
            {t.label}
          </TabLink>
        ))}
      </div>
    </nav>
  );
}

export function AppShell({ clientId, client, pathname, dateRange, onDateRange, vis, frescor, frescorCompacto, fontesLinha, onBuscarCliente, inicioDados, children }: AppShellProps) {
  const sub = subcaminho(pathname, clientId);
  const ativa = areaDoCaminho(sub);
  const areas = areasVisiveis(vis);
  const avancado = avancadoVisivel(vis);
  const area = areas.find((a) => a.id === ativa);
  const naAvancado = ativa === "mais";

  const [avancadoAberto, setAvancadoAberto] = useState(naAvancado || vis.papel === "admin");
  // Barra lateral recolhível (lembrada neste navegador).
  const [recolhida, setRecolhida] = useState(() => {
    try {
      return localStorage.getItem("hub-sidebar-recolhida") === "1";
    } catch {
      return false;
    }
  });
  const alternarRecolhida = () =>
    setRecolhida((v) => {
      try {
        localStorage.setItem("hub-sidebar-recolhida", v ? "0" : "1");
      } catch {
        /* sem storage */
      }
      return !v;
    });
  const [mais, setMais] = useState(false);
  const [periodo, setPeriodo] = useState(false);
  // Grupos do menu recolhíveis; o grupo da página atual abre sozinho.
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(ativa && ativa !== "mais" ? [ativa] : []));
  useEffect(() => {
    if (ativa && ativa !== "mais") setAbertos((s) => (s.has(ativa) ? s : new Set(s).add(ativa)));
  }, [ativa]);
  const alternarGrupo = (id: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Trocar de tela fecha as folhas do celular.
  useEffect(() => {
    setMais(false);
  }, [pathname]);
  useEffect(() => {
    if (naAvancado) setAvancadoAberto(true);
  }, [naAvancado]);

  const nome = client?.name ?? "Carregando…";
  const linhaInfo = [client?.specialty, client?.instagram_handle ? `@${client.instagram_handle}` : null].filter(Boolean).join(" · ");
  const cfm = client?.cfm_score_status === "verde" && (
    <span className="hchip good" title="Status definido pela equipe no cadastro do cliente (campo cfm_score_status). Não é uma verificação automática das publicações.">
      <ShieldCheck /> CFM em conformidade
    </span>
  );

  const listaAvancado = avancado.map((t) => (
    <TabLink key={t.path} tab={t} clientId={clientId} dateRange={dateRange} ativo={!t.absoluto && t.path === sub}>
      <t.Icone aria-hidden />
      <span>{t.label}</span>
    </TabLink>
  ));

  return (
    <div className={`app${recolhida ? " recolhida" : ""}`}>
      {/* ===== Computador: barra lateral ===== */}
      <aside aria-label="Menu principal">
        <div className="brand">
          <ProductBrand product="nexo" dark />
          <button type="button" className="recolher" onClick={alternarRecolhida} aria-label={recolhida ? "Abrir menu lateral" : "Recolher menu lateral"} title={recolhida ? "Abrir menu" : "Recolher menu"}>
            {recolhida ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        {vis.isAdmin && <TrocaProduto atual="hub" clientId={vis.sap ? clientId : null} />}
        {onBuscarCliente && (
          <button type="button" className="kbar" onClick={onBuscarCliente}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Search size={15} /> Buscar cliente…
            </span>
            <kbd>Ctrl K</kbd>
          </button>
        )}
        <nav className="side areas">
          {areas.map((a) => (
            <div key={a.id} className="grupo">
              <div className="grupo-cab">
                <TabLink tab={primeira(a)} clientId={clientId} dateRange={dateRange} ativo={a.id === ativa}>
                  <a.Icone aria-hidden />
                  <span className="area-txt so-aberta">
                    <span>{a.label}</span>
                    {a.id !== ativa && <small>{a.descricao}</small>}
                  </span>
                  <span className="sr-only">{a.label}</span>
                </TabLink>
                {a.visiveis.length > 1 && !recolhida && (
                  <button
                    type="button"
                    className="grupo-toggle"
                    aria-expanded={abertos.has(a.id)}
                    aria-label={`${abertos.has(a.id) ? "Recolher" : "Abrir"} ${a.label}`}
                    onClick={() => alternarGrupo(a.id)}
                  >
                    <ChevronDown size={16} aria-hidden style={{ transform: abertos.has(a.id) ? "rotate(180deg)" : undefined }} />
                  </button>
                )}
              </div>
              {/* Grupo aberto: as telas do grupo aparecem logo abaixo. */}
              {abertos.has(a.id) && a.visiveis.length > 1 && !recolhida && (
                <div className="sub-itens">
                  {a.visiveis.map((t) => (
                    <TabLink key={t.path} tab={t} clientId={clientId} dateRange={dateRange} ativo={t.path === sub}>
                      <span>{t.label}</span>
                    </TabLink>
                  ))}
                </div>
              )}
            </div>
          ))}
          {avancado.length > 0 && (
            <div className="avancado">
              <button type="button" aria-expanded={avancadoAberto} onClick={() => setAvancadoAberto((v) => !v)} className="avancado-btn">
                <Settings size={16} aria-hidden />
                <span className="so-aberta">Equipe</span>
                <ChevronDown size={16} aria-hidden style={{ transform: avancadoAberto ? "rotate(180deg)" : undefined, marginLeft: "auto" }} />
              </button>
              {avancadoAberto && <div className="avancado-lista">{listaAvancado}</div>}
            </div>
          )}
        </nav>
        <div className="side-foot so-aberta">
          <Link to="/bem-vindo" className="text-sm">Tour do painel</Link>
          <TemaBotoes />
          <LogoutButton className="text-sm text-left min-h-[36px]" />
          <span>Nexo · Marketing e vendas</span>
        </div>
      </aside>

      <div className="mainwrap">
        {/* ===== Celular: cabeçalho compacto e fixo ===== */}
        <header className="mhead">
          <div className="mhead-linha">
            <ClientAvatar nome={client?.name ?? "?"} url={client?.avatar_url} tamanho={32} />
            <div className="mhead-nome">
              <b><span className="workspace-product-inline">Nexo · </span>{nome}</b>
              {frescorCompacto}
            </div>
            <button type="button" className="periodo-chip" onClick={() => setPeriodo(true)} aria-label={`Período: ${rotuloPeriodo(dateRange)}. Trocar período`}>
              <CalendarDays size={16} aria-hidden />
              <span>{rotuloPeriodo(dateRange)}</span>
            </button>
          </div>
          <AreaTabs area={area} sub={sub} clientId={clientId} dateRange={dateRange} />
        </header>

        {/* ===== Computador: cabeçalho em duas linhas ===== */}
        {/* Linha 1: quem é o cliente e o período. Linha 2: disponibilidade de cada fonte. */}
        <div className="top">
          <div className="who">
            <ClientAvatar nome={client?.name ?? "?"} url={client?.avatar_url} tamanho={46} />
            <div style={{ minWidth: 0 }}>
              <p className="workspace-kicker">Nexo · Inteligência de marketing e vendas</p>
              <h1>{nome}</h1>
              {linhaInfo && <p>{linhaInfo}</p>}
            </div>
          </div>
          {cfm}
          <span className="spacer" />
          <DateRangePicker value={dateRange} onChange={onDateRange} inicioDados={inicioDados} />
        </div>
        <div className="top-linha2">{fontesLinha ?? frescor}</div>
        <div className="dtabs">
          <AreaTabs area={area} sub={sub} clientId={clientId} dateRange={dateRange} />
        </div>

        {(area || naAvancado) && (
          <p className="areadesc">
            <b>{naAvancado ? "Equipe" : area!.label}</b>
            <span>{naAvancado ? "Telas de uso da equipe Doctor Creator" : area!.descricao}</span>
          </p>
        )}

        {children}
      </div>

      {/* ===== Celular: barra inferior com as 5 áreas + Mais ===== */}
      <nav className="bottomnav" aria-label="Áreas">
        {areas.map((a) => (
          <TabLink key={a.id} tab={primeira(a)} clientId={clientId} dateRange={dateRange} ativo={a.id === ativa}>
            <a.Icone aria-hidden />
            <span aria-hidden={!!a.curto}>{a.curto ?? a.label}</span>
            {a.curto && <span className="sr-only">{a.label}</span>}
          </TabLink>
        ))}
        <button type="button" onClick={() => setMais(true)} data-on={naAvancado ? "" : undefined} aria-haspopup="dialog">
          {naAvancado ? <MoreHorizontal aria-hidden /> : <Menu aria-hidden />}
          <span>Mais</span>
        </button>
      </nav>

      <BottomSheet aberto={periodo} onFechar={() => setPeriodo(false)} titulo="Período">
        <DateRangePicker
          variante="lista"
          inicioDados={inicioDados}
          value={dateRange}
          onChange={(next) => {
            onDateRange(next);
            if (next.preset !== "personalizado") setPeriodo(false);
          }}
        />
        {(fontesLinha ?? frescor) && <div className="sheet-frescor">{fontesLinha ?? frescor}</div>}
      </BottomSheet>

      <BottomSheet aberto={mais} onFechar={() => setMais(false)} titulo="Mais">
        <div className="mais-cliente">
          <ClientAvatar nome={client?.name ?? "?"} url={client?.avatar_url} tamanho={40} />
          <div style={{ minWidth: 0 }}>
            <b><span className="workspace-product-inline">Nexo · </span>{nome}</b>
            {linhaInfo && <p>{linhaInfo}</p>}
          </div>
        </div>
        {cfm && <div style={{ marginBottom: 12 }}>{cfm}</div>}
        {onBuscarCliente && (
          <button
            type="button"
            className="mais-item"
            onClick={() => {
              setMais(false);
              onBuscarCliente();
            }}
          >
            <Search aria-hidden /> <span>Trocar de cliente</span>
          </button>
        )}
        {avancado.length > 0 && (
          <>
            <div className="mais-lbl">Equipe (só Doctor Creator)</div>
            <nav className="mais-lista" aria-label="Equipe">
              {listaAvancado}
            </nav>
          </>
        )}
        <div className="mais-lbl">Aparência</div>
        <TemaBotoes />
        <LogoutButton className="mais-item mais-sair" />
      </BottomSheet>
    </div>
  );
}
