import { useId } from "react";
import { cn } from "@/lib/utils";

/*
 * Die Bildmarke: ein Daumen, ausgespart aus einem Kartenstift.
 *
 * Die Form sagt "Ort", das Zeichen darin sagt "Empfehlung" -- zusammen
 * genau das, was die App tut. Der Weg hierher ging ueber ein blosses T
 * (richtig, aber austauschbar), drei Kreise (unruhig, klein nicht mehr
 * lesbar) und das T im Stift (gut, aber ohne Aussage ueber den Zweck).
 *
 * WARUM DER DAUMEN GROESSER UND KANTIGER IST als in der ersten Fassung:
 * Ein Daumen im Kopf eines Stifts hat wenig Platz, und alles Feine
 * verschwindet zuerst. In der ersten Zeichnung war der Spalt zwischen
 * Handballen und Faust unter einem halben Pixel breit, sobald die Marke
 * im Browser-Reiter stand -- uebrig blieb ein weisser Fleck. Deshalb:
 *   * groesserer Kopf (Radius 9 statt 8.5), damit ueberhaupt Platz ist
 *   * der Daumen fuellt jetzt zwei Drittel des Kopfes statt der Haelfte
 *   * der Spalt ist 1.6 Einheiten breit, nicht 1.0
 *   * keine Fingerlinien, keine Verjuengungen -- drei klare Formen
 *
 * TECHNIK: Eine Maske spart den Daumen aus dem Stift aus. Das Ergebnis
 * ist EIN flacher Umriss in currentColor: kein Verlauf, keine zweite
 * Farbe, keine Linienstaerke, die beim Verkleinern zulaeuft.
 *
 * GEOMETRIE (Koordinatenraum 32x32, dieselben Zahlen wie im Skript, das
 * Favicon, App-Symbol und Startbild zeichnet -- aendert sich hier etwas,
 * muss es dort mit):
 *   Kopf:    Kreis um (16, 11.5), Radius 9
 *   Spitze:  (16, 29.2)
 *   Flanken: die Tangenten von der Spitze an den Kreis, sie treffen ihn
 *            bei y = 16.08. Dadurch geht der Kopf ohne Knick in die
 *            Spitze ueber.
 *   Daumen:  Handballen, Faust und Daumen als drei abgerundete Rechtecke
 */
export function TuriGlyph({ className }: { className?: string }) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <mask id={maskId}>
        <rect width="32" height="32" fill="black" />
        <path d="M16 29.2 L8.25 16.08 A9 9 0 1 1 23.75 16.08 Z" fill="white" />
        {/* Der Daumen als Aussparung: Ballen, Faust, Daumen. */}
        <rect x="10" y="10.6" width="3" height="6.2" rx="1.5" fill="black" />
        <rect x="14.6" y="9.6" width="7.6" height="7.2" rx="2.2" fill="black" />
        <rect x="14.6" y="5.8" width="3.6" height="5.4" rx="1.8" fill="black" />
      </mask>
      <rect width="32" height="32" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

/**
 * Bildmarke auf der Markenflaeche -- fuer App-Symbol, Anmeldung und
 * Startseite. 74% der Kachel: Der Stift ist deutlich hoeher als breit,
 * ein groesserer Wert liesse ihn oben und unten an den Rand stossen.
 */
export function TuriMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "brand-gradient flex items-center justify-center rounded-2xl shadow-glow",
        className,
      )}
    >
      <TuriGlyph className="size-[74%] text-white" />
    </div>
  );
}

export function TuriWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <TuriMark className="size-9" />
      <span className="font-display text-xl font-bold tracking-tight">Turi</span>
    </div>
  );
}
