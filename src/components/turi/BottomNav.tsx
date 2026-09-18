import { Link } from "@tanstack/react-router";
import { Map, Home, Search, User } from "lucide-react";

const items = [
  { to: "/map", label: "Map", icon: Map },
  { to: "/feed", label: "Feed", icon: Home },
  { to: "/explore", label: "Search", icon: Search },
  { to: "/me", label: "Profile", icon: User },
] as const;

/*
 * Die untere Navigation -- durchgehende Leiste aus milchigem Glas.
 *
 * Zwei verworfene Fassungen stecken hier drin, beide aus demselben Grund
 * gescheitert: Sie wollten sich vom Inhalt abheben und haben dafuer zu
 * viel Gewicht aufgebaut.
 *
 *   1. Freistehende weisse Pille -- verschmolz im Feed mit den weissen
 *      Karten, die dahinter vorbeilaufen. Weiss auf Weiss.
 *   2. Freistehende SCHWARZE Pille -- loeste das, war aber ein schwerer
 *      dunkler Block am unteren Rand und zog alle Aufmerksamkeit auf
 *      sich, obwohl Navigation Beiwerk ist.
 *
 * Die Loesung ist nicht mehr Kontrast, sondern ein anderes MATERIAL:
 * eine durchgehende Leiste, die den Inhalt dahinter durchscheinen laesst
 * und ihn dabei weichzeichnet. Die Flaeche liest sich dadurch als Glas
 * ueber der Seite, nicht als weiterer Block darauf.
 *
 * Warum --background und nicht --card als Ton: Die Karten im Feed sind
 * reines Weiss. Eine weisse Leiste darueber verschwindet darin. Der
 * etwas waermere, dunklere Grundton der App hebt sich davon ab, ohne
 * dafuer Kontrast aufwenden zu muessen.
 *
 * WICHTIG -- GEKOPPELT AN --bottom-nav-h IN styles.css: Jede Seite haelt
 * unten genau so viel Platz frei, wie diese Leiste hoch ist, und die
 * Karte berechnet daraus ihre Hoehe. Aendert sich hier ein Abstand, muss
 * der Wert dort mitgezogen werden -- sonst rutschen die schwebenden
 * Kartenknoepfe darunter.
 *
 * Aktuell: 0.5rem Innenabstand oben (pt-2)
 *        + 3rem feste Hoehe der Eintraege (h-12)
 *        = 3.5rem, dazu der untere Innenabstand.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/80 backdrop-blur-xl backdrop-saturate-150"
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      <div className="app-shell flex items-stretch justify-between pt-2">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="turi-tap flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-muted-foreground transition-colors"
            // Aktiver Reiter: die einzige Stelle in der Kern-Navigation,
            // die Markenfarbe traegt. Die weiche Pille dahinter macht den
            // Zustand auch ohne Farbsehen als Flaeche erkennbar.
            // aria-current markiert die aktive Seite fuer Screenreader --
            // Farbe allein ist dafuer keine Information.
            activeProps={{
              className: "bg-brand-soft text-brand font-bold",
              "aria-current": "page",
            }}
          >
            <Icon size={20} strokeWidth={2} />
            <span className="text-2xs font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
