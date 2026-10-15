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
  const fallback = { pin: "#16181D", accent: "#0E7C86", me: "#2B4C7E" }[role];
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
const CAT_W = 10; // Breite des Zeichens fuer die Art des Ortes
/*
 * Die Art des Ortes wird in einem helleren Signal gezeichnet. Auf der
 * tintenschwarzen Pille waere reines Signal zu dunkel, reines Weiss
 * wuerde mit der Note konkurrieren.
 */
const CAT_INK = "#F0A077";
const EDGE = 4; // Luft ringsum fuer den Schatten
/*
 * Zeichenaufloesung. Die Grafik wird doppelt so gross erzeugt und ueber
 * scaledSize auf die richtige Groesse gebracht: Google Maps rastert das
 * Symbol einmal, und ohne diese Reserve geschieht das in einfacher
 * Aufloesung -- auf Retina-Bildschirmen sichtbar unscharf.
 */
const SHARP = 2;

/**
 * Die Art des Ortes, klein und vereinfacht.
 *
 * Bewusst EIGENE Formen, nicht die Symbole aus der Liste: Bei 10 Pixeln
 * ist ein gekreuztes Besteck ein Fleck. Was bei 17 Pixeln lesbar ist,
 * muss hier auf zwei, drei Striche eingedampft werden -- erkennbar
 * bleibt die Silhouette, nicht das Detail.
 *
 * Warum ueberhaupt: Auf einer Karte mit dreissig Pins beantwortet die
 * Note "wie gut", aber nicht "was ist das". Genau daran scheiterte der
 * urspruengliche Fall -- dreissig Pins in Barcelona, und keiner sagt,
 * welcher davon ein Cafe ist.
 */
const CAT_GLYPH: Record<string, string> = {
  Cafe: '<path d="M1 3h6v3.4a3 3 0 0 1-6 0z"/><path d="M7 3.9h1.3a1.4 1.4 0 0 1 0 2.8H7"/><path d="M.8 9.3h7.4"/>',
  Restaurant:
    '<path d="M1.4 1v2.2a1.6 1.6 0 0 0 3.2 0V1"/><path d="M3 4.6V9"/><path d="M7.7 1c.9 1.2.9 3.2 0 4.4V9"/>',
  Bar: '<path d="M1 1.4h8L5 6z"/><path d="M5 6v3"/><path d="M3 9.2h4"/>',
  Hotel:
    '<path d="M.8 8.6V3.8"/><path d="M.8 6.4h8.4V8.6"/><path d="M3 6.4V4.6h4.2a2 2 0 0 1 2 1.8"/>',
  Beach: '<path d="M5 9.2V4.6"/><path d="M.9 4.6a4.1 4.1 0 0 1 8.2 0z"/>',
  Museum:
    '<path d="M.8 4.2 5 1.3l4.2 2.9"/><path d="M2.2 4.8v3.6"/><path d="M5 4.8v3.6"/><path d="M7.8 4.8v3.6"/><path d="M.9 9.2h8.2"/>',
  Landmark: '<path d="M2 9.2V1"/><path d="M2 1.6h5.6L6.2 3.6l1.4 2H2"/>',
  Nature: '<path d="m.7 8.8 3-5.4 2.2 3.5 1.4-2 2 3.9z"/>',
  Other: '<circle cx="5" cy="5" r="2.3"/>',
};

