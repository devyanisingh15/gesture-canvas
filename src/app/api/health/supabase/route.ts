import { getSupabaseConfig, SupabaseConfigError } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health/supabase: checks the Supabase settings and that the project
 * accepts the publishable key. Returns no secrets. Needs no tables.
 */
export async function GET() {
  try {
    await createSupabaseServerClient();
    const { url, publishableKey } = getSupabaseConfig();
    const host = new URL(url).host;
    let response: Response;
    try {
      response = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: publishableKey },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      return Response.json({ ok: false, project: host, error: `Couldn't reach ${host}. Check the project URL and your network.` }, { status: 502 });
    }
    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403 ? "Supabase rejected the publishable key." : `Supabase answered ${response.status}.`;
      return Response.json({ ok: false, project: host, error: reason }, { status: 502 });
    }
    return Response.json({ ok: true, project: host });
  } catch (error) {
    const message =
      error instanceof SupabaseConfigError || error instanceof Error ? error.message : "Couldn't reach Supabase.";
    return Response.json({ ok: false, error: message }, { status: error instanceof SupabaseConfigError ? 500 : 502 });
  }
}
