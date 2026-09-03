import { cn } from "@/lib/utils";

/**
 * Die Bildmarke: vier verbundene Orte, die ein T bilden.
 *
 * Sie traegt beides -- den Anfangsbuchstaben UND die Idee der App: Punkte
 * sind Orte, die Linien die Verbindungen dazwischen ("The map only your
 * friends could draw").
 *
 * Die Punkte sind bewusst kraeftig und die Spanne eng. Eine schlankere
 * Fassung mit kleineren Punkten wirkte bei 16px zerbrechlich, und genau
 * dort lebt ein Logo -- in der Navigationsleiste, nicht auf der
 * Praesentationsfolie.
 */
export function TuriGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path d="M8 10h16M16 10v13" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="8" cy="10" r="4.5" fill="currentColor" />
      <circle cx="16" cy="10" r="4.5" fill="currentColor" />
      <circle cx="24" cy="10" r="4.5" fill="currentColor" />
      <circle cx="16" cy="23.5" r="4.5" fill="currentColor" />
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
