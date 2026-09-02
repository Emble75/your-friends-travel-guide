/*
 * Karten-Pins.
 *
 * Alle Pins werden in einem lokalen 34x44-Raster gezeichnet, die viewBox
 * ist aber ringsum groesser: der Schlagschatten braucht Platz, sonst
 * schneidet ihn der Bildrand ab. Der Ankerpunkt (die Spitze) verschiebt
 * sich dadurch entsprechend -- siehe anchor unten.
 *
 * Schrift bewusst als System-Stack: eine SVG-Grafik in einer data-URL hat
 * keinen Zugriff auf die Webfonts der Seite, "Plus Jakarta Sans" waere
 * hier also wirkungslos und fiele ohnehin auf die Systemschrift zurueck.
 */

/**
 * Die drei Kartenfarben, gelesen aus dem Design-System.
 *
 * Sie stehen in styles.css und werden hier zur Laufzeit ausgelesen, damit
 * es nur EINE Quelle gibt -- vorher lagen dieselben Hex-Werte zwoelfmal
 * ueber vier Dateien verstreut. Der Rueckfallwert greift beim
 * serverseitigen Rendern, wo es kein document gibt.
 */
export function mapColor(role: "friends" | "saved" | "mine"): string {
  const fallback = { friends: "#c20077", saved: "#3b7a8c", mine: "#2b2724" }[role];
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--map-${role}`).trim();
  return value || fallback;
}

const PAD_X = 3;
const PAD_Y = 2;
const PIN_W = 34;
const PIN_H = 44;
const BOX_W = PIN_W + PAD_X * 2;
const BOX_H = PIN_H + PAD_Y * 2;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Weicher Schlagschatten, der den Pin auf der Karte erdet. */
const SHADOW = `<filter id="s" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.4" flood-color="#000000" flood-opacity="0.32"/>
    </filter>`;

/*
 * Tropfenform: Kreis oben, spitz zulaufend nach unten.
 *
 * Die Spitze bleibt bewusst scharf (die beiden Kurven treffen sich in
 * einem Punkt), denn genau sie markiert den Ort auf der Karte. Eine
 * abgerundete Spitze sieht weicher aus, macht aber unklar, worauf der
 * Pin eigentlich zeigt.
 */
const PIN_PATH = "M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z";

function wrap(inner: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BOX_W}" height="${BOX_H}" viewBox="${-PAD_X} ${-PAD_Y} ${BOX_W} ${BOX_H}">
    <defs>${SHADOW}</defs>
    ${inner}
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(BOX_W, BOX_H),
    // Die Spitze sitzt im lokalen Raster bei (17, 44) -- durch die
    // Randzugabe verschiebt sie sich im Bild um den Rand nach hinten.
    anchor: new google.maps.Point(17 + PAD_X, PIN_H + PAD_Y),
  };
}

/**
 * Pin mit der Durchschnittsbewertung im Kreis -- oder ohne Zahl, falls
 * (noch) keine Bewertung vorliegt (z. B. rein gemerkte "Will ich noch
 * hin"-Orte). Wird auf der Hauptkarte und der Mini-Karte im Profil
 * verwendet.
 */
export function ratingPinIcon(color: string, rating?: number) {
  const label = typeof rating === "number" ? rating.toFixed(1) : "";
  // Ohne Zahl ein kleinerer Punkt: ein grosser leerer Kreis sieht aus wie
  // ein Pin, dem die Beschriftung fehlt.
  const radius = label ? 10.5 : 5;
  return wrap(`
    <path d="${PIN_PATH}" fill="${color}" stroke="#ffffff" stroke-width="2" filter="url(#s)"/>
    <circle cx="17" cy="16.5" r="${radius}" fill="#ffffff"/>
    ${
      label
        ? `<text x="17" y="20.6" font-family="${FONT_STACK}" font-size="11.5" font-weight="700" letter-spacing="-0.3" fill="${color}" text-anchor="middle">${label}</text>`
        : ""
    }
  `);
}

/**
 * Marker fuer Suchtreffer -- etwa alle Aldi-Filialen in der Umgebung.
 *
 * Bewusst schlanker als ratingPinIcon und mit vollflaechigem Punkt statt
 * Bewertungskreis. Ein Suchtreffer ist ein Vorschlag, keine Bewertung --
 * er soll die Pins von Freunden (magenta, mit Note) und die Wunschliste
 * (teal) nicht nachahmen.
 */
export function searchPinIcon(color = mapColor("mine")) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="-3 -2 32 40">
    <defs>${SHADOW}</defs>
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9.2 13 21 13 21s13-11.8 13-21C26 5.8 20.2 0 13 0z"
      fill="${color}" stroke="#ffffff" stroke-width="2" filter="url(#s)"/>
    <circle cx="13" cy="12.5" r="4.5" fill="#ffffff"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(32, 40),
    anchor: new google.maps.Point(16, 36),
  };
}
