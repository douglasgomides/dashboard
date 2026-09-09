import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun, Palette, Check } from "lucide-react";
import { useTheme, ACCENTS, type ThemeChoice } from "@/hooks/use-theme";

const MODOS: { value: ThemeChoice; label: string; Icone: typeof Sun }[] = [
  { value: "light", label: "Claro", Icone: Sun },
  { value: "dark", label: "Escuro", Icone: Moon },
  { value: "system", label: "Sistema", Icone: Monitor },
];

export function ThemeMenu() {
  const { tema, setTema, accent, setAccent } = useTheme();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora e no Esc — um menu que só fecha no próprio botão
  // parece travado.
  useEffect(() => {
    if (!aberto) return;
    function foraDaCaixa(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    function noEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", foraDaCaixa);
    document.addEventListener("keydown", noEsc);
    return () => {
      document.removeEventListener("mousedown", foraDaCaixa);
      document.removeEventListener("keydown", noEsc);
    };
  }, [aberto]);

  const IconeAtual = MODOS.find((m) => m.value === tema)?.Icone ?? Monitor;

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="Aparência"
        aria-expanded={aberto}
        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-dim)" }}
      >
        <IconeAtual size={15} />
        <Palette size={15} />
      </button>

      {aberto && (
        <div
          className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border p-3 shadow-lg"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Tema
          </div>
          <div className="mt-1.5 flex gap-1">
            {MODOS.map(({ value, label, Icone }) => {
              const ativo = tema === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTema(value)}
                  className="flex flex-1 flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs font-medium"
                  style={{
                    borderColor: ativo ? "var(--accent)" : "var(--border)",
                    background: ativo ? "var(--accent-soft)" : "transparent",
                    color: ativo ? "var(--accent)" : "var(--text-dim)",
                  }}
                >
                  <Icone size={15} />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Cor de destaque
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ACCENTS.map((a) => {
              const ativo = accent === a.value;
              return (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAccent(a.value)}
                  title={a.label}
                  aria-label={a.label}
                  aria-pressed={ativo}
                  className="flex h-7 w-7 items-center justify-center rounded-full border"
                  style={{ background: a.amostra, borderColor: ativo ? "var(--text)" : "transparent" }}
                >
                  {ativo && <Check size={13} color="#fff" />}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs" style={{ color: "var(--text-faint)" }}>
            Fica salvo neste navegador. Verde, amarelo e vermelho não mudam — são leitura de resultado, não decoração.
          </p>
        </div>
      )}
    </div>
  );
}
