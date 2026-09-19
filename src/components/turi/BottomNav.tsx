import { Link } from "@tanstack/react-router";
import { Map, Home, Search, User } from "lucide-react";

const items = [
  { to: "/map", label: "Map", icon: Map },
  { to: "/feed", label: "Feed", icon: Home },
  { to: "/explore", label: "Search", icon: Search },
  { to: "/me", label: "Profile", icon: User },
] as const;

/*
 * Die untere Navigation -- schwebende Pille aus milchigem Glas.
 *
 * Drei verworfene Fassungen stecken hier drin; der Weg dahin ist lehrreich:
 *
 *   1. Durchgehender Balken mit Trennlinie -- schnitt den Bildschirm
 *      unten hart ab.
 *   2. Freistehende WEISSE Pille -- verschmolz im Feed mit den weissen
 *      Karten, die dahinter vorbeilaufen. Weiss auf Weiss.
 *   3. Freistehende SCHWARZE Pille -- loeste das, war aber ein schwerer
 *      dunkler Block und zog alle Aufmerksamkeit auf sich, obwohl
 *      Navigation Beiwerk ist.
 *
 * Fassung 2 und 3 versuchten dasselbe ueber KONTRAST. Entscheidend ist
 * aber das MATERIAL: Die Pille laesst den Inhalt durchscheinen und
 * zeichnet ihn weich. Sie liest sich dadurch als Glas ueber der Seite
 * statt als weiterer Block darauf -- und bleibt trotzdem sichtbar, weil
 * sie den waermeren Grundton der App traegt statt des Kartenweiss.
 *
 * NUR SYMBOLE, KEINE BESCHRIFTUNG: macht die Pille kompakt genug, um zu
 * schweben. Die vier Symbole (Karte, Haus, Lupe, Person) sind ueberall
 * dieselben; aria-label traegt den Namen fuer Screenreader nach.
 *
 * WICHTIG -- GEKOPPELT AN --bottom-nav-h IN styles.css: Jede Seite haelt
 * unten so viel Platz frei, wie diese Leiste hoch ist, und die Karte
 * berechnet daraus ihre Hoehe. Aendert sich hier ein Abstand, muss der
 * Wert dort mitgezogen werden -- sonst rutschen die schwebenden
 * Kartenknoepfe darunter.
 *
 * Aktuell: 0.5rem Innenrand der Pille (p-1, oben + unten)
 *        + 3rem Hoehe der Eintraege (size-12)
 *        = 3.5rem, dazu der Abstand zum unteren Rand.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Main navigation"
      // pointer-events-none auf dem Rahmen, damit der freie Platz links
      // und rechts der Pille nicht unsichtbar Klicks abfaengt -- dort
      // liegt die Seite, und die soll bedienbar bleiben.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4"
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1 shadow-card backdrop-blur-xl backdrop-saturate-150">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            aria-label={label}
            className="turi-tap flex size-12 items-center justify-center rounded-full text-muted-foreground transition-colors"
            // Aktiver Reiter: die einzige Stelle in der Kern-Navigation,
            // die Markenfarbe traegt. Die Pille dahinter macht den
            // Zustand auch ohne Farbsehen als Flaeche erkennbar.
            // aria-current markiert die aktive Seite fuer Screenreader --
            // Farbe allein ist dafuer keine Information.
            activeProps={{
              className: "bg-brand-soft text-brand",
              "aria-current": "page",
            }}
          >
            <Icon size={23} strokeWidth={2} />
          </Link>
        ))}
      </div>
    </nav>
  );
}
