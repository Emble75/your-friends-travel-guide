import { readFileSync, writeFileSync } from "node:fs";

/*
 * Ergaenzt die von Nitro erzeugte Cloudflare-Konfiguration um zwei
 * Dinge, die Nitro nicht wissen kann.
 *
 * Warum ein Skript und keine Datei im Projekt: .output/ wird bei JEDEM
 * Bauen neu erzeugt. Eine von Hand geaenderte Datei dort waere beim
 * naechsten "npm run build" wieder weg -- und der naechste Deploy
 * liefe unter falschem Namen und ohne Domain.
 */
const path = ".output/server/wrangler.json";
const config = JSON.parse(readFileSync(path, "utf8"));

// Ohne festen Namen erzeugt Nitro einen aus Repo und Konto
// ("emble75-your-friends-travel-guide") -- der taucht in Adressen und
// Protokollen auf und aendert sich, sobald das Repo umzieht.
config.name = "turi";

/*
 * Die eigene Domain. "custom_domain" heisst: Cloudflare legt den
 * DNS-Eintrag selbst an und pflegt das Zertifikat -- deshalb muss dort
 * kein A-Eintrag von Hand stehen (ein vorhandener Platzhalter wird
 * ersetzt).
 */
config.routes = [
  { pattern: "turiapp.de", custom_domain: true },
  { pattern: "www.turiapp.de", custom_domain: true },
];

/*
 * Die beiden oeffentlichen Supabase-Werte aus der lokalen .env
 * mitgeben, damit sie nicht von Hand im Cloudflare-Dashboard stehen
 * muessen. Beide landen ohnehin im Browser des Nutzers (die Adresse des
 * Projekts und der "publishable"-Schluessel, der nur das darf, was die
 * RLS-Regeln erlauben) -- sie sind keine Geheimnisse.
 *
 * Bewusst eine feste Liste und kein Durchreichen der ganzen .env: so
 * kann kein echter Schluessel versehentlich in die Konfiguration
 * rutschen. Service-Role-Key, LOVABLE_API_KEY und GOOGLE_MAPS_API_KEY
 * gehoeren als "Secret" ins Cloudflare-Dashboard, nirgendwo sonst hin.
 */
const PUBLIC_VARS = {
  APP_SUPABASE_URL: ["APP_SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL"],
  APP_SUPABASE_PUBLISHABLE_KEY: [
    "APP_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  ],
};

function readEnvFile() {
  let raw;
  try {
    raw = readFileSync(".env", "utf8");
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readEnvFile();
const vars = { ...(config.vars ?? {}) };
const missing = [];

for (const [target, candidates] of Object.entries(PUBLIC_VARS)) {
  const value = candidates.map((name) => env[name]).find(Boolean);
  if (value) vars[target] = value;
  else missing.push(target);
}

if (Object.keys(vars).length > 0) config.vars = vars;

writeFileSync(path, JSON.stringify(config, null, 2));
console.log(`wrangler.json vorbereitet: ${config.name} -> turiapp.de`);
console.log(`Mitgegeben: ${Object.keys(vars).join(", ") || "nichts"}`);
if (missing.length > 0) {
  console.warn(
    `Achtung: in .env nicht gefunden: ${missing.join(", ")} -- ` +
      `diese Werte muessen dann im Cloudflare-Dashboard stehen.`,
  );
}
