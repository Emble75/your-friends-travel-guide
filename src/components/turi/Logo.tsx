import { cn } from "@/lib/utils";

/**
 * Die Bildmarke: das T auf der Markenflaeche.
 *
 * Es gab zwischendurch eine gebaute Marke -- drei Kreise, deren
 * Negativraum ein T formte, mit einem Standort-Pin darin. Sie erzaehlte
 * mehr (Orte, Route, Karte), war aber als Zeichen unruhig und bei
 * kleinen Groessen kaum noch als T zu lesen. Zurueck also zum
 * schlichten Buchstaben.
 *
 * ZUR GROESSE: Der Buchstabe misst 58% der Kachelbreite -- ueber
 * Container-Einheiten (cqw), nicht ueber em. Mit em haengt die
 * Schriftgroesse an der geerbten Schriftgroesse der Umgebung, und jede
 * aufrufende Stelle musste zusaetzlich zur Kachelgroesse noch eine
 * passende text-[...]-Klasse mitgeben -- ging die verloren, schrumpfte
 * das T unbemerkt. Jetzt genuegt die Kachelgroesse allein.
 */
export function TuriMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "@container brand-gradient flex items-center justify-center rounded-2xl shadow-glow",
        className,
      )}
    >
      <span
        className="font-display font-bold leading-none text-white"
        style={{ fontSize: "58cqw", letterSpacing: "-0.04em" }}
      >
        T
      </span>
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
