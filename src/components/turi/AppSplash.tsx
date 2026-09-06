import { TuriMark } from "./Logo";

/*
 * Der Startbildschirm -- die ruhige Flaeche mit der Marke, die man beim
 * Oeffnen der App kurz sieht, bevor Karte oder Anmeldung erscheinen.
 *
 * Er sitzt auf der Startroute ("/"), und die ist genau der Einstieg: die
 * iOS-Huelle laedt die Seite am Wurzelpfad, und dort wird entschieden,
 * ob es zur Karte oder zur Anmeldung geht. Waehrend dieser Entscheidung
 * steht dieser Bildschirm.
 *
 * Was er NICHT abdeckt: die Zeit davor, in der die Seite ueberhaupt erst
 * aus dem Netz geladen wird. Ein Versuch, ihn dafuer schon ins
 * ausgelieferte HTML zu legen, ist gescheitert -- React baut das Dokument
 * beim Start neu auf (die App hat einen bestehenden Hydrations-Fehler)
 * und erzeugte den Bildschirm dabei immer wieder neu, sodass er nie
 * verschwand. Auf dem iPhone deckt diese Luecke ohnehin Apples eigener
 * Startbildschirm ab (ios/App/App/Assets.xcassets/Splash.imageset), der
 * dieselbe Marke zeigt.
 */
export function AppSplash() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background">
      <TuriMark className="size-20" />
    </main>
  );
}
