import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
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
        className="cursor-help underline decoration-dotted underline-offset-2" style={{ color: "inherit", font: "inherit" }}>
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
  const [busca, setBusca] = useState("");
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);
  const lista = GLOSSARIO.filter((g) => !busca || `${g.termo} ${g.explica}`.toLowerCase().includes(busca.toLowerCase()));
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold" style={{ borderColor: "var(--border)" }}>
        <BookOpen size={14} aria-hidden /> O que significa?
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => setAberto(false)}>
          <div role="dialog" aria-modal="true" aria-label="Glossário do programa" className="mt-10 w-full max-w-lg rounded-xl border p-4 shadow-xl" style={{ borderColor: "var(--border)", background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">O que significa cada termo</h2>
              <button type="button" aria-label="Fechar" onClick={() => setAberto(false)} className="rounded-md p-1"><X size={18} /></button>
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

const CHAVE_TOUR = (admin: boolean) => `sap-tour-visto-${admin ? "equipe" : "clinica"}-v1`;
const lerVisto = (k: string) => { try { return window.localStorage.getItem(k) === "1"; } catch { return false; } };
const marcarVisto = (k: string) => { try { window.localStorage.setItem(k, "1"); } catch { /* sem armazenamento: o tour volta, sem quebrar */ } };

/** Primeiro acesso guiado: 4 passos, uma vez por navegador (pode reabrir pelo link "Ver o tour"). */
export function PrimeiroAcesso({ isAdmin, clientId }: { isAdmin: boolean; clientId: string | null }) {
  const chave = CHAVE_TOUR(isAdmin);
  const [aberto, setAberto] = useState(false);
  const [passo, setPasso] = useState(0);
  useEffect(() => { setAberto(!lerVisto(chave)); }, [chave]);
  const passos = passosDoTour(isAdmin);
  const fechar = () => { marcarVisto(chave); setAberto(false); setPasso(0); };
  if (!clientId) return null;
  if (!aberto) {
    return <button type="button" onClick={() => setAberto(true)} className="text-xs underline" style={{ color: "var(--text-dim)" }}>Ver o tour</button>;
  }
  const p = passos[passo];
  return (
    <section aria-label="Primeiro acesso" className="mt-3 rounded-xl border p-4" style={{ borderColor: "#C49A5C", background: "color-mix(in srgb, #C49A5C 10%, var(--surface))" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#C49A5C" }}>Passo {passo + 1} de {passos.length}</div>
          <h2 className="mt-0.5 text-base font-semibold">{p.titulo}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>{p.texto}</p>
        </div>
        <button type="button" aria-label="Fechar o tour" onClick={fechar} className="rounded-md p-1"><X size={18} /></button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto flex gap-1" aria-hidden>{passos.map((_, i) => <span key={i} className="h-1.5 w-6 rounded-full" style={{ background: i <= passo ? "#C49A5C" : "var(--border)" }} />)}</div>
        <Link to={`/sap/$clientId${p.sub}` as never} params={{ clientId } as never} className="min-h-[34px] rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--border)" }}>Abrir esta tela</Link>
        {passo < passos.length - 1 ? (
          <button type="button" onClick={() => setPasso(passo + 1)} className="min-h-[34px] rounded-lg px-4 text-xs font-semibold text-white" style={{ background: "#C49A5C" }}>Próximo</button>
        ) : (
          <button type="button" onClick={fechar} className="min-h-[34px] rounded-lg px-4 text-xs font-semibold text-white" style={{ background: "#C49A5C" }}>Entendi</button>
        )}
      </div>
    </section>
  );
}
