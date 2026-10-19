import { useCallback, useEffect, useState } from "react";

/**
 * Preferência de tema e de cor de destaque, por navegador.
 *
 * Fica em localStorage e não no banco de propósito: é preferência de quem
 * está olhando, não do cliente. A médica pode querer escuro no consultório e
 * claro na apresentação, e a mesma conta pode ser aberta por ela, pela
 * secretária e pela gente.
 *
 * Padrão: claro (pedido da equipe: o painel abre claro mesmo com o sistema em
 * modo escuro). "sistema" continua disponível como escolha explícita e, aí,
 * quem decide é o prefers-color-scheme, no CSS.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type AccentChoice =
  "indigo" | "teal" | "violet" | "rose" | "amber" | "slate";

const EVENTO_APARENCIA = "dc:aparencia-alterada";

const CHAVE_TEMA = "dc:tema";
const CHAVE_ACCENT = "dc:accent";

export const ACCENTS: {
  value: AccentChoice;
  label: string;
  amostra: string;
}[] = [
  { value: "indigo", label: "Azul", amostra: "#3a5fd8" },
  { value: "teal", label: "Verde-água", amostra: "#0f7a71" },
  { value: "violet", label: "Violeta", amostra: "#6c47c9" },
  { value: "rose", label: "Rosa", amostra: "#b8385f" },
  { value: "amber", label: "Âmbar", amostra: "#96620a" },
  { value: "slate", label: "Grafite", amostra: "#45526b" },
];

// localStorage joga em janela anônima e com cookies bloqueados. Uma exceção
// aqui derrubaria a tela inteira por causa de uma preferência de cor.
function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* preferência não persiste nesta sessão; a tela continua funcionando */
  }
}

function temaValido(v: string | null): ThemeChoice {
  return v === "dark" || v === "system" ? v : "light";
}

function accentValido(v: string | null): AccentChoice {
  return ACCENTS.some((a) => a.value === v) ? (v as AccentChoice) : "indigo";
}

function aplicar(tema: ThemeChoice, accent: AccentChoice) {
  const raiz = document.documentElement;
  if (tema === "system") raiz.removeAttribute("data-theme");
  else raiz.setAttribute("data-theme", tema);

  // "indigo" é o que já está no :root; não estampar mantém o HTML limpo.
  if (accent === "indigo") raiz.removeAttribute("data-accent");
  else raiz.setAttribute("data-accent", accent);
}

/** Chamado uma vez no boot, antes do React montar, para não piscar. */
export function aplicarTemaSalvo() {
  aplicar(temaValido(ler(CHAVE_TEMA)), accentValido(ler(CHAVE_ACCENT)));
}

export function useTheme() {
  const [tema, setTemaState] = useState<ThemeChoice>(() =>
    temaValido(ler(CHAVE_TEMA)),
  );
  const [accent, setAccentState] = useState<AccentChoice>(() =>
    accentValido(ler(CHAVE_ACCENT)),
  );

  useEffect(() => {
    aplicar(tema, accent);
  }, [tema, accent]);

  // O menu lateral, a folha móvel e as outras abas refletem a mesma preferência.
  useEffect(() => {
    const local = (event: Event) => {
      const choice = (
        event as CustomEvent<{ tema?: ThemeChoice; accent?: AccentChoice }>
      ).detail;
      if (choice?.tema) setTemaState(choice.tema);
      if (choice?.accent) setAccentState(choice.accent);
    };
    const outraAba = (event: StorageEvent) => {
      if (event.key === CHAVE_TEMA || event.key === null)
        setTemaState(temaValido(ler(CHAVE_TEMA)));
      if (event.key === CHAVE_ACCENT || event.key === null)
        setAccentState(accentValido(ler(CHAVE_ACCENT)));
    };
    window.addEventListener(EVENTO_APARENCIA, local);
    window.addEventListener("storage", outraAba);
    return () => {
      window.removeEventListener(EVENTO_APARENCIA, local);
      window.removeEventListener("storage", outraAba);
    };
  }, []);

  const setTema = useCallback((v: ThemeChoice) => {
    gravar(CHAVE_TEMA, v);
    setTemaState(v);
    window.dispatchEvent(
      new CustomEvent(EVENTO_APARENCIA, { detail: { tema: v } }),
    );
  }, []);

  const setAccent = useCallback((v: AccentChoice) => {
    gravar(CHAVE_ACCENT, v);
    setAccentState(v);
    window.dispatchEvent(
      new CustomEvent(EVENTO_APARENCIA, { detail: { accent: v } }),
    );
  }, []);

  return { tema, setTema, accent, setAccent };
}
