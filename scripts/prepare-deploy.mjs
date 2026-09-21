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

writeFileSync(path, JSON.stringify(config, null, 2));
console.log(`wrangler.json vorbereitet: ${config.name} -> turiapp.de`);
