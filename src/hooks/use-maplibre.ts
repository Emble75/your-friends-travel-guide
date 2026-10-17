import { useEffect, useState } from "react";

import type * as MapLibre from "maplibre-gl";

/*
 * Laedt die Kartenbibliothek -- erst dann, wenn eine Karte gebraucht
 * wird.
 *
 * MapLibre wiegt gut 200 KB. Als normaler Import laege es im ersten
 * Paket, das jeder Besucher herunterlaedt, auch wer nur den Feed liest
 * oder sich gerade erst anmeldet. Als dynamischer Import kommt es, wenn
 * die erste Karte oeffnet, und danach aus dem Zwischenspeicher.
 *
 * Das Versprechen wird EINMAL angelegt und geteilt: Oeffnen sich zwei
 * Karten gleichzeitig (Profil und Vorschau), soll die Bibliothek nicht
 * zweimal kommen.
 */
let loadPromise: Promise<typeof MapLibre> | null = null;

export function loadMapLibre(): Promise<typeof MapLibre> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const [lib] = await Promise.all([
        import("maplibre-gl"),
        // Ohne das Stylesheet zeichnet MapLibre die Leinwand, aber
        // weder Bedienelemente noch Marker sitzen richtig.
        import("maplibre-gl/dist/maplibre-gl.css"),
      ]);
      /*
       * Der Hintergrund-Arbeiter wird unveraendert mit ausgeliefert
       * (siehe scripts/sync-map-worker.mjs) und hier benannt.
       *
       * MapLibre sucht ihn sonst neben seiner eigenen gebuendelten
       * Datei, wo er nicht liegt. Das Kartenbild wird VOLLSTAENDIG in
       * diesem Arbeiter berechnet: Ohne ihn laedt die Bibliothek, der
       * Stil kommt an, Marker erscheinen -- aber es wird nie eine
       * einzige Kachel angefordert, und zwar ohne Fehlermeldung.
       */
      lib.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      return lib;
    })();
  }
  return loadPromise;
}

/**
 * Meldet, sobald die Kartenbibliothek bereit ist.
 *
 * Gleiche Form wie der frühere Google-Haken (ready/error), damit die
 * Bildschirme unveraendert damit arbeiten koennen.
 */
export function useMapLibre() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadMapLibre()
      .then(() => active && setReady(true))
      .catch(() => active && setError("Karte konnte nicht geladen werden"));
    return () => {
      active = false;
    };
  }, []);

  return { ready, error };
}
