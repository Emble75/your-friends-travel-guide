import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

/*
 * Kopiert MapLibres Hintergrund-Arbeiter nach public/.
 *
 * WARUM NICHT EINFACH IMPORTIEREN: MapLibre sucht den Arbeiter ueber
 * import.meta.url neben seiner eigenen Datei. Im gebuendelten Zustand
 * liegt dort nichts, und die Karte bleibt grau -- ohne Fehlermeldung,
 * weil das Zeichnen vollstaendig in diesem Arbeiter passiert und
 * schlicht nie beginnt.
 *
 * Die Wege ueber den Bundler ("?worker&url", worker.format) fuehrten
 * beide zu einer Datei, die der Browser nicht startet. Der Arbeiter ist
 * in dieser Version ohnehin in sich geschlossen (keine Importe), also
 * wird er einfach unveraendert mit ausgeliefert und ueber setWorkerUrl
 * benannt.
 *
 * Laeuft vor jedem Bauen, damit ein Versionssprung von maplibre-gl
 * nicht stillschweigend einen veralteten Arbeiter zurueckla'esst.
 */
const from = "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs";
const to = "public/maplibre/maplibre-gl-worker.mjs";

mkdirSync("public/maplibre", { recursive: true });
copyFileSync(from, to);

const size = readFileSync(to).length;
console.log(`Karten-Arbeiter kopiert: ${(size / 1024).toFixed(0)} KB`);
