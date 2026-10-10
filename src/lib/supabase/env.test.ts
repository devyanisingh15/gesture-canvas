import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseConfig, isSupabaseConfigured, SupabaseConfigError } from "./env";

afterEach(() => vi.unstubAllEnvs());

const set = (vars: Record<string, string>) => {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) vi.stubEnv(k, vars[k] ?? "");
};

describe("getSupabaseConfig", () => {
  it("names every missing variable", () => {
    set({});
    expect(() => getSupabaseConfig()).toThrow(SupabaseConfigError);
    expect(() => getSupabaseConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("reads the publishable key, or the legacy anon key", () => {
    set({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" });
    expect(getSupabaseConfig()).toEqual({ url: "https://abc.supabase.co", publishableKey: "sb_publishable_x" });
    set({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJanon" });
    expect(getSupabaseConfig().publishableKey).toBe("eyJanon");
  });

  it("rejects a bad URL and secret keys", () => {
    set({ NEXT_PUBLIC_SUPABASE_URL: "abc", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" });
    expect(() => getSupabaseConfig()).toThrow(/not a valid URL/);
    set({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" });
    expect(() => getSupabaseConfig()).toThrow(/secret key/);
  });
});
