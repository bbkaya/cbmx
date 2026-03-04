// src/auth.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
};

const AuthContext = createContext<AuthState>({ loading: true, session: null, user: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let alive = true;

    async function init() {
      const { data, error } = await supabase.auth.getSession();
      if (error) console.error("getSession error:", error);
      if (!alive) return;
      setSession(data.session ?? null);
      setLoading(false);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    void init();

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    return { loading, session, user: session?.user ?? null };
  }, [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}