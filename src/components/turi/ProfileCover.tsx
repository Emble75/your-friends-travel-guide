/*
 * Farbband hinter dem Profilbild.
 *
 * Warum es das gibt: Die Profilkarte war eine schlichte weisse Flaeche --
 * jedes Konto sah aus wie jedes andere. Das Band gibt dem Profil ein
 * Gesicht, und weil die Farbe waehlbar ist, laesst sie sich auf das
 * eigene Bild abstimmen, statt allen dieselbe Markenfarbe zu geben.
 *
 * ZUR AUSWAHL: Frueher waren es genau die vier Farben der Turi-Palette,
 * mit der Begruendung, eine offene Farbwahl wuerde deren Geschlossenheit
 * zerstoeren. Der Gedanke stimmt fuer die OBERFLAECHE -- Knoepfe,
 * Leisten und Zeichen muessen aus einer Hand kommen. Das Band ist aber
 * keine Oberflaeche, sondern der einzige Platz, an dem das Profil einer
 * Person ihr gehoert. Vier Moeglichkeiten sind dafuer zu wenig.
 *
 * Es sind jetzt zehn, und sie bleiben trotzdem eine Familie: Die sechs
 * neuen sind ausdruecklich KEINE frei gegriffenen Farben, sondern liegen
 * auf einem gemeinsamen Helligkeits- und Buntheitsband (siehe --cover-*
 * in styles.css) und bekommen alle dieselbe Behandlung -- derselbe
 * Verlaufswinkel, dieselbe Abdunklung nach unten. Nebeneinandergelegt
 * sehen sie wie ein Satz aus, nicht wie ein Farbkasten.
 *
 * Der leichte Verlauf nach unten ist kein Schmuck: Das Profilbild
 * ueberlappt das Band, und ein gleichmaessig satter Ton laesst den
 * weissen Ring darum haerter wirken, als er ist.
 *
 * Die Datenbank kennt dieselbe Liste noch einmal (Pruefregel auf
 * profiles.profile_color) -- sonst koennte sie umgehen, wer die Anfrage
 * direkt stellt. Kommt eine Farbe dazu, gehoert sie dort mit hinein.
 */

export const PROFILE_COLORS = [
  "blue",
  "teal",
  "green",
  "sand",
  "orange",
  "red",
  "pink",
  "purple",
  "grey",
  "black",
] as const;

export type ProfileColor = (typeof PROFILE_COLORS)[number];

/** Sicherer Zugriff: unbekannte oder fehlende Werte fallen auf Blau zurueck. */
export function asProfileColor(value: unknown): ProfileColor {
  return PROFILE_COLORS.includes(value as ProfileColor) ? (value as ProfileColor) : "blue";
}

/*
 * Die Grundfarben als Verweis auf das Design-System, nie als fester
 * Wert. Die vier bekannten stammen aus der Oberflaechen-Palette, die
 * sechs neuen aus dem eigenen Satz fuer Farbbaender.
 */
const COVER: Record<ProfileColor, string> = {
  blue: "var(--brand)",
  teal: "var(--cover-teal)",
  green: "var(--cover-green)",
  sand: "var(--cover-sand)",
  orange: "var(--brand-orange)",
  red: "var(--cover-red)",
  pink: "var(--cover-pink)",
  purple: "var(--cover-purple)",
  grey: "var(--muted-foreground)",
  black: "var(--foreground)",
};

export const PROFILE_COLOR_LABEL: Record<ProfileColor, string> = {
  blue: "Blue",
  teal: "Teal",
  green: "Green",
  sand: "Sand",
  orange: "Orange",
  red: "Red",
  pink: "Pink",
  purple: "Purple",
  grey: "Grey",
  black: "Black",
};

/*
 * Der Verlauf wird als Stil gesetzt, nicht als Klasse.
 *
 * Tailwind erzeugt nur, was woertlich im Quelltext steht. Bei zehn
 * Farben waeren das zehn ausgeschriebene Verlaufsklassen, jede eine
 * Zeile lang -- und bei der elften vergisst man eine. Der Stil kennt
 * dieselben Design-Variablen und kommt mit einer Zeile aus.
 */
function surface(color: ProfileColor) {
  const c = COVER[color];
  return `linear-gradient(160deg, ${c}, color-mix(in oklab, ${c} 82%, black))`;
}

/** Das Band selbst. Sitzt oben in der Profilkarte, das Bild ragt hinein. */
export function ProfileCover({ color }: { color: ProfileColor }) {
  return <div aria-hidden className="h-24 w-full" style={{ backgroundImage: surface(color) }} />;
}

/** Ein Auswahlpunkt fuer die Bearbeiten-Ansicht. */
export function ProfileColorSwatch({
  color,
  selected,
  onSelect,
}: {
  color: ProfileColor;
  selected: boolean;
  onSelect: (color: ProfileColor) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(color)}
      aria-label={PROFILE_COLOR_LABEL[color]}
      aria-pressed={selected}
      // Der Punkt zeigt die reine Flaeche, nicht den Verlauf: Bei 36px
      // waere der Verlauf nur ein unsauber wirkender Farbstich.
      style={{ backgroundColor: COVER[color] }}
      className={`turi-tap size-9 shrink-0 rounded-full ring-offset-2 ring-offset-card transition-all ${
        selected ? "ring-2 ring-foreground" : "ring-0 hover:ring-1 hover:ring-border"
      }`}
    />
  );
}
