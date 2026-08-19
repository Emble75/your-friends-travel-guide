// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Erweitert die von Vite ins Frontend durchgereichten Env-Var-Praefixe um
  // "APP_" (zusaetzlich zum Standard "VITE_"). Dadurch koennen wir eigene,
  // nicht von Lovable reservierte Secret-Namen (APP_SUPABASE_URL,
  // APP_SUPABASE_PUBLISHABLE_KEY) im Browser-Code nutzen, ohne die
  // auto-generierte .env-Datei anzufassen.
  vite: {
    envPrefix: ["VITE_", "APP_"],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
