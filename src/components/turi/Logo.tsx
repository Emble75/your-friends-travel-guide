import { cn } from "@/lib/utils";

/**
 * Die Bildmarke: drei verbundene Orte.
 *
 * Bewusst kein Buchstabe. Die drei Punkte stehen fuer den Freundeskreis,
 * die Linie fuer die Verbindung zwischen ihnen -- also fuer das, was die
 * App ausmacht ("The map only your friends could draw"), statt nur fuer
 * den Anfangsbuchstaben.
 *
 * Die Linie ist voll deckend und kraeftig gesetzt, die Punkte sitzen eng.
 * Eine erste Fassung mit duenner, halbtransparenter Verbindung zerfiel
 * unterhalb von 20px in drei lose Punkte -- und genau dort lebt ein Logo:
 * in der Navigationsleiste, nicht auf der Praesentationsfolie.
 */
export function TuriGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 22 16 9l7 11.5"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="8.5" r="4.6" fill="currentColor" />
      <circle cx="8.6" cy="23" r="4.6" fill="currentColor" />
      <circle cx="23.4" cy="21.4" r="4.6" fill="currentColor" />
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
