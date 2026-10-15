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
 * Aktuell: 0.5rem Innenabstand oben (pt-2)
 *        + 1.3125rem Symbol (21px)
 *        + 0.25rem Abstand + 0.6875rem Beschriftung
 *        + 0.125rem Strich + 0.25rem Abstand + 0.25rem unten (pb-1)
 *        ~ 3.5rem, dazu der sichere Bereich am unteren Rand.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Main navigation"
      /*
       * Eine FESTE Leiste, keine schwebende Pille.
       *
       * Die Pille schwebte ueber dem Inhalt und liess links und rechts
       * Karte durchscheinen -- auf einer Karte sah sie dadurch aus wie
       * ein weiteres Bedienelement, das jemand darauf gelegt hat, und
       * nicht wie der Boden der App. Eine durchgehende Leiste mit einer
       * Haarlinie darueber schliesst den Bildschirm ab: Darueber ist
       * Inhalt, darunter Navigation.
       *
       * Dazu die Beschriftungen. Vier Symbole ohne Worte muss man
       * raten; "Map, Feed, People, Profile" muss man lesen -- einmal.
       */
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card"
      style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex w-full max-w-md items-stretch px-2 pt-2">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            aria-label={label}
            className="turi-tap flex flex-1 flex-col items-center gap-1 pb-1 pt-0.5 transition-colors"
            /*
             * Die Farbe des INAKTIVEN Zustands gehoert in inactiveProps,
             * nicht in die Grundklassen -- sonst kollidieren zwei
             * Utility-Klassen gleicher Spezifitaet und es gewinnt die,
             * die im erzeugten Stylesheet weiter unten steht.
             */
            activeProps={{ className: "text-foreground", "aria-current": "page" }}
            inactiveProps={{ className: "text-muted-foreground" }}
          >
            {({ isActive }) => (
              <>
                <Icon size={21} strokeWidth={1.9} />
                <span className="text-[0.6875rem] font-semibold leading-none">{label}</span>
                {/*
                  Der Strich darunter statt einer farbigen Flaeche: Er
                  markiert den aktiven Reiter, ohne dass die Leiste eine
                  zweite Farbe braucht. Im inaktiven Zustand bleibt er
                  als unsichtbarer Platzhalter stehen, damit die
                  Symbole nicht springen.
                */}
                <span
                  className={`h-0.5 w-4 rounded-full ${isActive ? "bg-brand" : "bg-transparent"}`}
                />
              </>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
