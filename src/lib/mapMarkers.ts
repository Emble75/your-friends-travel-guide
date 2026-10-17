/*
 * Die Pins auf der Karte -- als echte Elemente, nicht als Bilddatei.
 *
 * Googles Karte nahm Symbole nur als Grafik entgegen; jeder Pin war
 * deshalb ein SVG in einer data-URL, mit Systemschrift (Webfonts
 * greifen dort nicht), von Hand gezeichnetem Schatten und doppelter
 * Aufloesung gegen Unschaerfe.
 *
 * MapLibre setzt beliebige Elemente auf die Karte. Damit faellt der
 * ganze Umweg weg: Die Note steht in Fraunces wie ueberall sonst in der
 * App, die Farben kommen aus dem Design-System, der Schatten ist ein
 * Schatten.
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

function glyph(category: string, stroke: string): string {
  const paths = CAT_GLYPH[category] ?? CAT_GLYPH["Other"];
  return `<svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="${stroke}"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

const BOOKMARK = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;

const MAGNIFIER = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>`;

/*
 * Die Spitze unter der Pille markiert genau den Ort. Sie ist ein
 * gedrehtes Quadrat, kein Dreieck aus Rahmen-Tricks: So erbt sie die
 * Farbe der Pille, auch wenn die wechselt.
 */
function tail(color: string): string {
  return `<span style="width:9px;height:9px;margin-top:-5px;transform:rotate(45deg);border-radius:2px;background:${color}"></span>`;
}

function shell(inner: string, color: string, textColor: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "flex cursor-pointer flex-col items-center";
  el.innerHTML = `
    <span style="display:flex;align-items:center;gap:5px;padding:6px 9px;border-radius:10px;
      background:${color};color:${textColor};box-shadow:0 4px 12px rgba(22,24,29,.28);
      font-family:var(--font-display);font-weight:600;font-size:14px;line-height:1;
      letter-spacing:-0.01em;white-space:nowrap">${inner}</span>
    ${tail(color)}`;
  return el;
}

function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Ein bewerteter Ort: Art des Ortes und Note in einer Pille. */
export function ratingMarker(rating: number, category?: string): HTMLElement {
  const ink = token("--map-pin", "#16181D");
  const paper = token("--background", "#FBFAF7");
  // Das Zeichen der Art in einem helleren Signal: Reines Weiss wuerde
  // mit der Note konkurrieren, reines Signal waere auf Tinte zu dunkel.
  const mark = category ? glyph(category, "#F0A077") : "";
  return shell(`${mark}<span>${rating.toFixed(1)}</span>`, ink, paper);
}

/** Ein gemerkter Ort -- ohne Note, dafuer mit Lesezeichen. */
export function savedMarker(): HTMLElement {
  const accent = token("--map-accent", "#0E7C86");
  const paper = token("--background", "#FBFAF7");
  return shell(BOOKMARK, accent, paper);
}

/**
 * Ein Suchtreffer -- helle Pille mit dunklem Rand.
 *
 * Bewusst umgekehrt zu den eigenen Pins: Ein Treffer ist ein Vorschlag,
 * noch keiner deiner Orte, und soll sich nicht wie einer anfuehlen.
 */
export function searchMarker(): HTMLElement {
  const ink = token("--map-pin", "#16181D");
  const paper = token("--background", "#FBFAF7");
  const el = shell(MAGNIFIER, paper, ink);
  const pill = el.firstElementChild as HTMLElement | null;
  if (pill) pill.style.boxShadow = `0 0 0 1.5px ${ink}, 0 4px 12px rgba(22,24,29,.22)`;
  return el;
}

/** Der eigene Standort: ein Punkt mit Hof, keine Pille. */
export function locationMarker(): HTMLElement {
  const me = token("--map-me", "#2B4C7E");
  const paper = token("--background", "#FBFAF7");
  const el = document.createElement("div");
  el.innerHTML = `<span style="display:block;width:18px;height:18px;border-radius:999px;
    background:${me};border:3px solid ${paper};box-shadow:0 0 0 1px rgba(22,24,29,.15),0 2px 8px rgba(22,24,29,.3)"></span>`;
  return el;
}
