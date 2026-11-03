import { createFileRoute, Link } from "@tanstack/react-router";
import { SapFormulario } from "@/components/sap-formulario";
import { useTarefas } from "@/components/sap-tarefas";
import { FORMULARIOS } from "@/lib/sap-formularios";
import { segundaDe } from "@/lib/sap-tarefas";

// Sistema de Aquisição · documento preenchido dentro do SAP (03.01, 02.04, 09.03 e os registros de entrega).
export const Route = createFileRoute("/_authenticated/sap/$clientId/formulario")({
  validateSearch: (s: Record<string, unknown>): { d?: string; ref?: string } => ({
    d: typeof s.d === "string" ? s.d : undefined,
    ref: typeof s.ref === "string" ? s.ref : undefined,
  }),
  component: FormularioPage,
});

function FormularioPage() {
  const { clientId } = Route.useParams();
  const { d, ref } = Route.useSearch();
  const { lista, isLoading, hoje } = useTarefas(clientId, false);
  const f = d ? FORMULARIOS[d] : undefined;
  if (isLoading) return <p className="note">Carregando…</p>;
  const clinica = lista[0]?.entrada.clinica;
  if (!f) return <p className="note">Documento não encontrado. <Link to="/sap/$clientId" params={{ clientId }} className="underline">Voltar às tarefas</Link></p>;
  if (!clinica) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  const refDoc = f.ref === "semana" ? ref ?? segundaDe(hoje) : "";
  return <SapFormulario clientId={clientId} clinicaId={clinica.id} formulario={f} ref={refDoc} titulo={`${f.nome} · ${clinica.nome}`} />;
}
