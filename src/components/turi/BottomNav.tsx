import { Link } from "@tanstack/react-router";
import { Map, Rows3, Search, User } from "lucide-react";

const items = [
  { to: "/map", label: "Map", icon: Map },
  { to: "/feed", label: "Feed", icon: Rows3 },
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
 * zeichnet ihn weich -- sie liest sich dadurch als Glas ueber der Seite
 * statt als weiterer Block darauf.
 *
 * ZUM FARBTON, denn der war zwischenzeitlich falsch: Eine Fassung trug
 * den Seitenhintergrund statt des Kartenweiss, aus Sorge, Weiss wuerde
 * vor den weissen Feed-Karten verschwinden. Das stimmt fuer eine
 * durchgehende Leiste, die buendig am Inhalt klebt -- nicht fuer eine
 * schwebende Pille: Die trennt sich durch Rand, Schatten und den
 * Abstand ringsum, nicht durch ihre Fuellfarbe. Der Seitenton machte
 * sie dagegen zum einzigen erhoehten Element der App, das nicht
 * aussieht wie eine Karte. Jetzt dieselbe Flaeche, Haarlinie und
 * Schatten wie jede andere Karte -- nur rund und durchscheinend.
 *
 * NUR SYMBOLE, KEINE BESCHRIFTUNG: macht die Pille kompakt genug, um zu
 * schweben. aria-label traegt den Namen fuer Screenreader nach.
 *
 * Das Feed-Symbol ist bewusst dasselbe wie der Feed-Umschalter auf
 * Profilseiten (Rows3), nicht ein Haus: Ein Haus hiesse "Startseite",
 * der Reiter zeigt aber einen Feed -- und zwei verschiedene Zeichen
 * fuer dieselbe Sache in derselben App sind eine Stolperstelle.
 *
 * WICHTIG -- GEKOPPELT AN --bottom-nav-h IN styles.css: Jede Seite haelt
 * unten so viel Platz frei, wie diese Leiste hoch ist, und die Karte
 * berechnet daraus ihre Hoehe. Aendert sich hier ein Abstand, muss der
 * Wert dort mitgezogen werden -- sonst rutschen die schwebenden
 * Kartenknoepfe darunter.
 *
 * Aktuell: 0.5rem Innenrand der Pille (p-1, oben + unten)
 *        + 3rem Hoehe der Eintraege (h-12)
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
      {/*
        Volle Breite statt enger Pille: Die Symbole verteilen sich ueber
        den Bildschirm, statt in der Mitte zusammenzuruecken. max-w-md
        entspricht der Inhaltsbreite der App (app-shell) -- auf breiten
        Bildschirmen laeuft die Leiste sonst quer ueber die ganze Seite,
        waehrend der Inhalt darueber schmal bleibt.
      */}
      <div className="pointer-events-auto flex w-full max-w-md items-center rounded-full border border-border bg-card/80 p-1 shadow-card backdrop-blur-xl backdrop-saturate-150">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            aria-label={label}
            className="turi-tap flex h-12 flex-1 items-center justify-center rounded-full transition-colors"
            // Aktiver Reiter: die einzige Stelle in der Kern-Navigation,
            // die Markenfarbe traegt. Die Pille dahinter macht den
            // Zustand auch ohne Farbsehen als Flaeche erkennbar.
            // aria-current markiert die aktive Seite fuer Screenreader --
            // Farbe allein ist dafuer keine Information.
            /*
             * Die Farbe des INAKTIVEN Zustands gehoert in inactiveProps,
             * nicht in die Grundklassen.
             *
             * Stand sie dort, kollidierte sie mit text-brand: Beide sind
             * gewoehnliche Utility-Klassen gleicher Spezifitaet, es
             * gewinnt also die, die im erzeugten Stylesheet WEITER UNTEN
             * steht -- und das war text-muted-foreground. Der aktive
             * Reiter bekam dadurch zwar die blaue Flaeche, aber ein
             * graues Symbol. Getrennt gibt es den Konflikt nicht.
             */
            activeProps={{
              className: "bg-brand-soft text-brand",
              "aria-current": "page",
            }}
            inactiveProps={{ className: "text-muted-foreground" }}
          >
            <Icon size={23} strokeWidth={2} />
          </Link>
        ))}
      </div>
    </nav>
  );
}
