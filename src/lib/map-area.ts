import type { MapPlace } from "./maps.server";

/*
 * Stadt oder Ort?
 *
 * Googles Suche beantwortet beide Fragen mit demselben Ergebnistyp --
 * "Lissabon" und "Honest Greens" kommen gleich zurueck. Fuer die Karte
 * ist der Unterschied aber entscheidend: Bei einer Stadt soll sie
 * hinzoomen, bei einem Ort ihn oeffnen beziehungsweise nah heranfahren.
 *
 * Die Unterscheidung stand lange nur in map.tsx. Seit auch die Karten
 * von Profilen und Ordnern suchen koennen, wird sie an zwei Stellen
 * gebraucht -- und zwei Kopien derselben Liste driften auseinander.
 */
const AREA_TYPES = new Set([
  "locality",
  "sublocality",
  "sublocality_level_1",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "country",
  "postal_town",
  "neighborhood",
]);

/**
 * Sieht der Treffer nach einer Stadt oder Region aus?
 *
 * Ohne erkannten Typ ODER ohne genaue Adresse ist es vermutlich ein
 * Gebiet, auch wenn sein Typ nicht in der Liste steht -- ein einzelnes
 * Lokal hat immer eine Adresse.
 */
export function looksLikeArea(place: Pick<MapPlace, "rawType" | "address">): boolean {
  return !place.rawType || AREA_TYPES.has(place.rawType) || !place.address;
}

/** Die Zoomstufe, die zu einem Treffer passt. */
export function zoomForPlace(place: Pick<MapPlace, "rawType" | "address">): number {
  // 12 zeigt eine Stadt mit ihrem Umland, 15 eine Strasse mit Nachbarschaft.
  return looksLikeArea(place) ? 12 : 15;
}
