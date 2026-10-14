import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// Estado "o Hub não tem esse dado": diz o que falta e quem resolve.
export function SemFonte({ titulo, texto, quem }: { titulo: string; texto: string; quem?: string }) {
  return (
    <div className="hempty">
      <h2>{titulo}</h2>
      <p>{texto}</p>
      {quem && (
        <p style={{ marginTop: 8 }}>
          <b>Quem resolve:</b> {quem}
        </p>
      )}
    </div>
  );
}

// Carregando: ícone girando + esqueleto da tela, para não parecer travado. Se passar de 8 s,
// avisa que a origem está demorando (a Meta às vezes leva mais).
export function Carregando({ texto = "Carregando…", linhas = 3 }: { texto?: string; linhas?: number }) {
  const [demorando, setDemorando] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDemorando(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-2 py-1">
      <p className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
        <Loader2 size={15} className="animate-spin" aria-hidden /> {texto}
      </p>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="animate-pulse rounded-lg" style={{ height: i === 0 ? 72 : 44, background: "var(--surface-2)", width: i === linhas - 1 ? "70%" : "100%" }} />
      ))}
      {demorando && <p className="text-xs" style={{ color: "var(--muted)" }}>Ainda buscando os dados. Às vezes a origem (Meta, CRM) demora um pouco mais; a tela continua sozinha.</p>}
    </div>
  );
}

export function ErroCarga({ texto }: { texto: string }) {
  return (
    <div className="hempty">
      <h2>Não foi possível carregar</h2>
      <p>{texto}</p>
    </div>
  );
}

export const SEM_INSTAGRAM = {
  titulo: "Instagram não conectado",
  texto:
    "Este cliente ainda não tem uma conta de Instagram ligada ao Hub, então não há seguidores, posts nem comentários para analisar. Nenhum número é exibido para não passar a impressão de zero.",
  quem: "time Doctor Creator, ligando a conta de Instagram do médico à Business Manager do cliente.",
};

// Resumo executivo no topo de uma tela: 2 a 4 frases em linguagem de gente, antes dos detalhes.
export function ResumoExecutivo({ frases, tom = "neutro" }: { frases: string[]; tom?: "bom" | "atencao" | "neutro" }) {
  const lista = frases.filter(Boolean);
  if (!lista.length) return null;
  const cor = tom === "bom" ? "var(--good)" : tom === "atencao" ? "var(--warn)" : "var(--accent)";
  return (
    <section aria-label="Resumo" className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)", borderLeft: `3px solid ${cor}` }}>
      <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Em resumo</h2>
      <ul className="mt-1.5 space-y-1 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
        {lista.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </section>
  );
}
