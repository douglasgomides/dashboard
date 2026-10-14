import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PortfolioSap } from "@/components/sap-portfolio";
import { getClinicaSap } from "@/lib/sap-data";

// Início do Sistema de Aquisição. Equipe: todas as clínicas. Clínica: o próprio programa.
export const Route = createFileRoute("/_authenticated/sap/")({
  component: InicioSap,
});

function InicioSap() {
  const { isAdmin, user } = useAuth();
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
  if (isAdmin) return <PortfolioSap />;
  if (isLoading) return <p className="text-sm" style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  const clinicas = data ?? [];
  if (!clinicas.length) {
    return (
      <div className="rounded-xl border p-5 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <p className="font-semibold">Sua clínica ainda não está no Sistema de Aquisição.</p>
        <p className="mt-1" style={{ color: "var(--text-dim)" }}>
          O Sistema de Aquisição de Pacientes é o programa de 90 dias da Doctor Creator. Para saber mais, fale com a equipe.
        </p>
        <Link to="/" className="mt-3 inline-block font-semibold underline" style={{ color: "var(--accent)" }}>
          Voltar para o Doctor Creator Hub
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
