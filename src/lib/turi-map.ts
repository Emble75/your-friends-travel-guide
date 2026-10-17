import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

/*
 * Die Karte -- OpenStreetMap statt Google.
 *
 * WARUM DER WECHSEL: Das Kartenbild war der groesste laufende Posten.
 * Es wird bei JEDEM Oeffnen geladen, waehrend die Ortssuche nur beim
 * Suchen kostet. Googles Karte sieht ausserdem in jeder App der Welt
 * gleich aus -- bei einer App, deren Kern eine Karte ist, ist das die
 * teuerste Stelle, an der man austauschbar wirkt.
 *
 * WAS BLEIBT: Die Ortsdaten kommen weiterhin von Google (Name, Adresse,
 * Kennung). OSM kennt zwar viele Cafes, aber unvollstaendig und oft
 * ohne Namen -- und jede Bewertung in unserer Datenbank haengt an einer
 * Google-Orts-Kennung. Gewechselt wird also nur, was gezeichnet wird,
 * nicht, was gewusst wird.
 *
 * KACHELN: OpenFreeMap. Kein Schluessel, keine Anmeldung, keine
 * Abrechnung -- getragen von Spenden. Fuer den Start genau richtig; bei
 * ernsthaften Nutzerzahlen gehoert ein Vertrag her (MapTiler o. ae.),
 * dann aendert sich nur die Adresse unten.
 */
export const TILE_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/*
 * Umfaerben statt neu zeichnen.
 *
 * Einen OSM-Stil von Grund auf zu schreiben sind hunderte Ebenen --
 * Strassenklassen, Grenzen, Beschriftungen, alles in sechs Zoomstufen.
 * "Positron" ist bereits ein heller, zurueckgenommener Stil; es fehlt
 * nur, dass er nach Turi aussieht statt nach Standard-Grau.
 *
 * Geaendert wird deshalb gezielt, was den Grundton traegt: Papier statt
 * Weiss, Lagune statt Blaugrau fuer Wasser, waermeres Grau fuer
 * Strassen und Gebaeude. Beschriftungen bleiben, wie sie sind -- sie
 * sind das Einzige auf der Karte, das gelesen werden muss.
 */
const PAPER = "#F4F2EC";
const WATER = "#E2EEEE";
const ROAD = "#FBFAF7";
const ROAD_CASING = "#E6E3DC";
const BUILDING = "#EFEDE6";
const GREEN = "#E9EDE2";

/**
 * Passt einen geladenen Stil an die Palette an.
 *
 * Arbeitet ueber die Ebenen des Stils statt ueber feste Ebenennamen:
 * OpenFreeMap benennt sie anders als MapTiler, und ein hart
 * eingetragener Name waere beim naechsten Stil-Update stumm kaputt --
 * die Karte saehe dann wieder aus wie von der Stange, ohne Fehler.
 */
export function applyTuriPalette(map: MapLibreMap): void {
  const style = map.getStyle() as StyleSpecification | undefined;
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id;
    try {
      if (layer.type === "background") {
        map.setPaintProperty(id, "background-color", PAPER);
        continue;
      }

      if (/water|ocean|sea|river|lake/i.test(id)) {
        if (layer.type === "fill") map.setPaintProperty(id, "fill-color", WATER);
        if (layer.type === "line") map.setPaintProperty(id, "line-color", WATER);
        continue;
      }

      if (/park|wood|forest|grass|green|landcover|landuse/i.test(id) && layer.type === "fill") {
        map.setPaintProperty(id, "fill-color", GREEN);
        continue;
      }

      if (/building/i.test(id) && layer.type === "fill") {
        map.setPaintProperty(id, "fill-color", BUILDING);
        map.setPaintProperty(id, "fill-outline-color", ROAD_CASING);
        continue;
      }

      if (/road|street|highway|bridge|tunnel|transport/i.test(id) && layer.type === "line") {
        // Umrandung dunkler als die Fahrbahn: Ohne sie verschwimmen
        // Strassen auf hellem Grund zu einem einzigen Flaechenbrei.
        map.setPaintProperty(id, "line-color", /casing|outline/i.test(id) ? ROAD_CASING : ROAD);
        continue;
      }
    } catch {
      // Eine Ebene, die diese Eigenschaft nicht kennt, ueberspringen --
      // ein Stil-Update soll die Karte nicht lahmlegen.
    }
  }
}

/**
 * Die Ebenen, in denen die Kacheln ihre Orte fuehren.
 *
 * Googles Karte lieferte anklickbare Symbole frei Haus. Bei OSM liegen
 * sie in der Quell-Ebene "poi" -- wir fragen also beim Tippen, was an
 * dieser Stelle gezeichnet ist, und nehmen den ersten Treffer mit
 * Namen.
 */
export function poiAt(
  map: MapLibreMap,
  point: { x: number; y: number },
): { name: string; lat: number; lng: number } | null {
  /*
   * Ein kleines Quadrat statt eines Punktes: Ein Finger trifft kein
   * Pixel. 8 Punkte in jede Richtung entsprechen etwa der Flaeche, die
   * ein Symbol auf der Karte einnimmt.
   */
  const box: [[number, number], [number, number]] = [
    [point.x - 8, point.y - 8],
    [point.x + 8, point.y + 8],
  ];

  let features;
  try {
    features = map.queryRenderedFeatures(box);
  } catch {
    return null;
  }

  for (const feature of features ?? []) {
    const layer = (feature as { sourceLayer?: string }).sourceLayer;
    if (layer !== "poi") continue;
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const name = typeof props["name"] === "string" ? props["name"] : null;
    if (!name) continue;
    const geometry = feature.geometry;
    if (geometry.type !== "Point") continue;
    const [lng, lat] = geometry.coordinates as [number, number];
    return { name, lat, lng };
  }
  return null;
}
