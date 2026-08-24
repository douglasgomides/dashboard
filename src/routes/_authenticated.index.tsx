import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Admin vai direto pro painel de administração (lista todos os clientes).
// Cliente comum vai direto pro único cliente que ele tem acesso — com 1-2
// clientes piloto não vale a pena um picker.
export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });

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
