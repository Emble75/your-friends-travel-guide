/*
 * Farbband hinter dem Profilbild.
 *
 * Warum es das gibt: Die Profilkarte war eine schlichte weisse Flaeche --
 * jedes Konto sah aus wie jedes andere. Das Band gibt dem Profil ein
 * Gesicht, und weil die Farbe waehlbar ist, laesst sie sich auf das
 * eigene Bild abstimmen, statt allen dieselbe Markenfarbe zu geben.
 *
 * Die Auswahl ist bewusst auf die vier Farben der Turi-Palette begrenzt
 * (siehe styles.css). Eine freie Farbwahl wuerde die Geschlossenheit der
 * Palette zerstoeren, die den Rest der App zusammenhaelt. Die Datenbank
 * setzt dieselbe Beschraenkung noch einmal durch.
 */

export const PROFILE_COLORS = ["blue", "grey", "black", "orange"] as const;
export type ProfileColor = (typeof PROFILE_COLORS)[number];

/** Sicherer Zugriff: unbekannte oder fehlende Werte fallen auf Blau zurueck. */
export function asProfileColor(value: unknown): ProfileColor {
  return PROFILE_COLORS.includes(value as ProfileColor) ? (value as ProfileColor) : "blue";
}

/*
 * Die Flaechenfarben. Alle vier stammen aus der Palette:
 *   blue   --brand            Markenblau
 *   grey   --muted-foreground mittleres Warmgrau
 *   black  --primary          das sehr dunkle Warmgrau der Schalter
 *   orange --brand-orange     der zweite Markenakzent
 *
 * Der leichte Verlauf nach unten ist kein Schmuck: das Profilbild
 * ueberlappt das Band, und ein gleichmaessig satter Ton laesst den
 * weissen Ring darum haerter wirken, als er ist.
 */
const SURFACE: Record<ProfileColor, string> = {
  blue: "bg-[linear-gradient(160deg,var(--brand),color-mix(in_oklab,var(--brand)_82%,black))]",
  grey: "bg-[linear-gradient(160deg,var(--muted-foreground),color-mix(in_oklab,var(--muted-foreground)_80%,black))]",
  black: "bg-[linear-gradient(160deg,color-mix(in_oklab,var(--primary)_88%,white),var(--primary))]",
  orange:
    "bg-[linear-gradient(160deg,var(--brand-orange),color-mix(in_oklab,var(--brand-orange)_82%,black))]",
};

/** Nur die Flaeche, ohne Verlauf -- fuer die kleinen Auswahlpunkte. */
const FLAT: Record<ProfileColor, string> = {
  blue: "bg-brand",
  grey: "bg-muted-foreground",
  black: "bg-primary",
  orange: "bg-brand-orange",
};

export const PROFILE_COLOR_LABEL: Record<ProfileColor, string> = {
  blue: "Blue",
  grey: "Grey",
  black: "Black",
  orange: "Orange",
};

/** Das Band selbst. Sitzt oben in der Profilkarte, das Bild ragt hinein. */
export function ProfileCover({ color }: { color: ProfileColor }) {
  return <div aria-hidden className={`h-24 w-full ${SURFACE[color]}`} />;
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
      className={`turi-tap size-9 rounded-full ${FLAT[color]} ring-offset-2 ring-offset-card transition-all ${
        selected ? "ring-2 ring-foreground" : "ring-0 hover:ring-1 hover:ring-border"
      }`}
    />
  );
}
