// Typisierter Wrapper um den generierten Supabase-Browser-Client.
// Nutzt AppDatabase (inkl. der Tabellen/Spalten des externen Projekts),
// ohne die auto-generierte client.ts zu veraendern.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as generatedSupabase } from "./client";
import type { AppDatabase } from "./app-types";

export const supabase = generatedSupabase as unknown as SupabaseClient<AppDatabase>;
export type { AppDatabase };
