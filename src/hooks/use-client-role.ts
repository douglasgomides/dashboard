import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

// Papel do usuário neste cliente. Só lê (a regra de acesso continua no banco):
// serve para a interface priorizar o que cada perfil precisa e esconder botões
// de edição de quem não pode editar.
export type Papel = "admin" | "owner" | "strategist" | "viewer";

export function useClientRole(clientId: string): { papel: Papel | null; podeEditar: boolean; carregando: boolean } {
  const { user, isAdmin } = useAuth();
  const q = useQuery({
    queryKey: ["papel", clientId, user?.id],
    enabled: !!user && !isAdmin,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("client_members").select("role").eq("client_id", clientId).eq("user_id", user!.id).maybeSingle();
      if (error) return null;
      return ((data as { role?: string } | null)?.role ?? null) as Papel | null;
    },
  });
  const papel: Papel | null = isAdmin ? "admin" : (q.data ?? null);
  return { papel, podeEditar: papel === "admin" || papel === "owner" || papel === "strategist", carregando: !isAdmin && q.isLoading };
}
