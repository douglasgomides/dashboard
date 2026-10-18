import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createAuthSessionController, INITIAL_AUTH_STATE, type AuthState } from "@/lib/auth-session";

const AuthContext = createContext<AuthState>(INITIAL_AUTH_STATE);

async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_app_admin");
  if (error) return false;
  return data === true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(INITIAL_AUTH_STATE);

  useEffect(() => {
    const controller = createAuthSessionController({ fetchIsAdmin, clearCache: () => queryClient.clear(), publish: setState });
    let receivedEvent = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedEvent = true;
      controller.accept(session);
    });
    // A later auth notification wins over this initial snapshot.
    void supabase.auth.getSession().then(({ data }) => {
      if (!receivedEvent) controller.accept(data.session);
    }).catch(() => {
      if (!receivedEvent) controller.accept(null);
    });

    return () => {
      controller.dispose();
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
