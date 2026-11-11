import { createFileRoute, redirect } from "@tanstack/react-router";

// Tirada em 11/11/2026 por decisão do João ("tira isso aí, ninguém usa"): o endereço antigo leva à Carteira, sem 404.
// A guarda do /admin (is_app_admin) roda antes deste redirect, porque a rota é filha de /_authenticated/admin.
// O validateSearch fica porque peças congeladas do SAP fazem Link tipado para esta rota com search { c }.
export const Route = createFileRoute("/_authenticated/admin/brain")({
  validateSearch: (s: Record<string, unknown>) => ({ c: typeof s.c === "string" ? s.c : undefined }),
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
