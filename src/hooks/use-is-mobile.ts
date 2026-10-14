import { useSyncExternalStore } from "react";

// Lê uma media query e re-renderiza quando ela muda (girar o celular, redimensionar).
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** Tela pequena (celular). Padrão: menos de 640px, o mesmo `sm` do Tailwind. */
export function useIsMobile(maxWidth = 639): boolean {
  return useMediaQuery(`(max-width: ${maxWidth}px)`);
}

/** Mesmo corte em que a barra lateral vira barra inferior (820px). */
export function useNavMobile(): boolean {
  return useMediaQuery("(max-width: 820px)");
}
