import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPrefUsuarioSap, marcarVistoSap } from "@/lib/sap-data";
import { WorkspaceButton } from "@/components/workspace-ui";
import { BookOpen, X } from "lucide-react";
import { GLOSSARIO, explicacao, passosDoTour } from "@/lib/sap-glossario";

/** Termo do método sublinhado: ao tocar ou passar o mouse, mostra a explicação em uma frase. */
export function Termo({ t, children }: { t: string; children?: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const exp = explicacao(t);
  if (!exp) return <>{children ?? t}</>;
  return (
    <span className="relative inline-block">
      <button type="button" aria-describedby={aberto ? id : undefined} aria-expanded={aberto} onClick={() => setAberto(!aberto)} onBlur={() => setAberto(false)}
        onMouseEnter={() => setAberto(true)} onMouseLeave={() => setAberto(false)}
        className="ws-inline-help cursor-help underline decoration-dotted underline-offset-2" style={{ color: "inherit", font: "inherit" }}>
        {children ?? t}
      </button>
      {aberto && (
        <span role="tooltip" id={id} className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[80vw] rounded-lg border p-2 text-left text-xs font-normal shadow-lg"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
          <strong>{t}:</strong> {exp}
        </span>
      )}
    </span>
  );
}

/** Botão do topo: abre o glossário completo. */
export function BotaoGlossario() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold" style={{ borderColor: "var(--border)" }}>
        <BookOpen size={14} aria-hidden /> O que significa?
      </button>
      {aberto && <GlossarioDialogo onFechar={() => setAberto(false)} />}
    </>
  );
}

function GlossarioDialogo({ onFechar }: { onFechar: () => void }) {
  const [busca, setBusca] = useState("");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);
  const lista = GLOSSARIO.filter((g) => !busca || `${g.termo} ${g.explica}`.toLowerCase().includes(busca.toLowerCase()));
  return (
    <>
      {(
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => onFechar()}>
          <div role="dialog" aria-modal="true" aria-label="Glossário do programa" className="mt-10 w-full max-w-lg rounded-xl border p-4 shadow-xl" style={{ borderColor: "var(--border)", background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">O que significa cada termo</h2>
              <button type="button" aria-label="Fechar" onClick={() => onFechar()} className="rounded-md p-1"><X size={18} /></button>
            </div>
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar um termo…" className="mt-3 block min-h-[36px] w-full rounded-md border px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
            <dl className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto text-sm">
              {lista.map((g) => (
                <div key={g.termo}><dt className="font-semibold">{g.termo}</dt><dd style={{ color: "var(--text-dim)" }}>{g.explica}</dd></div>
              ))}
              {lista.length === 0 && <p className="note">Nenhum termo encontrado.</p>}
            </dl>
          </div>
        </div>
      )}
    </>
  );
}

/** Primeiro acesso guiado: aparece sozinho só na primeira vez de cada usuário (guardado no banco, não no navegador).
 *  Depois, abre pelo botão ? do cabeçalho (evento "sap-abrir-tour"). */
export function PrimeiroAcesso({ isAdmin, clientId }: { isAdmin: boolean; clientId: string | null }) {
  const qc = useQueryClient();
  const prefQ = useQuery({ queryKey: ["sap-pref"], queryFn: getPrefUsuarioSap, staleTime: Infinity });
  const [aberto, setAberto] = useState(false);
  const [passo, setPasso] = useState(0);
  useEffect(() => { if (prefQ.data && !prefQ.data.tour_visto_em) setAberto(true); }, [prefQ.data]);
  useEffect(() => {
    const abrir = () => { setPasso(0); setAberto(true); };
    window.addEventListener("sap-abrir-tour", abrir);
    return () => window.removeEventListener("sap-abrir-tour", abrir);
  }, []);
  const passos = passosDoTour(isAdmin);
  const fechar = () => {
    setAberto(false); setPasso(0);
    if (prefQ.data && !prefQ.data.tour_visto_em) marcarVistoSap("tour").then(() => qc.invalidateQueries({ queryKey: ["sap-pref"] })).catch(() => undefined);
  };
  if (!aberto) return null;
  const p = passos[passo];
  const destino = p.sub === "/comece" ? { to: "/sap/comece" } : clientId ? { to: `/sap/$clientId${p.sub}`, params: { clientId } } : null;
  return (
    <section aria-label="Primeiro acesso" className="mt-3 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--sap-brass)" }}>Passo {passo + 1} de {passos.length}</div>
          <h2 className="mt-0.5 text-base font-semibold">{p.titulo}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>{p.texto}</p>
        </div>
        <button type="button" aria-label="Fechar o tour" onClick={fechar} className="icobtn"><X size={18} /></button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto flex gap-1" aria-hidden>{passos.map((_, i) => <span key={i} className="h-1.5 w-6 rounded-full" style={{ background: i <= passo ? "#C49A5C" : "var(--border)" }} />)}</div>
        {destino && <Link to={destino.to as never} params={destino.params as never} className="ws-action ws-action--secondary">{p.sub === "/comece" ? "Abrir o Comece aqui" : "Abrir esta tela"}</Link>}
        {passo < passos.length - 1 ? (
          <WorkspaceButton onClick={() => setPasso(passo + 1)}>Próximo</WorkspaceButton>
        ) : (
          <WorkspaceButton onClick={fechar}>Entendi</WorkspaceButton>
        )}
      </div>
    </section>
  );
}

/** Botão ? do cabeçalho: Comece aqui, tour, glossário e documentos. */
export function BotaoAjuda({ isAdmin }: { isAdmin: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [glossario, setGlossario] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);
  const item = "block w-full min-h-[38px] rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--accent-soft)]";
  return (
    <div className="relative">
      <button type="button" aria-label="Ajuda" aria-expanded={aberto} onClick={() => setAberto(!aberto)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold" style={{ borderColor: "var(--border)" }}>?</button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border p-1 shadow-lg" style={{ borderColor: "var(--border)", background: "var(--surface)" }} onClick={() => setAberto(false)}>
          <Link to="/sap/comece" className={item} role="menuitem">Comece aqui (2 min)</Link>
          <button type="button" className={item} role="menuitem" onClick={() => window.dispatchEvent(new Event("sap-abrir-tour"))}>Ver o tour</button>
          <button type="button" className={item} role="menuitem" onClick={() => setGlossario(true)}>O que significa cada termo</button>
          <Link to="/sap/docs" className={item} role="menuitem">Documentos do SAP</Link>
          {isAdmin && <Link to="/sap/guia" className={item} role="menuitem">Como operamos</Link>}
        </div>
      )}
      {glossario && <GlossarioDialogo onFechar={() => setGlossario(false)} />}
    </div>
  );
}
