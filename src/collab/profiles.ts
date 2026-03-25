// src/collab/profiles.ts
import { supabase } from "../supabaseClient";

export type UserProfile = {
  id: string;
  email: string;
  display_name: string | null;
  created_at?: string;
  updated_at?: string;
};

function normalizeDisplayName(input: string | null | undefined): string | null {
  const v = String(input ?? "").trim();
  return v ? v : null;
}

function fallbackDisplayNameFromEmail(email: string | null | undefined): string {
  const raw = String(email ?? "").trim();
  if (!raw) return "User";
  const at = raw.indexOf("@");
  return at > 0 ? raw.slice(0, at) : raw;
}

export function deriveDisplayName(profile: Pick<UserProfile, "display_name" | "email"> | null | undefined): string {
  if (profile?.display_name?.trim()) return profile.display_name.trim();
  return fallbackDisplayNameFromEmail(profile?.email);
}

export async function ensureProfileExists(args: {
  userId: string;
  email: string;
  displayName?: string | null;
}): Promise<UserProfile> {
  const email = String(args.email ?? "").trim().toLowerCase();
  const display_name = normalizeDisplayName(args.displayName);

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: args.userId,
        email,
        display_name,
      },
      { onConflict: "id" }
    )
    .select("id, email, display_name, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not ensure user profile.");
  }

  return data as UserProfile;
}

export async function loadMyProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not load profile.");
  }

  return (data as UserProfile | null) ?? null;
}