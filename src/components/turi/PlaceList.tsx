import { useEffect, useMemo, useState } from "react";
import {
  BedDouble,
  Bookmark,
  Building2,
  Coffee,
  Landmark,
  MapPin,
  Martini,
  Mountain,
  Navigation,
  Umbrella,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { type Category } from "@/lib/categories";
import { distanceLabel, metersBetween } from "@/lib/geo";
import { currentPosition, tap } from "@/lib/native";
import { directionsUrl } from "@/lib/turi";

/*
 * Orte als Liste -- eine Darstellung fuer die ganze App.
 *
 * Sie entstand fuer die Karte ("was liegt in diesem Ausschnitt?") und
 * steht jetzt genauso in der Wunschliste. Beides ist dieselbe Frage --
 * "welcher dieser Orte ist der richtige?" -- und wurde vorher
 * verschieden beantwortet: hier eine sortierbare Liste mit Note und
 * Entfernung, dort eine blosse Aufzaehlung aus Lesezeichen und Stadt.
 *
 * Sortieren nach Note ODER Entfernung, weil beide Fragen echt sind:
 * "was ist das Beste hier" und "was ist von mir aus zu Fuss erreichbar".
 */

export type PlaceListItem = {
  id: string;
  name: string;
  category: Category;
  /*
   * Von Hand angelegte Orte koennen ohne Koordinaten in der Datenbank
   * stehen. Sie gehoeren trotzdem in die Liste -- nur eine Entfernung
   * gibt es fuer sie nicht, und beim Sortieren nach Naehe stehen sie
   * hinten statt faelschlich bei Null Grad Nord.
   */
  lat: number | null;
  lng: number | null;
  /** Durchschnitt aus dem eigenen Kreis -- fehlt, wenn es noch keinen gibt. */
  rating?: number;
  /** Wie viele aus dem Kreis den Ort bewertet haben. */
  friends: number;
  /** Steht auf der eigenen Wunschliste. */
  saved: boolean;
  city?: string | null;
};

export const CATEGORY_LABELS: Record<Category, string> = {
  Restaurant: "Restaurants",
  Cafe: "Cafés",
  Bar: "Bars",
  Hotel: "Hotels",
  Beach: "Beaches",
  Museum: "Museums",
  Landmark: "Landmarks",
  Nature: "Nature",
  Other: "Other",
};

export const CATEGORY_ICONS: Record<Category, typeof Coffee> = {
  Restaurant: UtensilsCrossed,
  Cafe: Coffee,
  Bar: Martini,
  Hotel: BedDouble,
  Beach: Umbrella,
  Museum: Building2,
  Landmark: Landmark,
  Nature: Mountain,
  Other: MapPin,
};

/** Einzahl fuer die Zeile unter dem Namen ("Cafés" -> "Café"). */
function categoryWord(category: Category) {
  return CATEGORY_LABELS[category].replace(/s$/, "");
}

export function PlaceList({
  items,
  myPos,
  summary,
  onPick,
  showCity = false,
  showDirections = false,
}: {
  items: PlaceListItem[];
  /**
   * Der bereits bekannte Standort. Wird er mitgegeben (Karte), kostet
   * "Nearest" keine Nachfrage. Fehlt er (Wunschliste), wird erst beim
   * Antippen von "Nearest" danach gefragt -- ein Standort-Dialog, den
   * niemand angefordert hat, ist eine Zumutung.
   */
  myPos?: { lat: number; lng: number } | null;
  summary?: string;
  /*
   * Fehlt der Rueckruf, ist die Zeile bewusst NICHT antippbar.
   *
   * In der Wunschliste ist das so gewollt: Die Liste beantwortet die
   * Frage "was habe ich mir gemerkt" bereits vollstaendig, und der
   * Hinweis darueber sagt, dass die Orte auch auf der eigenen Karte
   * stehen. Ein Tippen, das auf eine Ortsseite fuehrt, von der man
   * wieder zurueckmuss, ist dort ein Umweg ohne Gewinn.
   */
  onPick?: (item: PlaceListItem) => void;
  showCity?: boolean;
  /*
   * Zeigt rechts ein Wegweiser-Zeichen, das den Ort in Google Maps zur
   * Navigation oeffnet. Vor allem fuer Listen ohne Tippen gedacht --
   * dort ist es die einzige Handlung, die die Zeile anbietet.
   */
  showDirections?: boolean;
}) {
  const [sort, setSort] = useState<"rating" | "distance">("rating");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(myPos ?? null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (myPos) setPos(myPos);
  }, [myPos]);

  const rows = useMemo(() => {
    const withDistance = items.map((item) => ({
      item,
      meters:
        pos && item.lat != null && item.lng != null
          ? metersBetween(pos, { lat: item.lat, lng: item.lng })
          : null,
    }));
    if (sort === "distance" && pos) {
      return withDistance.sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));
    }
    // Nach Note; Orte ohne Bewertung ans Ende -- sie sind keine
    // Empfehlung, sondern ein eigener Merkzettel.
    return withDistance.sort((a, b) => (b.item.rating ?? -1) - (a.item.rating ?? -1));
  }, [items, pos, sort]);

  async function chooseNearest() {
    void tap();
    if (pos) {
      setSort("distance");
      return;
    }
    setLocating(true);
    const c = await currentPosition();
    setLocating(false);
    if (!c) {
      toast.error("Couldn't get your location");
      return;
    }
    setPos({ lat: c.lat, lng: c.lng });
    setSort("distance");
  }

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <div className="flex items-center gap-3 px-3 pb-2">
        {summary ? (
          <span className="turi-meta min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {summary}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary p-1">
          <button
            type="button"
            onClick={() => {
              void tap();
              setSort("rating");
            }}
            aria-pressed={sort === "rating"}
            className={`turi-tap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              sort === "rating" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Top rated
          </button>
          <button
            type="button"
            onClick={chooseNearest}
            disabled={locating}
            aria-pressed={sort === "distance"}
            className={`turi-tap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              sort === "distance" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {locating ? "Locating…" : "Nearest"}
          </button>
        </span>
      </div>

      <ul className="max-h-full overflow-y-auto pb-8">
        {rows.map(({ item, meters }) => {
          const Icon = CATEGORY_ICONS[item.category];
          /*
              Die Zeile ist ein Behaelter, nicht ein einziger Knopf.
              Grund: Der Wegweiser ist ein eigener Link, und ein Link im
              Knopf ist ungueltiges Markup -- der Browser zieht ihn heraus
              und die Zeile bricht auseinander. Antippbar ist deshalb nur
              der vordere Teil; die Zeichen rechts stehen daneben.
            */
          const body = (
            <>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <Icon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.name}</span>
                <span className="turi-meta block truncate text-xs text-muted-foreground">
                  {[
                    categoryWord(item.category),
                    showCity ? item.city : null,
                    item.friends > 0
                      ? `${item.friends} ${item.friends === 1 ? "friend" : "friends"}`
                      : null,
                    meters !== null ? distanceLabel(meters) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </>
          );
          return (
            <li key={item.id}>
              <div
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${
                  onPick ? "transition-colors hover:bg-secondary" : ""
                }`}
              >
                {onPick ? (
                  <button
                    type="button"
                    onClick={() => {
                      void tap();
                      onPick(item);
                    }}
                    className="turi-tap flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
                )}

                {showDirections ? (
                  <a
                    href={directionsUrl({
                      name: item.name,
                      city: item.city ?? null,
                      lat: item.lat,
                      lng: item.lng,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void tap()}
                    aria-label={`Directions to ${item.name}`}
                    className="turi-tap flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary"
                  >
                    <Navigation size={15} />
                  </a>
                ) : null}

                {/*
                    Dieselben zwei Zeichen wie auf der Karte -- schwarze Note
                    und blaues Lesezeichen. Neben ausgeschriebenem Text
                    erklaeren sie nebenbei, was die Pins draussen bedeuten.
                  */}
                {item.rating !== undefined ? (
                  <span className="turi-meta shrink-0 rounded-md bg-map-pin px-1.5 py-0.5 text-xs font-bold text-white">
                    {item.rating.toFixed(1)}
                  </span>
                ) : item.saved ? (
                  <Bookmark size={16} className="shrink-0 text-map-accent" fill="currentColor" />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
