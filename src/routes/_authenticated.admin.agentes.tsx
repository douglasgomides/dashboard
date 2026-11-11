import { createFileRoute, redirect } from "@tanstack/react-router";

// Tirada em 11/11/2026 por decisão do João ("tira isso aí, ninguém usa"): o endereço antigo leva à Carteira, sem 404.
// A guarda do /admin (is_app_admin) roda antes deste redirect, porque a rota é filha de /_authenticated/admin.
export const Route = createFileRoute("/_authenticated/admin/agentes")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
