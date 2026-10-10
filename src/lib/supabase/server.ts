import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./env";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Create one per request (it reads that request's cookies). Uses the
 * publishable key, so database access follows row-level security.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const { url, publishableKey } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies. Harmless until sign-in is added,
          // at which point a middleware refreshes the session cookies.
        }
      },
    },
  });
}
