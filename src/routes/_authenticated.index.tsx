import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Sem seletor de cliente na home: manda direto pro primeiro cliente que o
// usuário tem acesso. Com 2 clientes piloto (Fase 1), não vale a pena um
// picker — isso volta quando o onboarding self-service trouxer mais clientes.
export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/login" });

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
