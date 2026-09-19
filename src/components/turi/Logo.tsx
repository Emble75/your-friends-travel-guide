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
        {/* Drei Orte: zwei oben, einer darunter. */}
        <circle cx="10" cy="11" r="7.5" fill="white" />
        <circle cx="22" cy="11" r="7.5" fill="white" />
        <circle cx="16" cy="23.5" r="7.5" fill="white" />
        {/* Das T als Negativraum: Querbalken + abstehender Schaft. */}
        <rect x="2.5" y="9.8" width="27" height="4.5" rx="2.25" fill="black" />
        <rect x="13.75" y="12" width="4.5" height="15.8" rx="2.25" fill="black" />
        {/* Der Pin im oberen rechten Ort. */}
        <circle cx="22" cy="7.4" r="1.9" fill="black" />
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
