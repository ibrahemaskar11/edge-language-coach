import { create } from "zustand";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { apiFetch } from "./api";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  setAuth: (session: Session | null) => void;
  initialize: () => () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,

  setAuth: (session) =>
    set({ session, user: session?.user ?? null, loading: false }),

  initialize: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, loading: false });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });
    });

    return () => subscription.unsubscribe();
  },
}));

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(
  email: string,
  password: string,
  profile: { fullName: string; dateOfBirth: string }
) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  if (data.user) {
    await apiFetch("/auth/callback", {
      method: "POST",
      body: JSON.stringify({
        userId: data.user.id,
        email: data.user.email,
        fullName: profile.fullName,
        dateOfBirth: profile.dateOfBirth,
      }),
    });
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
