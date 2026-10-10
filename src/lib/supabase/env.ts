/**
 * Supabase settings from the environment. Only the project URL and the
 * publishable (anon) key are read here: both are safe to ship to browsers.
 * Secret and service-role keys are never read by these utilities.
 *
 * NEXT_PUBLIC_* variables must be referenced literally so Next.js can inline
 * them into the browser bundle.
 */
export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export class SupabaseConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `Supabase is not configured: set ${missing.join(" and ")} in .env.local (see .env.example), then restart the dev server.`,
    );
    this.name = "SupabaseConfigError";
  }
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  // NEXT_PUBLIC_SUPABASE_ANON_KEY is the older name for the same public key.
  const publishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publishableKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (missing.length > 0) throw new SupabaseConfigError(missing);

  try {
    new URL(url!);
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: "${url}". It should look like https://<project-ref>.supabase.co.`);
  }
  if (/^(sb_secret_|service_role)/.test(publishableKey!)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a secret key. Use the publishable (anon) key; secret keys must never be public.");
  }
  return { url: url!, publishableKey: publishableKey! };
}

/** True when both variables are set, for code that can run without Supabase. */
export function isSupabaseConfigured(): boolean {
  try {
    getSupabaseConfig();
    return true;
  } catch {
    return false;
  }
}
