import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseConfig } from "./env";

/**
 * Supabase client with the project's secret key, for trusted server work that
 * players must not be able to do themselves (today: recording round scores).
 *
 * Server only. The key comes from SUPABASE_SECRET_KEY (or the older
 * SUPABASE_SERVICE_ROLE_KEY), which is never a NEXT_PUBLIC_ variable, so it is
 * never sent to browsers. Returns null when the key isn't set; callers then
 * fall back to what works without it.
 */
export function getSupabaseAdminClient(): SupabaseClient<Database> | null {
  if (typeof window !== "undefined") throw new Error("The Supabase secret key can only be used on the server.");
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!key) return null;
  // SUPABASE_URL lets the server reach the project by another address (e.g. inside a private network).
  const url = process.env.SUPABASE_URL?.trim() || getSupabaseConfig().url;
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
