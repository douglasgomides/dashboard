import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ehEnderecoSap } from "@/lib/marca";

// Página inicial de quem está logado: decide para onde ir (as regras de acesso continuam as mesmas).
// - Admin: painel de administração (no endereço sap.*, o portfólio do Sistema de Aquisição).
// - Cliente: o primeiro cliente a que tem acesso (no endereço sap.*, direto na área do SAP).
export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });
    const sap = ehEnderecoSap();

    const { data: isAdmin } = await supabase.rpc("is_app_admin");
    if (isAdmin) throw redirect({ to: sap ? "/admin/aquisicao" : "/admin" });

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
    if (sap) throw redirect({ to: "/$clientId/sap", params: { clientId: membership.client_id } });
    throw redirect({ to: "/$clientId", params: { clientId: membership.client_id } });
  },
});
