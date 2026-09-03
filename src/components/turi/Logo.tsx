import { cn } from "@/lib/utils";

/**
 * Die Bildmarke: vier verbundene Orte, die ein T bilden.
 *
 * Sie traegt beides -- den Anfangsbuchstaben UND die Idee der App: Punkte
 * sind Orte, die Linien die Verbindungen dazwischen ("The map only your
 * friends could draw").
 *
 * Punkte klein, Linien duenner und halbtransparent. Bei gleicher Staerke
 * und voller Deckung schluckten die Punkte die Linien und die Marke las
 * sich als ein Klumpen. Unterhalb von 16px treten die Linien zwar
 * zurueck, die vier Punktpositionen allein bilden aber weiterhin ein T --
 * die Form bleibt also lesbar, wo ein Logo tatsaechlich lebt.
 */
export function TuriGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      {/* Die Linien bewusst duenner und halbtransparent: bei gleicher
          Staerke und Deckung verschmolzen sie mit den Punkten zu einer
          Flaeche. So bleiben Orte (Punkte) und Verbindungen (Linien)
          unterscheidbar -- das ist der Inhalt der Marke. */}
      <path
        d="M6.5 10h19M16 10v13.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <circle cx="6.5" cy="10" r="3.4" fill="currentColor" />
      <circle cx="16" cy="10" r="3.4" fill="currentColor" />
      <circle cx="25.5" cy="10" r="3.4" fill="currentColor" />
      <circle cx="16" cy="23.5" r="3.4" fill="currentColor" />
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
      <TuriGlyph className="size-[62%] text-white" />
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
