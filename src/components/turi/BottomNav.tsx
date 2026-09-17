import { Link } from "@tanstack/react-router";
import { Map, Home, Search, User } from "lucide-react";

const items = [
  { to: "/map", label: "Map", icon: Map },
  { to: "/feed", label: "Feed", icon: Home },
  { to: "/explore", label: "Search", icon: Search },
  { to: "/me", label: "Profile", icon: User },
] as const;

/*
 * Die untere Navigation -- eine freistehende Pille statt eines Balkens.
 *
 * Vorher lag sie als durchgehende Leiste auf der ganzen Breite und
 * schnitt den Bildschirm mit einer Trennlinie unten ab. Jetzt schwebt
 * sie ueber dem Inhalt: Die Seite laeuft sichtbar darunter weiter, was
 * die Oberflaeche leichter und weniger "abgeschnitten" wirken laesst.
 *
 * WICHTIG -- GEKOPPELT AN --bottom-nav-h IN styles.css: Jede Seite haelt
 * unten genau so viel Platz frei, wie diese Leiste hoch ist, und die
 * Karte berechnet daraus ihre Hoehe. Aendert sich hier ein Abstand, muss
 * der Wert dort mitgezogen werden, sonst rutschen die schwebenden
 * Kartenknoepfe darunter oder es klafft eine Luecke.
 *
 * Aktuell: 1.5rem Innenrand der Pille (p-1.5, oben + unten)
 *        + 2rem Inhalt (Symbol 20px, Abstand, Beschriftung)
 *        + 1rem Innenabstand der Eintraege (py-2, oben + unten)
 *        = 4rem, dazu der Abstand zum unteren Rand.
 */
export function BottomNav() {
  return (
    <nav
      // pointer-events-none auf dem Rahmen, damit der freie Platz links
      // und rechts der Pille nicht unsichtbar Klicks abfaengt -- dort
      // liegt die Seite, und die soll bedienbar bleiben.
      aria-label="Main navigation"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3"
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-[1.375rem] border border-card/80 bg-card/90 p-1 shadow-card backdrop-blur-xl">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="turi-tap flex h-12 w-16 flex-col items-center justify-center gap-0.5 rounded-[1.125rem] text-muted-foreground transition-colors"
            // Aktiver Reiter: die einzige Stelle in der Kern-Navigation,
            // die Markenfarbe traegt. Die Pille dahinter macht den
            // Zustand auch ohne Farbsehen als Flaeche erkennbar.
            // aria-current markiert die aktive Seite fuer Screenreader --
            // Farbe allein ist dafuer keine Information.
            activeProps={{
              className: "bg-primary text-primary-foreground shadow-sm font-bold",
              "aria-current": "page",
            }}
          >
            <Icon size={19} strokeWidth={2.2} />
            <span className="text-2xs font-semibold">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
