import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ehEnderecoSap } from "@/lib/marca";
import { diaAtual, pausasValidas } from "@/lib/sap-data";

// Página inicial de quem está logado: decide para onde ir (as regras de acesso continuam as mesmas).
// - Endereço sap.*: o Sistema de Aquisição (/sap), produto separado do Hub.
// - Admin: painel de administração do Hub.
// - Cliente: o primeiro cliente a que tem acesso (no SAP enquanto está no programa; no Hub depois do D90).
export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });
    // Endereço sap.*: a página inicial é a do Sistema de Aquisição (ela decide entre portfólio e clínica).
    if (ehEnderecoSap()) throw redirect({ to: "/sap" });

    const { data: isAdmin } = await supabase.rpc("is_app_admin");
    if (isAdmin) throw redirect({ to: "/admin" });

    const { data: membership } = await supabase
      .from("client_members")
      .select("client_id")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership) {
      throw redirect({ to: "/sem-acesso" });
    }
    // Clínica dentro do programa (D0 a D90): abre no Sistema de Aquisição. Depois do D90, o Hub é o acompanhamento.
    const { data: sap } = await (supabase as any)
      .from("sap_clinicas")
      .select("d0, status, sap_pausas(id, tipo, inicio, fim, removido_em)")
      .eq("client_id", membership.client_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sap && sap.status !== "encerrada") {
      const dia = diaAtual(sap.d0, pausasValidas(sap.sap_pausas));
      if (dia === null || dia <= 90) throw redirect({ to: "/sap/$clientId", params: { clientId: membership.client_id } });
    }
    throw redirect({ to: "/$clientId", params: { clientId: membership.client_id } });
  },
});