/** Zeichnet die Art des Ortes in die Pille, linksbuendig ab x. */
function categoryGlyph(x: number, stroke: string, category: string) {
  const paths = CAT_GLYPH[category] ?? CAT_GLYPH["Other"];
  return `<g transform="translate(${x} ${H / 2 - 5})" fill="none" stroke="${stroke}"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
}

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
  /** Art des Ortes -- steht links vor der Note. */
  category?: string;
  /** Weisse Pille mit dunklem Rand statt gefuellter -- fuer Suchtreffer. */
  outline?: boolean;
}) {
  const { text, glyph, category, outline } = opts;
  const ink = mapColor("pin");
  const bg = outline ? "#ffffff" : ink;
  const fg = outline ? ink : "#ffffff";

  const textW = text ? text.length * 7 : 0;
  const glyphW = glyph ? GLYPH_W : category ? CAT_W : 0;
  const gap = glyph && text ? GAP : 0;
  const contentW = glyphW + gap + textW;
  const width = Math.max(H, PAD_X * 2 + contentW);
  const startX = (width - contentW) / 2;

  const boxW = width + EDGE * 2;
  const boxH = H + TAIL + EDGE * 2;

  let inner = "";
  if (glyph === "bookmark") inner += bookmark(startX, mapColor("accent"));
  if (glyph === "magnifier") inner += magnifier(startX, fg);
  // Das Zeichen der Art steht in Signal, nicht in Weiss: Es ordnet ein,
  // die Note bleibt die Hauptinformation.
  if (!glyph && category) inner += categoryGlyph(startX, outline ? ink : CAT_INK, category);
  if (text) {
    const cx = startX + glyphW + gap + textW / 2;
    inner += `<text x="${cx}" y="${H / 2 + 4}" font-family="${FONT_STACK}" font-size="11.5"
      font-weight="700" letter-spacing="-0.2" fill="${fg}" text-anchor="middle">${text}</text>`;
  }

  const border = outline ? `stroke="${ink}" stroke-width="1.6"` : "";
  const inset = outline ? 0.8 : 0;

  /*
   * Der Schatten ist eine GEZEICHNETE Form, kein SVG-Filter.
   *
   * Filter werden gerastert, anders als der Rest der Vektorgrafik. Bei
   * einem 22px hohen Pin auf einem Retina-Bildschirm sah man das: die
   * Kanten wirkten ausgefranst, wie ein Bild in zu geringer Aufloesung.
   * Eine leicht versetzte Kopie der Pille bleibt dagegen scharf.
   */
  const shadow = `<rect x="${inset}" y="${inset + 1.1}" width="${width - inset * 2}"
      height="${H - inset * 2}" rx="${(H - inset * 2) / 2}" fill="#000000" opacity="0.28"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW * SHARP}" height="${boxH * SHARP}" viewBox="${-EDGE} ${-EDGE} ${boxW} ${boxH}">
    <path d="M${width / 2 - 4} ${H - 1}h8l-4 ${TAIL}z" fill="#000000" opacity="0.28"
      transform="translate(0,1.1)"/>
    ${shadow}
    <path d="M${width / 2 - 4} ${H - 1}h8l-4 ${TAIL}z" fill="${outline ? ink : bg}"/>
    <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${H - inset * 2}"
      rx="${(H - inset * 2) / 2}" fill="${bg}" ${border}/>
    ${inner}
  </svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    // Gezeichnet wird doppelt so gross, angezeigt in Originalgroesse --
    // so hat der Bildschirm auf Retina-Geraeten echte Pixel zum Arbeiten.
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
export function ratingPinIcon(rating?: number, opts?: { saved?: boolean; category?: string }) {
  const saved = opts?.saved === true;
  const category = opts?.category;
  if (typeof rating === "number") {
    return pill({
      text: rating.toFixed(1),
      // Gemerkt UND bewertet: das Lesezeichen gewinnt, es ist die
      // seltenere und handlungsrelevantere Aussage.
      ...(saved ? { glyph: "bookmark" as const } : category ? { category } : {}),
    });
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
  // Auch hier gezeichneter Schatten statt Filter -- siehe pill().
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${26 * SHARP}" height="${26 * SHARP}" viewBox="0 0 26 26">
    <circle cx="13" cy="14.1" r="7.5" fill="#000000" opacity="0.3"/>
    <circle cx="13" cy="13" r="7.5" fill="#ffffff"/>
    <circle cx="13" cy="13" r="5.2" fill="${mapColor("me")}"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(26, 26),
    anchor: new google.maps.Point(13, 13),
  };
}
