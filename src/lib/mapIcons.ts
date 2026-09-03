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
export function mapColor(role: "reviewed" | "saved" | "search" | "me"): string {
  const fallback = { reviewed: "#325ef5", saved: "#f56333", search: "#2b2724", me: "#325ef5" }[
    role
  ];
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--map-${role}`).trim();
  return value || fallback;
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Weicher Schlagschatten, der den Pin auf der Karte erdet. */
const SHADOW = `<filter id="s" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000000" flood-opacity="0.28"/>
    </filter>`;

const TAG_H = 24; // Hoehe des Etiketts
const TAG_TAIL = 6; // Laenge der Spitze darunter
const TAG_R = 9; // Eckenradius -- zwischen Etikett und klassischem Pin
const PAD = 4; // Rand fuer den Schlagschatten

/**
 * Das Turi-Etikett -- die gemeinsame Grundform aller Kartenmarkierungen.
 *
 * Flach statt plastisch: kein Verlauf, kein Glanz, eine klare Farbflaeche
 * mit weisser Kontur. Die fruehere Tropfenform mit Woelbung sah aus wie
 * die Standardnadel jeder beliebigen Karte; diese Form ist als Turi
 * erkennbar und bleibt trotzdem ruhig genug fuer eine volle Karte.
 *
 * Die Hoehe ist fest, die Breite waechst mit dem Inhalt. Dadurch bilden
 * bewertete Orte (Note), Wunschliste (Lesezeichen) und Suchtreffer
 * (Punkt) sichtbar eine Familie, statt drei unterschiedliche Dinge zu
 * sein. Die kurze Spitze unten markiert weiterhin genau den Ort.
 */
function tag(color: string, opts: { text?: string; glyph?: (w: number) => string }) {
  const { text, glyph } = opts;
  const width = Math.max(text ? 30 : 26, (text ? text.length * 7.4 : 0) + 18);
  const boxW = width + PAD * 2;
  const boxH = TAG_H + TAG_TAIL + PAD + 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}" viewBox="${-PAD} ${-(PAD - 1)} ${boxW} ${boxH}">
    <defs>${SHADOW}</defs>
    <g filter="url(#s)">
      <path d="M${width / 2 - 4.5} ${TAG_H}h9l-4.5 ${TAG_TAIL}z" fill="${color}"/>
      <rect x="0" y="0" width="${width}" height="${TAG_H}" rx="${TAG_R}" fill="${color}"
        stroke="#ffffff" stroke-width="1.6"/>
    </g>
    ${glyph ? glyph(width) : ""}
    ${
      text
        ? `<text x="${width / 2}" y="${TAG_H / 2 + 4.2}" font-family="${FONT_STACK}" font-size="12"
            font-weight="700" letter-spacing="-0.2" fill="#ffffff" text-anchor="middle">${text}</text>`
        : ""
    }
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(boxW, boxH),
    // Die Spitze markiert den Ort -- sie sitzt unten mittig.
    anchor: new google.maps.Point(width / 2 + PAD, TAG_H + TAG_TAIL + (PAD - 1)),
  };
}

/**
 * Ort mit Durchschnittsbewertung -- oder, ohne Bewertung, ein
 * Lesezeichen: so unterscheidet sich ein rein gemerkter Ort auf einen
 * Blick von einem bewerteten, auch bei gleicher Farbe.
 */
export function ratingPinIcon(color: string, rating?: number) {
  if (typeof rating === "number") return tag(color, { text: rating.toFixed(1) });
  return tag(color, {
    glyph: (w) => `<path d="M${w / 2 - 4} 7h8v11l-4-3.2-4 3.2z" fill="#ffffff"/>`,
  });
}

/**
 * Suchtreffer. Gleiche Grundform, nur ein Punkt statt Note oder
 * Lesezeichen -- ein Vorschlag traegt keine Wertung.
 */
export function searchPinIcon(color = mapColor("search")) {
  return tag(color, { glyph: (w) => `<circle cx="${w / 2}" cy="12" r="4" fill="#ffffff"/>` });
}

/**
 * Der eigene Standort -- der bekannte Punkt mit weissem Ring.
 *
 * Bewusst ein KREIS und keine Tropfenform. Die Bewertungspins sind
 * ebenfalls blau; unterschieden wird hier ueber die Gestalt, nicht die
 * Farbe: ein Pin zeigt auf einen Ort, dieser Punkt IST ein Ort. So
 * machen es alle Kartenanwendungen, und es liest sich ohne Erklaerung.
 *
 * Verwendet das helle Markenblau, waehrend die Pins das abgedunkelte
 * tragen -- damit steht der eigene Standort auch farblich fuer sich.
 */
export function currentLocationIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
    <defs><filter id="p" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.6" flood-color="#000000" flood-opacity="0.35"/>
    </filter></defs>
    <circle cx="13" cy="13" r="7.5" fill="#ffffff" filter="url(#p)"/>
    <circle cx="13" cy="13" r="5.2" fill="${mapColor("me")}"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(26, 26),
    anchor: new google.maps.Point(13, 13),
  };
}
