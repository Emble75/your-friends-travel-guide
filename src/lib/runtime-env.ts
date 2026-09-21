/**
 * Liest eine Umgebungsvariable zur Laufzeit -- egal, auf welcher Plattform
 * der Server gerade laeuft.
 *
 * Warum das noetig ist: Auf Cloudflare Workers gibt es kein Node. Die in
 * der Oberflaeche hinterlegten Werte ("Variables and Secrets") kommen dort
 * nicht ueber `process.env`, sondern als zweites Argument `env` an den
 * fetch-Handler. Nitro legt dieses Objekt als `globalThis.__env__` ab
 * (siehe .output/server/index.mjs).
 *
 * Lokal und in `wrangler dev` ist `process.env` gefuellt, in der echten
 * Cloudflare-Umgebung war es leer -- Folge: die App fand ihre
 * Supabase-Zugangsdaten nicht und fiel stumm auf die zur Bauzeit
 * eingebackenen, teils veralteten VITE_-Werte zurueck.
 *
 * Reihenfolge bewusst so: process.env zuerst (lokal, Tests, Node-Hosting),
 * danach die Cloudflare-Bindings.
 */
export function runtimeEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const fromProcess =
      typeof process !== "undefined" && process.env ? process.env[name] : undefined;
    if (fromProcess) return fromProcess;
  }

  const bindings = (globalThis as { __env__?: Record<string, unknown> }).__env__;
  if (!bindings) return undefined;

  for (const name of names) {
    const value = bindings[name];
    if (typeof value === "string" && value) return value;
  }

  return undefined;
}
