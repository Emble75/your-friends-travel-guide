import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { List } from "lucide-react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { ratingPinIcon } from "@/lib/mapIcons";
import { type Category } from "@/lib/categories";
import { tap } from "@/lib/native";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CategoryFilterBar } from "./CategoryFilter";
import { PlaceList, type PlaceListItem } from "./PlaceList";

/*
 * Die Karte einer PERSON oder eines ORDNERS -- nicht die der Welt.
 *
 * Sie loest die frueher hier stehende PlacesMiniMap ab, die im Kern nur
 * Marker auf eine gewoehnliche Google-Karte setzte. Drei Unterschiede,
 * und jeder davon hat einen Grund:
 *
 * 1. NUR IHRE ORTE. Googles eigene Symbole -- jedes Restaurant, jede
 *    Apotheke, jede Tankstelle -- sind ausgeblendet. Auf der Hauptkarte
 *    sind sie richtig: Dort suchst du etwas, und unsere Pins sind die
 *    Empfehlungen darin. Hier schaust du auf die Auswahl EINER Person;
 *    alles andere ist Rauschen, in dem ihre zwoelf Pins untergehen.
 *    (Genau dieser Unterschied traegt spaeter die Influencer-Idee: die
 *    Karte eines Kontos ist dann ein Werk, keine Weltkarte mit Notizen.)
 *
 * 2. FILTER UND LISTE. Bei zweihundert Orten ist "zeig mir die Cafes"
 *    die erste Frage, und "was davon ist das Beste" die zweite. Beides
 *    beantwortet dieselbe Leiste und dieselbe Liste wie auf der
 *    Hauptkarte -- eine Geste, die man nicht zweimal lernen muss.
 *
 * 3. RUHIGERE GRUNDKARTE. Zusaetzlich zu den Ortssymbolen sind auch
 *    Nahverkehrssymbole aus. Was bleibt, sind Strassen, Wasser, Namen --
 *    genug zur Orientierung, wenig genug, dass die Pins die einzige
 *    Farbe im Bild sind.
 */

/** Grundkarte ohne Googles eigene Orts- und Verkehrssymbole. */
const QUIET_STYLE: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  // Parks als Flaeche behalten, aber ohne Beschriftung: Sie geben der
  // Karte Struktur, ihre Namen konkurrieren aber mit unseren Pins.
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }] },
];

export function PinMap({
  pins,
  heading,
  className,
}: {
  pins: PlaceListItem[];
  /** Ueberschrift der Liste, z. B. "Toms places". */
  heading: string;
  className?: string;
}) {
  const { ready, error } = useGoogleMaps();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const fittedRef = useRef(false);
  const [filter, setFilter] = useState<Category | null>(null);
  const [listOpen, setListOpen] = useState(false);

  // Orte ohne Koordinaten koennen nicht auf die Karte. In der Liste
  // stehen sie trotzdem -- sie existieren ja.
  const placed = useMemo(
    () =>
      pins.filter(
        (p): p is PlaceListItem & { lat: number; lng: number } => p.lat != null && p.lng != null,
      ),
    [pins],
  );

  const shown = useMemo(
    () => (filter ? placed.filter((p) => p.category === filter) : placed),
    [placed, filter],
  );
  const listed = useMemo(
    () => (filter ? pins.filter((p) => p.category === filter) : pins),
    [pins, filter],
  );

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(containerRef.current, {
      center: { lat: 20, lng: 0 },
      zoom: 2,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      clickableIcons: false,
      styles: QUIET_STYLE,
    });
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = shown.map((p) => {
      const marker = new google.maps.Marker({
        map: mapRef.current!,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        icon: ratingPinIcon(p.rating, { saved: p.rating === undefined && p.saved }),
      });
      marker.addListener("click", () => {
        void tap();
        navigate({ to: "/place/$placeId", params: { placeId: p.id } });
      });
      return marker;
    });

    /*
     * Einpassen nur EINMAL, beim ersten Eintreffen der Orte.
     *
     * Bei jedem Datenwechsel einzupassen, waere hier derselbe Fehler wie
     * frueher auf der Hauptkarte: Wer hineingezoomt hat und dann einen
     * Filter setzt, wuerde aus seiner Ansicht geworfen. Der Filter soll
     * Pins ausblenden, nicht die Kamera bewegen.
     */
    if (!fittedRef.current && placed.length > 0) {
      fittedRef.current = true;
      const box = new google.maps.LatLngBounds();
      placed.forEach((p) => box.extend({ lat: p.lat, lng: p.lng }));
      mapRef.current.fitBounds(box, 48);
    }
  }, [ready, shown, placed, navigate]);

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-border bg-muted shadow-card ${className ?? ""}`}
    >
      <div ref={containerRef} className="size-full" />

      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary">
          <p className="px-6 text-center text-sm text-muted-foreground">
            {error ?? "Loading map…"}
          </p>
        </div>
      ) : null}

      {/* Die Leisten schweben ueber der Karte, wie auf der Hauptkarte. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 space-y-3 p-4">
        <CategoryFilterBar items={pins} value={filter} onChange={setFilter} />
      </div>

      {listed.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          aria-label={`Show these ${listed.length} places as a list`}
          className="absolute bottom-4 right-4 h-11 rounded-full border border-border bg-card/80 px-4 text-sm font-semibold shadow-card backdrop-blur-xl backdrop-saturate-150"
          onClick={() => {
            void tap();
            setListOpen(true);
          }}
        >
          <List size={17} className="mr-1.5" />
          {listed.length}
        </Button>
      ) : null}

      <Sheet open={listOpen} onOpenChange={(o) => !o && setListOpen(false)}>
        <SheetContent
          side="bottom"
          className="flex max-h-[78dvh] flex-col rounded-t-3xl border-0 p-0"
        >
          <SheetHeader className="px-6 pb-2 pt-6 text-left">
            <SheetTitle className="truncate pr-8 text-lg font-bold">{heading}</SheetTitle>
          </SheetHeader>
          <PlaceList
            items={listed}
            showCity
            summary={`${listed.length} ${listed.length === 1 ? "place" : "places"}`}
            onPick={(item) => {
              setListOpen(false);
              navigate({ to: "/place/$placeId", params: { placeId: item.id } });
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
