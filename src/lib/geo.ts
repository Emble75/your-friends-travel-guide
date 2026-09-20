/**
 * Entfernung zwischen zwei Koordinaten in Metern (Haversine).
 *
 * Bewusst selbst gerechnet und nicht bei Google angefragt: Die
 * Luftlinie genuegt fuer "ist das hier um die Ecke oder am anderen Ende
 * der Stadt", kostet nichts und braucht kein Netz. Eine echte
 * Wegstrecke (Distance Matrix) waere eine kostenpflichtige Anfrage pro
 * Ort -- bei einer Liste mit dreissig Eintraegen also dreissig.
 */
export function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Entfernung als kurzer Text: "280 m", "1.4 km", "12 km".
 *
 * Unter einem Kilometer auf 10 m gerundet -- eine Luftlinie auf den
 * Meter genau anzugeben taeuscht eine Praezision vor, die sie nicht hat.
 */
export function distanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}
