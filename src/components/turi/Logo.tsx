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
        {/* Drei Orte: zwei oben, einer darunter -- sie beruehren sich nur. */}
        <circle cx="10" cy="10" r="6.5" fill="white" />
        <circle cx="22.2" cy="10" r="6.8" fill="white" />
        <circle cx="16" cy="23" r="6.8" fill="white" />
        {/* Das T als weisse Flaeche zwischen den Orten: Querbalken endet
            im rechten Kreis, der Schaft laeuft in den unteren Kreis und
            endet dort -- kein Kreis wird zerschnitten. */}
        <rect x="7" y="8" width="13" height="4" rx="2" fill="white" />
        <rect x="14" y="8" width="4" height="14" rx="2" fill="white" />
        {/* Der Pin im oberen rechten Ort. */}
        <circle cx="22.3" cy="8" r="1.7" fill="white" />
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
