import { createFileRoute } from "@tanstack/react-router";
import { DocumentosDoSap } from "@/components/sap-docs";

// Sistema de Aquisição · Documentos do SAP: todos os códigos com nome, para que serve e link.
export const Route = createFileRoute("/_authenticated/sap/docs")({
  component: DocumentosDoSap,
});
