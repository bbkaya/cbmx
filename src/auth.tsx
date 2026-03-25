// src/auth.tsx
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import {
  deriveDisplayName,
  ensureProfileExists,
  loadMyProfile,
  type UserProfile,
} from "./collab/profiles";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  displayName: string;
};

const AuthContext = createContext<AuthState>({
  loading: true,
  session: null,
  user: null,
  profile: null,
  displayName: "User",
});

function getPreferredDisplayName(user: User | null): string | null {
  const candidate =
    user?.user_metadata?.display_name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    null;

  const s = String(candidate ?? "").trim();
  return s || null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Prevent older async profile loads from overwriting newer auth state.
  const profileRequestSeq = useRef(0);

  useEffect(() => {
    let alive = true;

    async function syncProfileForSession(currentSession: Session | null) {
      const requestId = ++profileRequestSeq.current;
      const currentUser = currentSession?.user ?? null;

      if (!currentUser?.id || !currentUser.email) {
        if (!alive) return;
        if (requestId !== profileRequestSeq.current) return;
        setProfile(null);
        return;
      }

      try {
        const ensured = await ensureProfileExists({
          userId: currentUser.id,
          email: currentUser.email,
          displayName: getPreferredDisplayName(currentUser),
        });

        if (!alive) return;
        if (requestId !== profileRequestSeq.current) return;
        setProfile(ensured);
        return;
      } catch (err) {
        console.error("ensureProfileExists error:", err);
      }

      try {
        const fallback = await loadMyProfile(currentUser.id);
        if (!alive) return;
        if (requestId !== profileRequestSeq.current) return;
        setProfile(fallback);
      } catch (fallbackErr) {
        console.error("loadMyProfile error:", fallbackErr);
        if (!alive) return;
        if (requestId !== profileRequestSeq.current) return;
        setProfile(null);
      }
    }

    async function init() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("getSession error:", error);
        if (!alive) return;

        const nextSession = data.session ?? null;
        setSession(nextSession);

        // Unblock the app as soon as the auth session is known.
        setLoading(false);

        // Profile hydration should not block the shell/dashboard.
        void syncProfileForSession(nextSession);
      } catch (err) {
        console.error("Auth init failed:", err);
        if (!alive) return;
        setSession(null);
        setProfile(null);
        setLoading(false);
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!alive) return;

      setSession(newSession);

      // Keep the shell responsive during auth transitions too.
      setLoading(false);

      // Clear immediately on sign-out, then hydrate in background on sign-in/refresh.
      if (!newSession?.user) {
        profileRequestSeq.current += 1;
        setProfile(null);
        return;
      }

      void syncProfileForSession(newSession);
    });

    void init();

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    const user = session?.user ?? null;
    const displayName =
      profile?.display_name?.trim() ||
      getPreferredDisplayName(user) ||
      deriveDisplayName(
        profile ?? (user?.email ? { display_name: null, email: user.email } : null),
      );

    return {
      loading,
      session,
      user,
      profile,
      displayName,
    };
  }, [loading, session, profile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}