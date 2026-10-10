"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseConfig } from "./env";

let browserClient: SupabaseClient<Database> | undefined;

/**
 * Supabase client for Client Components and browser code (e.g. Realtime).
 * One instance is shared per tab. Throws SupabaseConfigError if the
 * environment variables are missing.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (!browserClient) {
    const { url, publishableKey } = getSupabaseConfig();
    browserClient = createBrowserClient<Database>(url, publishableKey);
  }
  return browserClient;
}
