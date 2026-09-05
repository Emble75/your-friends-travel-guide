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
const BOOKMARK_W = 8; // Breite des Lesezeichens
const BOOKMARK_GAP = 3; // Abstand zwischen Lesezeichen und Note

/** Das Lesezeichen, an einer frei waehlbaren linken Kante. */
function bookmarkPath(x: number) {
  return `<path d="M${x} 7h${BOOKMARK_W}v11l-4-3.2-4 3.2z" fill="#ffffff"/>`;
}

/*
 * Die Farbe ist entweder eine Flaeche oder zwei -- links und rechts.
 *
 * Zwei Farben braucht der Fall "gemerkt UND bewertet": Der Pin gehoert
 * dann zu beiden Legendeneintraegen, behauptete als einfarbige Flaeche
 * aber nur einen davon. Geteilt traegt jede Angabe ihre eigene
 * Legendenfarbe -- das Lesezeichen sitzt auf Orange, die Note auf Blau --
 * und die Legende erklaert den Pin ohne dritten Eintrag.
 *
 * Nebeneffekt, der die Wahl bestaetigt: die Note steht damit auf Blau
 * (5.18:1) statt auf Orange (3.13:1) und ist erst dadurch sauber lesbar.
 */
type TagColor = string | { left: string; right: string };

function tag(
  color: TagColor,
  opts: { text?: string; glyph?: (w: number) => string; bookmark?: boolean },
) {
  const { text, glyph, bookmark } = opts;
  const textW = text ? text.length * 7.4 : 0;
  const split = typeof color === "string" ? null : color;
  // Beide Haelften tragen Inhalt -- nur dann gilt die geteilte Aufteilung.
  const twoFields = !!split && !!bookmark && !!text;

  /*
   * Zwei Aufteilungen, je nachdem ob die Flaeche geteilt ist:
   *
   * Geteilt: Jede Haelfte ist ein eigenes Feld und wird aus ihrem Inhalt
   * plus gleichem Rand links und rechts berechnet. Dadurch sitzt das
   * Lesezeichen mittig auf Orange und die Note mittig auf Blau. Vorher
   * wurden beide als ein Block zentriert -- dann klebte jedes Zeichen an
   * der Trennkante statt in seinem Feld zu stehen.
   *
   * Einfarbig: unveraendert -- der Inhalt wird als Gruppe zentriert.
   */
  // 6 statt mehr: die Aufteilung der Haelften bleibt bei jedem Randwert
  // praktisch gleich (rund 38/62), es aendert sich nur die Gesamtbreite.
  // Der knappste Wert haelt den Pin auf einer vollen Karte am ruhigsten.
  const HALF_PAD = 6;
  const bookmarkPart = bookmark ? BOOKMARK_W + (text ? BOOKMARK_GAP : 0) : 0;
  const groupW = bookmarkPart + textW;
  const groupStart = (Math.max(text ? 30 : 26, groupW + 18) - groupW) / 2;

  const leftW = BOOKMARK_W + HALF_PAD * 2;
  const rightW = textW + HALF_PAD * 2;

  const width = twoFields ? leftW + rightW : Math.max(text ? 30 : 26, groupW + 18);
  const bookmarkX = twoFields ? (leftW - BOOKMARK_W) / 2 : groupStart;
  const textCx = twoFields ? leftW + rightW / 2 : groupStart + bookmarkPart + textW / 2;
  // Die Trennkante. Bei einfarbigen Pins ohne Bedeutung.
  const splitX = twoFields ? leftW : groupStart + BOOKMARK_W + BOOKMARK_GAP / 2;

  const boxW = width + PAD * 2;
  const boxH = TAG_H + TAG_TAIL + PAD + 2;

  // Die Spitze unten nimmt die Farbe der Haelfte, unter der sie sitzt.
  const tailColor = split ? (width / 2 < splitX ? split.left : split.right) : (color as string);
  const surface = split
    ? `<clipPath id="t"><rect x="0" y="0" width="${width}" height="${TAG_H}" rx="${TAG_R}"/></clipPath>
       <g clip-path="url(#t)">
         <rect x="0" y="0" width="${splitX}" height="${TAG_H}" fill="${split.left}"/>
         <rect x="${splitX}" y="0" width="${width - splitX}" height="${TAG_H}" fill="${split.right}"/>
       </g>
       <rect x="0" y="0" width="${width}" height="${TAG_H}" rx="${TAG_R}" fill="none"
         stroke="#ffffff" stroke-width="1.6"/>`
    : `<rect x="0" y="0" width="${width}" height="${TAG_H}" rx="${TAG_R}" fill="${color as string}"
         stroke="#ffffff" stroke-width="1.6"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}" viewBox="${-PAD} ${-(PAD - 1)} ${boxW} ${boxH}">
    <defs>${SHADOW}</defs>
    <g filter="url(#s)">
      <path d="M${width / 2 - 4.5} ${TAG_H}h9l-4.5 ${TAG_TAIL}z" fill="${tailColor}"/>
      ${surface}
    </g>
    ${bookmark ? bookmarkPath(bookmarkX) : ""}
    ${glyph ? glyph(width) : ""}
    ${
      text
        ? `<text x="${textCx}" y="${TAG_H / 2 + 4.2}" font-family="${FONT_STACK}" font-size="12"
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
 *
 * Trifft beides zu (gemerkt UND bewertet), stehen Lesezeichen und Note
 * nebeneinander. Vorher schloss sich das gegenseitig aus: ein gemerkter
 * Ort verlor auf der eigenen Karte die Note, und ein bewerteter Ort
 * verriet nicht mehr, dass er auf der Wunschliste steht -- man musste
 * ihn antippen, um es herauszufinden.
 */
export function ratingPinIcon(color: string, rating?: number, opts?: { saved?: boolean }) {
  if (typeof rating === "number") {
    if (opts?.saved !== true) return tag(color, { text: rating.toFixed(1) });
    // Beides: geteilte Flaeche, damit der Pin zu beiden Legendeneintraegen
    // gehoert und nicht nur zu dem, dessen Farbe er gerade traegt. Die
    // uebergebene Farbe tritt hier bewusst zurueck -- welche Seite welche
    // Bedeutung hat, darf nicht davon abhaengen, welcher Modus den Pin
    // gerade zeichnet.
    return tag(
      { left: mapColor("saved"), right: mapColor("reviewed") },
      { text: rating.toFixed(1), bookmark: true },
    );
  }
  return tag(color, { bookmark: true });
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
