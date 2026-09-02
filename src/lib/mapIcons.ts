/**
 * Erzeugt eine Pin-Icon-URL (wie bei Google Maps) mit der Durchschnitts-
 * bewertung klein im Kreis -- oder ohne Zahl, falls (noch) keine
 * Bewertung vorliegt (z. B. rein gemerkte "Will ich noch hin"-Orte).
 * Wird sowohl auf der Hauptkarte als auch auf der Mini-Karte im Profil
 * verwendet.
 */
export function ratingPinIcon(color: string, rating?: number) {
  const label = typeof rating === "number" ? rating.toFixed(1) : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
    <path d="M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
    <circle cx="17" cy="16.5" r="11" fill="#ffffff"/>
    ${label ? `<text x="17" y="20.5" font-family="Arial, Helvetica, sans-serif" font-size="10.5" font-weight="700" fill="${color}" text-anchor="middle">${label}</text>` : ""}
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(34, 44),
    anchor: new google.maps.Point(17, 44),
  };
}

/**
 * Marker fuer Suchtreffer auf der Karte -- etwa alle Aldi-Filialen in der
 * Umgebung, wenn nach einer Kette gesucht wurde.
 *
 * Bewusst anders geformt als ratingPinIcon: kleiner und mit vollflaechigem
 * Punkt statt Bewertungskreis. Ein Suchtreffer ist ein Vorschlag, keine
 * Bewertung -- er soll die Pins von Freunden (orange, mit Zahl) und die
 * Wunschliste (teal) nicht nachahmen, sondern klar als "das hast du
 * gerade gesucht" lesbar sein.
 */
export function searchPinIcon(color = "#2B2724") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9.2 13 21 13 21s13-11.8 13-21C26 5.8 20.2 0 13 0z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
    <circle cx="13" cy="12.5" r="4.5" fill="#ffffff"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(26, 34),
    anchor: new google.maps.Point(13, 34),
  };
}
