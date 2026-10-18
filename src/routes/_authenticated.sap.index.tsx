import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PortfolioSap } from "@/components/sap-portfolio";
import { MinhasTarefasTodas } from "@/components/sap-tarefas";
import { getClinicaSap } from "@/lib/sap-data";

// Início do Sistema de Aquisição. Equipe: todas as clínicas. Clínica: o próprio programa.
export const Route = createFileRoute("/_authenticated/sap/")({
  component: InicioSap,
});

function InicioSap() {
  const { isAdmin, user } = useAuth();
  const [visao, setVisao] = useState<"clinicas" | "prioridades">("clinicas");
  const { data, isLoading } = useQuery({
    queryKey: ["sap-minhas-clinicas", user?.id],
    enabled: !isAdmin && !!user?.id,
    queryFn: async () => {
      const { data: m } = await supabase.from("client_members").select("client_id, clients(name)").eq("user_id", user!.id);
      const lista = ((m ?? []) as { client_id: string; clients: { name: string } | null }[]).map((x) => ({ id: x.client_id, nome: x.clients?.name ?? "" }));
      const comSap = await Promise.all(lista.map(async (c) => ((await getClinicaSap(c.id)) ? c : null)));
      return comSap.filter((c): c is { id: string; nome: string } => !!c);
    },
  });
  if (isAdmin) {
    return (
      <div className="sap-operation-home">
        <div className="sap-week-heading"><div><p className="sap-eyebrow">Operação Doctor Creator</p><h2>Saiba qual clínica precisa da sua equipe.</h2><p>Compare o avanço e os indicadores das clínicas. Em Minhas prioridades, encontre as tarefas que dependem da sua atuação.</p></div></div>
        <div className="sap-operation-switch" role="group" aria-label="Visão da operação"><button type="button" aria-pressed={visao === "clinicas"} aria-controls="sap-operation-clinics" onClick={() => setVisao("clinicas")}>Clínicas e resultados</button><button type="button" aria-pressed={visao === "prioridades"} aria-controls="sap-operation-priorities" onClick={() => setVisao("prioridades")}>Minhas prioridades</button></div>
        <section id="sap-operation-clinics" aria-label="Clínicas e resultados" hidden={visao !== "clinicas"}><PortfolioSap /></section>
        <section id="sap-operation-priorities" aria-label="Prioridades da equipe" hidden={visao !== "prioridades"}><MinhasTarefasTodas /></section>
      </div>
    );
  }
  if (isLoading) return <p className="text-sm" style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  const clinicas = data ?? [];
  if (!clinicas.length) {
    return (
      <div className="rounded-xl border p-5 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <p className="font-semibold">Nenhuma implantação SAP vinculada ao seu acesso.</p>
        <p className="mt-1" style={{ color: "var(--text-dim)" }}>
          Se sua clínica já contratou o SAP, peça à equipe Doctor Creator para conferir seu vínculo e liberar o ambiente do programa.
        </p>
        <Link to="/" className="mt-3 inline-block font-semibold underline" style={{ color: "var(--accent)" }}>
          Voltar para o Nexo · Doctor Creator
        </Link>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {clinicas.map((c) => (
        <li key={c.id}>
          <Link to="/sap/$clientId" params={{ clientId: c.id }} className="block rounded-xl border p-4 font-semibold" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            {c.nome} →
          </Link>
        </li>
      ))}
    </ul>
  );
}
