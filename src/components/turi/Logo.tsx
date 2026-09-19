import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Die Bildmarke: drei Kreise, deren gemeinsamer Negativraum ein T formt.
 *
 * Sie traegt beides -- den Anfangsbuchstaben UND die Idee der App: Die
 * Kreise sind Orte auf einer Karte, die weisse Flaeche dazwischen ist die
 * Route, die sie verbindet ("The map only your friends could draw"). Im
 * oberen rechten Kreis sitzt ein kleiner Standort-Pin als Aussparung.
 *
 * Technik: Eine SVG-Mask spart das T und den Pin aus den Kreisen aus.
 * Dadurch bleibt das Zeichen ein einziger flacher Umriss -- es bleibt an
 * jeder Groesse scharf und liest sich noch als T, wenn die Kreise bei
 * 16px zu Blobs verschwimmen. Die Mask-ID kommt von useId, damit mehrere
 * Instanzen der Marke auf einer Seite sich nicht in die Quere kommen.
 */
export function TuriGlyph({ className }: { className?: string }) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <mask id={maskId}>
        <rect width="32" height="32" fill="black" />
        {/* Drei Orte in Dreiecksanordnung, wie im gewaehlten Konzept. */}
        <circle cx="9.5" cy="9.3" r="7.5" fill="white" />
        <circle cx="23.4" cy="8.3" r="7.1" fill="white" />
        <circle cx="16.1" cy="23.1" r="7.7" fill="white" />
        {/* Das T als Aussparung: Querbalken endet am Pin, der Schaft
            laeuft in den unteren Kreis und endet dort. */}
        <rect x="8.1" y="6.4" width="13" height="4.6" rx="2.3" fill="black" />
        <rect x="13.7" y="6.4" width="5" height="15.9" rx="2.5" fill="black" />
        {/* Der Pin als Aussparung im rechten Ort, der Punkt bleibt Marke. */}
        <circle cx="23.1" cy="8.8" r="2.7" fill="black" />
        <path d="M21.1 10.2 L25.1 10.2 L23.3 14.6 Z" fill="black" />
        <circle cx="23.1" cy="8.8" r="1.15" fill="white" />
      </mask>
      <rect width="32" height="32" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

/** Bildmarke auf der Markenflaeche -- fuer App-Icon, Login und Startseite. */
export function TuriMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "brand-gradient flex items-center justify-center rounded-2xl shadow-glow",
        className,
      )}
    >
      <TuriGlyph className="size-[68%]" />
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
