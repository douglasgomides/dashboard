import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ehEnderecoSap } from "@/lib/marca";

// Página inicial de quem está logado: decide para onde ir (as regras de acesso continuam as mesmas).
// - Endereço sap.*: o Sistema de Aquisição (/sap), produto separado do Hub.
// - Admin: painel de administração do Hub.
// - Cliente: o primeiro cliente a que tem acesso.
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
    throw redirect({ to: "/$clientId", params: { clientId: membership.client_id } });
  },
});
