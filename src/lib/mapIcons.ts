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
  const fallback = { friends: "#a72b00", saved: "#3b7a8c", mine: "#2b2724" }[role];
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

/**
 * Hellt eine Hex-Farbe auf oder dunkelt sie ab (-1 bis 1).
 * Wird fuer die Plastizitaet der Pins gebraucht: oben heller, unten
 * dunkler, so bekommt die Form Volumen statt flach zu wirken.
 */
function shade(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const channels = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16);
    const target = amount >= 0 ? 255 : 0;
    return Math.round(v + (target - v) * Math.abs(amount));
  });
  return "#" + channels.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/**
 * Koerper, Verlauf und Glanzlicht eines Pins.
 *
 * Der Verlauf laeuft von einer aufgehellten Variante oben zu einer
 * abgedunkelten unten; darueber liegt ein weiches, elliptisches
 * Glanzlicht links oben. Beides zusammen laesst die Form gewoelbt
 * erscheinen, statt wie eine ausgeschnittene Flaeche. Ein zusaetzlicher
 * dunkler Rand innen setzt sie gegen helle Karten ab.
 */
function body(path: string, color: string, id: string) {
  return `
    <defs>
      <linearGradient id="g${id}" x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0" stop-color="${shade(color, 0.28)}"/>
        <stop offset="0.55" stop-color="${color}"/>
        <stop offset="1" stop-color="${shade(color, -0.22)}"/>
      </linearGradient>
      <radialGradient id="h${id}" cx="0.34" cy="0.24" r="0.52">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
        <stop offset="0.65" stop-color="#ffffff" stop-opacity="0.08"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <path d="${path}" fill="url(#g${id})" stroke="${shade(color, -0.35)}" stroke-width="0.9" filter="url(#s)"/>
    <path d="${path}" fill="url(#h${id})"/>`;
}

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
 * Waehlt die Schriftfarbe fuer die Bewertungszahl im weissen Kreis.
 *
 * Die Zahl stand frueher immer in der Pinfarbe. Auf einem dunklen Pin
 * ist das gut lesbar, auf einem hellen aber nicht -- ein helles Orange
 * erreicht auf Weiss nur 2.87:1. Deshalb wird ab einer gewissen
 * Helligkeit auf ein dunkles Grau gewechselt. So stimmt es in beiden
 * Themes, ohne dass irgendwo eine Fallunterscheidung gepflegt werden muss.
 */
function labelColor(pin: string): string {
  const hex = pin.replace("#", "");
  if (hex.length !== 6) return pin;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92);
  const luminance = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  // Ab hier waere die Pinfarbe auf Weiss unter 4.5:1.
  return luminance > 0.24 ? "#151412" : pin;
}

/**
 * Pin mit der Durchschnittsbewertung im Kreis -- oder ohne Zahl, falls
 * (noch) keine Bewertung vorliegt (z. B. rein gemerkte "Will ich noch
 * hin"-Orte). Wird auf der Hauptkarte und der Mini-Karte im Profil
 * verwendet.
 */
export function ratingPinIcon(color: string, rating?: number) {
  const label = typeof rating === "number" ? rating.toFixed(1) : "";
  // Ohne Zahl bleibt das Loch gross -- so liest es sich als bewusste
  // Ringform (wie bei klassischen Kartennadeln) und nicht als Pin, dem
  // die Beschriftung fehlt. Mit der plastischen Woelbung traegt das;
  // flach gezeichnet wirkte derselbe grosse Kreis frueher leer.
  const radius = label ? 10.5 : 8.5;
  return wrap(`
    ${body(PIN_PATH, color, "r")}
    <circle cx="17" cy="16.5" r="${radius + 0.6}" fill="${shade(color, -0.3)}" opacity="0.45"/>
    <circle cx="17" cy="16.5" r="${radius}" fill="#ffffff"/>
    ${
      label
        ? `<text x="17" y="20.6" font-family="${FONT_STACK}" font-size="11.5" font-weight="700" letter-spacing="-0.3" fill="${labelColor(color)}" text-anchor="middle">${label}</text>`
        : ""
    }
  `);
}

/**
 * Marker fuer Suchtreffer -- etwa alle Aldi-Filialen in der Umgebung.
 *
 * Bewusst schlanker als ratingPinIcon und mit vollflaechigem Punkt statt
 * Bewertungskreis. Ein Suchtreffer ist ein Vorschlag, keine Bewertung --
 * er soll die Pins von Freunden (tiefes Orange, mit Note) und die Wunschliste
 * (teal) nicht nachahmen.
 */
export function searchPinIcon(color = mapColor("mine")) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="-3 -2 32 40">
    <defs>${SHADOW}</defs>
    ${body("M13 0C5.8 0 0 5.8 0 13c0 9.2 13 21 13 21s13-11.8 13-21C26 5.8 20.2 0 13 0z", color, "s")}
    <circle cx="13" cy="12.5" r="5.1" fill="${shade(color, -0.3)}" opacity="0.45"/>
    <circle cx="13" cy="12.5" r="4.5" fill="#ffffff"/>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(32, 40),
    anchor: new google.maps.Point(16, 36),
  };
}
