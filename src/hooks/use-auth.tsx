import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, session: null, loading: true, isAdmin: false });

async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_app_admin");
  if (error) return false;
  return data === true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, session: null, loading: true, isAdmin: false });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user ?? null;
      const isAdmin = user ? await fetchIsAdmin() : false;
      setState({ user, session: data.session, loading: false, isAdmin });
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user ?? null;
      const isAdmin = user ? await fetchIsAdmin() : false;
      setState({ user, session, loading: false, isAdmin });
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
