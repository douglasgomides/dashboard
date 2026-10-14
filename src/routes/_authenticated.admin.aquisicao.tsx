import { createFileRoute, redirect } from "@tanstack/react-router";

// O Sistema de Aquisição virou uma área separada do Hub: o portfólio das clínicas fica em /sap.
export const Route = createFileRoute("/_authenticated/admin/aquisicao")({
  beforeLoad: () => {
    throw redirect({ to: "/sap" });
  },
});
