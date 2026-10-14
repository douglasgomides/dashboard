import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Botão "Copiar …" com alvo de toque de 44px. O rótulo diz o que copia ("Copiar resposta").
export function BotaoCopiar({ texto, rotulo, variante = "secundario" }: { texto: string; rotulo: string; variante?: "primario" | "secundario" }) {
  const [ok, setOk] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    } catch {
      window.prompt("Copie o texto:", texto);
    }
  }
  const estilo =
    variante === "primario"
      ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" }
      : { background: "var(--surface)", color: "var(--text)", borderColor: "var(--border)" };
  return (
    <button
      type="button"
      onClick={copiar}
      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border px-4 text-sm font-semibold"
      style={estilo}
      aria-live="polite"
    >
      {ok ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
      {ok ? "Copiado" : rotulo}
    </button>
  );
}
