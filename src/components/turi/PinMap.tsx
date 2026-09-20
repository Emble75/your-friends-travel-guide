import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { List, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { currentLocationIcon, mapColor, ratingPinIcon } from "@/lib/mapIcons";
import { type Category } from "@/lib/categories";
import { currentPosition, tap } from "@/lib/native";
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
 * 3. DER EIGENE STANDORT. Derselbe Knopf wie auf der Hauptkarte. Er
 *    beantwortet auf einer fremden Karte die wichtigste Frage
 *    ueberhaupt: "Was davon ist da, wo ich gerade bin?" Ohne ihn muss
 *    man sich aus der Gesamtansicht von Hand in die eigene Stadt
 *    schieben. Danach sortiert auch die Liste nach Entfernung, ohne
 *    noch einmal nach dem Standort zu fragen.
 *
 * 4. RUHIGERE GRUNDKARTE. Zusaetzlich zu den Ortssymbolen sind auch
 *    Nahverkehrssymbole aus. Was bleibt, sind Strassen, Wasser, Namen --
 *    genug zur Orientierung, wenig genug, dass die Pins die einzige
 *    Farbe im Bild sind.
 */

/*
 * Kartenzustand ueber einen Seitenwechsel hinweg merken.
 *
 * Tippt man einen Pin an, wird die ganze Seite abgebaut und beim
 * Zurueckkehren neu erzeugt. Ohne dieses Gedaechtnis beginnt die Karte
 * wieder bei null: Sie passt sich erneut auf ALLE Orte der Person ein,
 * und man steht statt in der Strasse, die man gerade angesehen hat,
 * wieder vor der halben Weltkarte. Der Filter waere ebenfalls
 * zurueckgesetzt.
 *
 * Nach Karte getrennt (je Profil, je Ordner): Zwei Profile sind zwei
 * verschiedene Karten und duerfen sich nicht gegenseitig die Ansicht
 * ueberschreiben.
 *
 * Bewusst modulweit und nicht im React-Zustand -- genau der geht beim
 * Abbauen ja verloren. Ein vollstaendiger Neustart der App setzt alles
 * zurueck; das ist gewollt.
 */
const mapMemory = new Map<
  string,
  { lat: number; lng: number; zoom: number; filter: Category | null }
>();

/** Material der schwebenden Knoepfe -- wie auf der Hauptkarte. */
const FLOATING_CONTROL =
  "h-11 rounded-full border border-border bg-card/80 px-4 text-sm font-semibold shadow-card backdrop-blur-xl backdrop-saturate-150";

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
  mapKey,
  className,
}: {
  pins: PlaceListItem[];
  /** Ueberschrift der Liste, z. B. "Toms places". */
  heading: string;
  /**
   * Identitaet dieser Karte ("profile:<id>", "folder:<id>"). Darunter
   * werden Ausschnitt und Filter gemerkt, damit ein Abstecher auf eine
   * Ortsseite sie nicht verwirft.
   */
  mapKey: string;
  className?: string;
}) {
  const { ready, error } = useGoogleMaps();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const fittedRef = useRef(false);
  // Eigener Standort: Punkt und Genauigkeitskreis, wie auf der Hauptkarte.
  const meMarkerRef = useRef<google.maps.Marker | null>(null);
  const meCircleRef = useRef<google.maps.Circle | null>(null);
  const [filter, setFilter] = useState<Category | null>(
    () => mapMemory.get(mapKey)?.filter ?? null,
  );
  const [listOpen, setListOpen] = useState(false);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  /*
   * Der sichtbare Ausschnitt.
   *
   * Filterleiste und Liste beziehen sich auf das BILD, nicht auf den
   * Gesamtbestand: Sonst stand ueber einer Karte, auf der ein einziger
   * Ort liegt, "All 7" -- eine Zahl, die zu nichts gehoert, was man
   * gerade sieht.
   */
  const [bounds, setBounds] = useState<{
    swLat: number;
    swLng: number;
    neLat: number;
    neLng: number;
  } | null>(null);

  /*
   * Der Filter als Ref, damit ihn der Kartenzuhoerer lesen kann, ohne
   * dass die Karte bei jeder Filteraenderung neu aufgebaut wird.
   */
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
    const seen = mapMemory.get(mapKey);
    if (seen) mapMemory.set(mapKey, { ...seen, filter });
  }, [filter, mapKey]);

  // Orte ohne Koordinaten koennen nicht auf die Karte. In der Liste
  // stehen sie trotzdem -- sie existieren ja.
  const placed = useMemo(
    () =>
      pins.filter(
        (p): p is PlaceListItem & { lat: number; lng: number } => p.lat != null && p.lng != null,
      ),
    [pins],
  );

  /*
   * Was im Bild liegt. Orte ohne Koordinaten koennen per Definition
   * nicht darin sein -- sie stehen dafuer vollstaendig im Feed-Reiter
   * derselben Seite.
   */
  const visible = useMemo(() => {
    if (!bounds) return placed;
    return placed.filter(
      (p) =>
        p.lat >= bounds.swLat &&
        p.lat <= bounds.neLat &&
        p.lng >= bounds.swLng &&
        p.lng <= bounds.neLng,
    );
  }, [placed, bounds]);

  // Marker: alle Orte der Person. Was ausserhalb des Bildes liegt,
  // stoert nicht und ist sofort da, sobald man dorthin schiebt.
  const shown = useMemo(
    () => (filter ? placed.filter((p) => p.category === filter) : placed),
    [placed, filter],
  );
  // Liste und Filterleiste: nur das Sichtbare.
  const listed = useMemo(
    () => (filter ? visible.filter((p) => p.category === filter) : visible),
    [visible, filter],
  );

  /*
   * Zum eigenen Standort springen.
   *
   * Bewusst EINMALIGE Ortung statt laufender Verfolgung: Diese Karte
   * steht in einer Seite, die man durchblaettert, nicht im Vordergrund
   * wie die Hauptkarte. Eine dauerhaft laufende Ortung zoege hier nur
   * Akku, ohne dass jemand hinsieht.
   */
  async function goToMe() {
    void tap();
    setLocating(true);
    const c = await currentPosition();
    setLocating(false);
    if (!c) {
      toast.error("Couldn't get your location");
      return;
    }
    setMyPos({ lat: c.lat, lng: c.lng });
    const map = mapRef.current;
    if (!map) return;

    if (!meMarkerRef.current) {
      meMarkerRef.current = new google.maps.Marker({
        map,
        // Unter den Ortspins: der eigene Punkt soll sie nicht verdecken,
        // wenn man genau davorsteht.
        zIndex: 1,
        clickable: false,
        icon: currentLocationIcon(),
      });
      meCircleRef.current = new google.maps.Circle({
        map,
        strokeOpacity: 0,
        fillColor: mapColor("me"),
        fillOpacity: 0.12,
        clickable: false,
      });
    }
    meMarkerRef.current.setPosition(c);
    meCircleRef.current?.setCenter(c);
    // Bei guter Ortung waere der Kreis winzig und nur Unruhe.
    meCircleRef.current?.setRadius(c.accuracy > 25 ? c.accuracy : 0);

    /*
     * Ab jetzt nicht mehr automatisch einpassen. Treffen die Orte erst
     * nach diesem Tippen ein, wuerde das Einpassen die Kamera sonst
     * wieder von hier wegziehen -- und man stuende erneut vor der
     * Gesamtansicht, obwohl man ausdruecklich "zu mir" gesagt hat.
     */
    fittedRef.current = true;
    map.panTo(c);
    // 14 statt naeher: Die Frage lautet "was ist hier in der Gegend?",
    // nicht "wo genau stehe ich".
    map.setZoom(14);
  }

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const remembered = mapMemory.get(mapKey);
    mapRef.current = new google.maps.Map(containerRef.current, {
      center: remembered ? { lat: remembered.lat, lng: remembered.lng } : { lat: 20, lng: 0 },
      zoom: remembered?.zoom ?? 2,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      clickableIcons: false,
      styles: QUIET_STYLE,
    });
    // Gab es schon eine Ansicht, ist sie die richtige -- dann NICHT
    // erneut einpassen.
    if (remembered) fittedRef.current = true;

    mapRef.current.addListener("idle", () => {
      const map = mapRef.current;
      const c = map?.getCenter();
      if (!map || !c) return;
      mapMemory.set(mapKey, {
        lat: c.lat(),
        lng: c.lng(),
        zoom: map.getZoom() ?? 12,
        filter: filterRef.current,
      });
      const b = map.getBounds();
      if (b) {
        const ne = b.getNorthEast();
        const sw = b.getSouthWest();
        setBounds({ swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() });
      }
    });
  }, [ready, mapKey]);

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

  // Beim Verlassen der Seite aufraeumen.
  useEffect(() => {
    const marker = meMarkerRef;
    const circle = meCircleRef;
    return () => {
      marker.current?.setMap(null);
      circle.current?.setMap(null);
      marker.current = null;
      circle.current = null;
    };
  }, []);

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
        <CategoryFilterBar items={visible} value={filter} onChange={setFilter} />
      </div>

      {/*
        Beide Knoepfe in einer Saeule, wie auf der Hauptkarte -- dort
        sitzt die Liste ueber dem Standort, und das soll man nicht
        zweimal lernen muessen.
      */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
        {listed.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            aria-label={`Show these ${listed.length} places as a list`}
            className={FLOATING_CONTROL}
            onClick={() => {
              void tap();
              setListOpen(true);
            }}
          >
            <List size={17} className="mr-1.5" />
            {listed.length}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Show my location"
          disabled={locating}
          onClick={goToMe}
          className={`size-11 rounded-full border border-border bg-card/80 shadow-card backdrop-blur-xl backdrop-saturate-150 ${
            locating ? "opacity-70" : ""
          }`}
        >
          <LocateFixed size={19} />
        </Button>
      </div>

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
            myPos={myPos}
            showCity
            summary={`${listed.length} ${listed.length === 1 ? "place" : "places"} in this view`}
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
