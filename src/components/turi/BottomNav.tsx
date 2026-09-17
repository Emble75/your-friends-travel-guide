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
 * WICHTIG -- GEKOPPELT AN --bottom-nav-h IN styles.css: Scrollende Seiten
 * halten unten genau so viel Platz frei, wie diese Leiste hoch ist. Die
 * Karte laeuft sichtbar dahinter weiter; nur ihre schwebenden Knoepfe
 * werden um diesen Wert angehoben.
 *
 * Aktuell: 0.5rem Innenrand der Pille (p-1, oben + unten)
 *        + 3rem feste Hoehe der Eintraege (h-12)
 *        = 3.5rem, dazu der Abstand zum unteren Rand.
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
      {/*
       * Tintenschwarze Pille statt weisser: Vorher verschmolz die
       * Navigation im Feed mit den weissen Karten, die hinter ihr
       * vorbeilaufen -- weisser Rand auf weissem Rand. Dieselbe Tinte,
       * die auf der Karte die Orts-Pins und in der App jeden Knopf
       * traegt, hebt die Leiste jetzt unmissverstaendlich vom Inhalt ab.
       * Der aktive Reiter invertiert: weisse Pille auf schwarzer Leiste.
       */}
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-[1.375rem] bg-primary p-1 shadow-card">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="turi-tap flex h-12 w-16 flex-col items-center justify-center gap-0.5 rounded-[1.125rem] text-primary-foreground/55 transition-colors hover:text-primary-foreground/85"
            // Aktiver Reiter: invertiert -- weisse Flaeche auf dunkler
            // Leiste. aria-current markiert die aktive Seite fuer
            // Screenreader -- Farbe allein ist dafuer keine Information.
            activeProps={{
              className: "bg-card text-foreground shadow-sm font-bold",
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
