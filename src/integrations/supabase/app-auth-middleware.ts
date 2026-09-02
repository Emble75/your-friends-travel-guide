// Eigene Auth-Middleware (nicht auto-generiert): liest bevorzugt die
// APP_SUPABASE_*-Secrets, damit Server- und Browser-Client gegen dasselbe,
// extern verwaltete Supabase-Projekt laufen. Sonst schlaegt die Token-
// Validierung mit "Unauthorized: Invalid token" fehl.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const requireAppSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env["APP_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
    const SUPABASE_PUBLISHABLE_KEY =
      process.env["APP_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Missing APP_SUPABASE_URL / APP_SUPABASE_PUBLISHABLE_KEY");
    }

    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Unauthorized: No bearer token provided");
    }
    const token = authHeader.slice("Bearer ".length);
    if (token.split(".").length !== 3) {
      throw new Error("Unauthorized: Malformed token");
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw new Error("Unauthorized: Invalid token");
    }

    return next({
      context: { supabase, userId: data.user.id, user: data.user },
    });
  },
);
