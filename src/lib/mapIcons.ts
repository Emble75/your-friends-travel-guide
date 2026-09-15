/*
 * Karten-Pins.
 *
 * Schrift bewusst als System-Stack: eine SVG-Grafik in einer data-URL hat
 * keinen Zugriff auf die Webfonts der Seite, "Plus Jakarta Sans" waere
 * hier also wirkungslos und fiele ohnehin auf die Systemschrift zurueck.
 */

/**
 * Die Kartenfarben, gelesen aus dem Design-System (styles.css), damit es
 * nur EINE Quelle gibt. Der Rueckfallwert greift beim serverseitigen
 * Rendern, wo es kein document gibt.
 */
export function mapColor(role: "pin" | "accent" | "me"): string {
  const fallback = { pin: "#161311", accent: "#4c7aff", me: "#325ef5" }[role];
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--map-${role}`).trim();
  return value || fallback;
}

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const H = 22; // Hoehe der Pille
const TAIL = 7; // Laenge der Spitze darunter
const PAD_X = 7.5; // Rand links und rechts des Inhalts
const GAP = 3; // Abstand zwischen Zeichen und Note
const GLYPH_W = 8; // Breite von Lesezeichen und Lupe
const EDGE = 4; // Luft ringsum fuer den Schatten

/** Das Lesezeichen -- "da will ich noch hin". */
function bookmark(x: number, fill: string) {
  return `<path d="M${x} ${H / 2 - 4.8}h${GLYPH_W}v10l-4 -2.9-4 2.9z" fill="${fill}"/>`;
}

/** Die Lupe -- markiert einen Treffer aus der Suche. */
function magnifier(x: number, stroke: string) {
  const cx = x + 3.4;
  const cy = H / 2 - 0.8;
  return `<g fill="none" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round">
    <circle cx="${cx}" cy="${cy}" r="3.1"/>
    <path d="M${cx + 2.3} ${cy + 2.3}L${cx + 4.6} ${cy + 4.6}"/>
  </g>`;
}

/*
 * Die Pille -- die einzige Grundform auf der Karte.
 *
 * EIN FARBMODELL FUER ALLES: Die Flaeche ist immer tintenschwarz, die
 * Note immer weiss, und Blau ist ausschliesslich das Lesezeichen darin.
 * Vorher trug jede Rolle ihre eigene Flaechenfarbe, und ein Ort, der
 * bewertet UND gemerkt war, brauchte eine geteilte Flaeche mit einer
 * Naht in der Mitte. Das faellt jetzt alles weg: dieselbe schwarze
 * Pille, einmal mit Note, einmal mit Lesezeichen, einmal mit beidem.
 *
 * Warum Schwarz: Googles Karte benutzt praktisch kein Schwarz. Eine
 * tintenschwarze Pille liest sich deshalb sofort als unsere -- die
 * frueheren blauen und orangen Pins konkurrierten dagegen direkt mit
 * Googles eigenen Symbolen (Einkaufen blau, Gastronomie orange).
 *
 * Der Inhalt wird als Gruppe zentriert, die Breite waechst mit ihm; die
 * Hoehe steht fest. Die kurze Spitze unten markiert genau den Ort.
 */
function pill(opts: {
  text?: string;
  glyph?: "bookmark" | "magnifier";
  /** Weisse Pille mit dunklem Rand statt gefuellter -- fuer Suchtreffer. */
  outline?: boolean;
}) {
  const { text, glyph, outline } = opts;
  const ink = mapColor("pin");
  const bg = outline ? "#ffffff" : ink;
  const fg = outline ? ink : "#ffffff";

  const textW = text ? text.length * 7 : 0;
  const glyphW = glyph ? GLYPH_W : 0;
  const gap = glyph && text ? GAP : 0;
  const contentW = glyphW + gap + textW;
  const width = Math.max(H, PAD_X * 2 + contentW);
  const startX = (width - contentW) / 2;

  const boxW = width + EDGE * 2;
  const boxH = H + TAIL + EDGE * 2;

  let inner = "";
  if (glyph === "bookmark") inner += bookmark(startX, mapColor("accent"));
  if (glyph === "magnifier") inner += magnifier(startX, fg);
  if (text) {
    const cx = startX + glyphW + gap + textW / 2;
    inner += `<text x="${cx}" y="${H / 2 + 4}" font-family="${FONT_STACK}" font-size="11.5"
      font-weight="700" letter-spacing="-0.2" fill="${fg}" text-anchor="middle">${text}</text>`;
  }

  // Ein knapper, harter Schatten statt einer weichen Wolke: die alte
  // Kombination aus Fuellfarbe, weissem Rand UND weichem Schatten waren
  // drei Abgrenzungen fuer dieselbe Aufgabe und liessen die Pins
  // schwerfaellig wirken.
  const shadow = `<filter id="s" x="-40%" y="-40%" width="180%" height="190%">
    <feDropShadow dx="0" dy="1" stdDeviation="0.9" flood-color="#000000" flood-opacity="0.3"/>
  </filter>`;

  const border = outline ? `stroke="${ink}" stroke-width="1.6"` : "";
  const inset = outline ? 0.8 : 0;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW}" height="${boxH}" viewBox="${-EDGE} ${-EDGE} ${boxW} ${boxH}">
    <defs>${shadow}</defs>
    <g filter="url(#s)">
      <path d="M${width / 2 - 4} ${H - 1}h8l-4 ${TAIL}z" fill="${outline ? ink : bg}"/>
      <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${H - inset * 2}"
        rx="${(H - inset * 2) / 2}" fill="${bg}" ${border}/>
    </g>
    ${inner}
  </svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(boxW, boxH),
    // Die Spitze markiert den Ort -- sie sitzt unten mittig.
    anchor: new google.maps.Point(width / 2 + EDGE, H + TAIL + EDGE),
  };
}

/**
 * Ein Ort auf unserer Karte.
 *
 * Mit Note, mit Lesezeichen, oder mit beidem -- immer dieselbe schwarze
 * Pille. Ohne Note und ohne Merken gibt es keinen Pin, deshalb traegt
 * der Fall ohne beides ersatzweise das Lesezeichen.
 */
export function ratingPinIcon(rating?: number, opts?: { saved?: boolean }) {
  const saved = opts?.saved === true;
  if (typeof rating === "number") {
    return pill({ text: rating.toFixed(1), ...(saved ? { glyph: "bookmark" as const } : {}) });
  }
  return pill({ glyph: "bookmark" });
}

/**
 * Suchtreffer -- weisse Pille mit dunklem Rand und einer Lupe.
 *
 * Bewusst umgekehrt zu den eigenen Pins: Ein Treffer ist ein Vorschlag,
 * noch keiner deiner Orte, und soll sich nicht wie einer anfuehlen.
 * Frueher waren Suchtreffer fast schwarz gefuellt -- das waere jetzt
 * nicht mehr von einem bewerteten Ort zu unterscheiden.
 */
export function searchPinIcon() {
  return pill({ glyph: "magnifier", outline: true });
}

/**
 * Der eigene Standort -- der bekannte Punkt mit weissem Ring.
 *
 * Bewusst ein KREIS und keine Pille: Ein Pin zeigt auf einen Ort, dieser
 * Punkt IST einer. So machen es alle Kartenanwendungen, und es liest
 * sich ohne Erklaerung.
 *
 * Er traegt das satte Markenblau, waehrend das Lesezeichen in den Pins
 * das hellere Blau nutzt -- gleiche Familie, klar unterscheidbare Tiefe.
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
