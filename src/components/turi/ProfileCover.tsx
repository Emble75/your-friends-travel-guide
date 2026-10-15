/*
 * Das Band hinter dem Profilbild.
 *
 * Es gibt dem Profil ein Gesicht -- ohne es sah jedes Konto aus wie
 * jedes andere.
 *
 * ZUR GESCHICHTE: Hier standen nacheinander zehn waehlbare Farben und
 * dann ein frei waehlbares Titelbild. Beides ist wieder raus. Das Bild
 * war der Grund: Ueber der Profilkarte, dem Avatar, dem Namen und den
 * Reitern liegt ohnehin schon viel; ein Foto darunter macht aus dem
 * Kopf der Seite eine zweite Bildflaeche, die mit den Fotos der
 * Bewertungen darunter konkurriert. Die Fotos gehoeren zu den Orten --
 * der Profilkopf soll sie einleiten, nicht uebertoenen.
 *
 * Was bleibt, ist ein ruhiges helles Blau aus der Markenfarbe. Es ist
 * ein Hintergrund, keine Aussage.
 */

const PLAIN =
  "linear-gradient(160deg, color-mix(in oklab, var(--brand) 20%, white), color-mix(in oklab, var(--brand) 34%, white))";

export function ProfileCover() {
  return <div aria-hidden className="h-24 w-full" style={{ backgroundImage: PLAIN }} />;
}
