import { useId } from "react";
import { cn } from "@/lib/utils";

/*
 * Die Bildmarke: das T, ausgespart aus einem Kartenstift.
 *
 * Der Weg hierher: erst ein blosses T auf der Markenflaeche -- richtig,
 * aber austauschbar, es haette zu jeder App mit T gepasst. Dann eine
 * gebaute Marke aus drei Kreisen, deren Negativraum ein T formte: zu
 * unruhig und bei kleinen Groessen nicht mehr als T zu lesen. Jetzt
 * beides zusammen -- der Buchstabe sagt, wer es ist, die Form sagt,
 * worum es geht.
 *
 * TECHNIK: Eine Maske spart das T aus dem Stift aus, das Ergebnis ist
 * EIN flacher Umriss in currentColor. Kein Verlauf, keine zweite Farbe,
 * keine Linienstaerke, die beim Verkleinern zulaeuft. Die Masken-Kennung
 * kommt von useId, damit mehrere Marken auf einer Seite sich nicht in
 * die Quere kommen.
 *
 * GEOMETRIE (Koordinatenraum 32x32, dieselben Zahlen wie im Skript, das
 * Favicon, App-Symbol und Startbild zeichnet -- aendert sich hier etwas,
 * muss es dort mit):
 *   Kopf:   Kreis um (16, 11.8), Radius 8.5
 *   Spitze: (16, 28.8)
 *   Flanken: die beiden Tangenten von der Spitze an den Kreis; sie
 *            treffen ihn bei y = 16.05. Dadurch geht der Kopf ohne Knick
 *            in die Spitze ueber -- eine aufgesetzte Dreiecksnase waere
 *            genau die Stelle, an der billige Kartenstifte auffallen.
 *   T:      Versalhoehe 9, Strichstaerke 1.98, zentriert im Kopf.
 */
export function TuriGlyph({ className }: { className?: string }) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <mask id={maskId}>
        <rect width="32" height="32" fill="black" />
        <path d="M16 28.8 L8.64 16.05 A8.5 8.5 0 1 1 23.36 16.05 Z" fill="white" />
        {/* Das T als Aussparung: Querbalken und Schaft. */}
        <rect x="12.05" y="7.3" width="7.9" height="1.98" fill="black" />
        <rect x="15.01" y="7.3" width="1.98" height="9" fill="black" />
      </mask>
      <rect width="32" height="32" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

/**
 * Bildmarke auf der Markenflaeche -- fuer App-Symbol, Anmeldung und
 * Startseite. Der Stift misst 78% der Kachel: Er ist schmaler als breit,
 * eine kleinere Zahl liesse ihn in der Flaeche verloren wirken.
 */
export function TuriMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "brand-gradient flex items-center justify-center rounded-2xl shadow-glow",
        className,
      )}
    >
      <TuriGlyph className="size-[78%] text-white" />
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
