import { useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useServerFn } from "@tanstack/react-start";
import { searchMapPlaces } from "@/lib/maps.functions";
import { looksLikeArea, zoomForPlace } from "@/lib/map-area";
import { getErrorMessage } from "@/lib/turi";
import { deviceLanguage } from "@/lib/device-language";
import { List, LocateFixed, Maximize2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { currentLocationIcon, mapColor, ratingPinIcon } from "@/lib/mapIcons";
import { type Category } from "@/lib/categories";
import { currentPosition, tap } from "@/lib/native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CategoryFilterBar } from "./CategoryFilter";
import { PlaceList, type PlaceListItem } from "./PlaceList";
import { PlaceSheet, type SheetTarget } from "./PlaceSheet";

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
 * 3. SUCHE IN IHREN ORTEN -- zuerst. Getippt wird gegen Name und Stadt
 *    der Pins, die Karte springt auf die Treffer. Das ist hier die
 *    richtige erste Frage ("hat Tom etwas in Lissabon?"), sie kostet
 *    nichts und antwortet sofort.
 *
 *    FINDET SICH NICHTS, ist die Suche damit aber nicht zu Ende: Wer
 *    "Stockholm" tippt, will nach Stockholm -- auch wenn die Person
 *    dort nichts hat. Dann faehrt die Karte auf Zuruf trotzdem hin
 *    ("Go there anyway"). Bewusst auf Zuruf und nicht von selbst: Diese
 *    Suche geht an Google und kostet, waehrend die erste umsonst ist.
 *    Ein Tastendruck soll das nicht ausloesen, ein bewusster Tipp
 *    schon.
 *
 * 4. DIESELBE VORSCHAU WIE AUF DER HAUPTKARTE. Ein Tipp auf einen Pin
 *    oeffnet das Panel von unten -- Note, Oeffnungszeit, Entfernung,
 *    Merken -- und nicht sofort die ganze Ortsseite. Auf einer Karte
 *    schaut man meist nur kurz nach und tippt dann den naechsten Pin
 *    an; der Sprung auf eine eigene Seite unterbricht das jedes Mal
 *    und baut beim Zurueckkommen die Karte neu auf.
 *
 * 5. DER EIGENE STANDORT. Derselbe Knopf wie auf der Hauptkarte. Er
 *    beantwortet auf einer fremden Karte die wichtigste Frage
 *    ueberhaupt: "Was davon ist da, wo ich gerade bin?" Ohne ihn muss
 *    man sich aus der Gesamtansicht von Hand in die eigene Stadt
 *    schieben. Danach sortiert auch die Liste nach Entfernung, ohne
 *    noch einmal nach dem Standort zu fragen.
 *
 * 6. RUHIGERE GRUNDKARTE. Zusaetzlich zu den Ortssymbolen sind auch
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
const FLOATING =
  "border border-border bg-card/80 shadow-card backdrop-blur-xl backdrop-saturate-150";

const FLOATING_CONTROL =
  "h-11 rounded-full border border-border bg-card/80 px-4 text-sm font-semibold shadow-card backdrop-blur-xl backdrop-saturate-150";

/** Grundkarte ohne Googles eigene Orts- und Verkehrssymbole. */
/*
 * Die kleinste Zoomstufe, bei der die Karte die Flaeche noch fuellt.
 *
 * Auf einer Mercator-Karte ist die Welt bei Zoom 0 genau 256 Pixel hoch
 * und verdoppelt sich mit jeder Stufe. Ist die Flaeche hoeher als die
 * Welt, malt Google oben und unten Grau -- genau die Raender, die in der
 * Vorschau auftauchten.
 *
 * Eine feste Untergrenze war der falsche Weg: Sie zwang eine Weltkarte
 * auf eine Stufe, auf der nur noch ein Ausschnitt passt, und wer Orte
 * auf mehreren Kontinenten hatte, landete mitten im Nordatlantik -- also
 * auf Groenland. Die Grenze muss von der Flaeche kommen, nicht von einer
 * Zahl: Eine flache Vorschau darf die ganze Welt zeigen, die
 * bildschirmfuellende Ansicht braucht eine Stufe mehr.
 */
function minZoomFor(element: HTMLElement | null): number {
  const height = element?.clientHeight ?? 0;
  if (height <= 0) return 1;
  return Math.max(0, Math.ceil(Math.log2(height / 256)));
}

const QUIET_STYLE: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  // Parks als Flaeche behalten, aber ohne Beschriftung: Sie geben der
  // Karte Struktur, ihre Namen konkurrieren aber mit unseren Pins.
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }] },
];

/** Kurzform, damit die Sprache nur mitgeht, wenn es eine gibt. */
function langArg() {
  const language = deviceLanguage();
  return language ? { language } : {};
}

export function PinMap({
  pins,
  heading,
  mapKey,
  className,
  onlyUserId = null,
  expandable = true,
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
  /** Wem diese Karte gehoert -- das Panel zeigt dann nur deren Bewertung. */
  onlyUserId?: string | null;
  /*
   * Die eingebettete Karte ist eine Vorschau: ein Tipp macht sie gross.
   *
   * In der Kachel im Profil laesst sich kaum etwas erkunden -- sie ist
   * ein Ausschnitt. Wer die Orte einer Person wirklich durchgehen will
   * (und genau das ist der Fall bei jemandem, dem man wegen seiner
   * Empfehlungen folgt), braucht dieselbe Flaeche wie auf Discover.
   */
  expandable?: boolean;
}) {
  const { ready, error } = useGoogleMaps();
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
  const [full, setFull] = useState(false);
  const [selected, setSelected] = useState<SheetTarget | null>(null);
  const [query, setQuery] = useState("");
  const [jumping, setJumping] = useState(false);
  const searchFn = useServerFn(searchMapPlaces);
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
   * Die Suche laeuft ueber Name UND Stadt. Beides ist gemeint: "Honest
   * Greens" findet den einen Ort, "Lissabon" alles, was dort liegt.
   */
  const term = query.trim().toLowerCase();
  const queried = useMemo(() => {
    if (!term) return placed;
    return placed.filter(
      (p) => p.name.toLowerCase().includes(term) || (p.city ?? "").toLowerCase().includes(term),
    );
  }, [placed, term]);

  /*
   * Was im Bild liegt. Orte ohne Koordinaten koennen per Definition
   * nicht darin sein -- sie stehen dafuer vollstaendig im Feed-Reiter
   * derselben Seite.
   */
  const visible = useMemo(() => {
    if (!bounds) return queried;
    return queried.filter(
      (p) =>
        p.lat >= bounds.swLat &&
        p.lat <= bounds.neLat &&
        p.lng >= bounds.swLng &&
        p.lng <= bounds.neLng,
    );
  }, [queried, bounds]);

  // Marker: alle Treffer, auch ausserhalb des Bildes -- die Kamera zieht
  // gleich hin.
  const shown = useMemo(
    () => (filter ? queried.filter((p) => p.category === filter) : queried),
    [queried, filter],
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
      zoom: remembered?.zoom ?? minZoomFor(containerRef.current),
      /*
       * Nicht weiter hinauszoomen als bis hierher.
       *
       * Auf einer Mercator-Karte ist die Welt bei Zoom 0 genau 256 Pixel
       * hoch. Ist die Flaeche hoeher als die Welt, malt Google oben und
       * unten Grau -- genau die Raender, die in der Vorschau auftauchten.
       * Sie entstanden beim Einpassen: Wer Orte auf mehreren Kontinenten
       * hat, bekommt einen Ausschnitt, der die ganze Welt umfasst.
       *
       * Ab Zoom 3 ist die Welt ueber 2000 Pixel hoch und fuellt jede
       * Flaeche, die auf einem Telefon vorkommt.
       */
      minZoom: minZoomFor(containerRef.current),
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
        setSelected({ kind: "local", id: p.id, name: p.name, lat: p.lat, lng: p.lng });
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
      /*
       * fitBounds rechnet ohne Ruecksicht auf minZoom und kann darunter
       * landen. Nach dem Einpassen deshalb nachziehen -- sonst bleiben
       * die grauen Raender genau in dem Fall, fuer den die Grenze
       * gedacht ist.
       */
      const listener = google.maps.event.addListenerOnce(mapRef.current, "idle", () => {
        const map = mapRef.current;
        const floor = minZoomFor(containerRef.current);
        if (map && (map.getZoom() ?? floor) < floor) map.setZoom(floor);
      });
      return () => google.maps.event.removeListener(listener);
    }
    return;
  }, [ready, shown, placed]);

  /*
   * Bei einer Suche auf die Treffer springen.
   *
   * Verzoegert, damit die Karte nicht bei jedem Tastendruck einen Satz
   * macht. Ohne diesen Sprung waere die Suche auf einer Weltkarte
   * wirkungslos: Die Treffer laegen irgendwo ausserhalb des Bildes, und
   * man saehe nur, dass die Pins weniger geworden sind.
   */
  const debouncedTerm = useDebouncedValue(term, 350);
  useEffect(() => {
    if (!ready || !mapRef.current || !debouncedTerm) return;
    const hits = placed.filter(
      (p) =>
        p.name.toLowerCase().includes(debouncedTerm) ||
        (p.city ?? "").toLowerCase().includes(debouncedTerm),
    );
    if (hits.length === 0) return;
    const box = new google.maps.LatLngBounds();
    hits.forEach((p) => box.extend({ lat: p.lat, lng: p.lng }));
    mapRef.current.fitBounds(box, 64);
    // Ein einzelner Treffer wuerde sonst bis zur Hausnummer
    // herangezoomt -- der Umgebung beraubt sagt er wenig.
    if (hits.length === 1) mapRef.current.setZoom(15);
    fittedRef.current = true;
  }, [ready, debouncedTerm, placed]);

  /*
   * Dorthin fahren, wo die Person nichts hat.
   *
   * Nutzt dieselbe Ortssuche wie die Hauptkarte. Sie ist die teuerste
   * Abfrage im Haus -- aber sie laeuft nur auf ausdruecklichen Wunsch,
   * und ihre Antwort liegt 60 Tage im gemeinsamen Zwischenspeicher.
   * Staedtenamen sind eine kleine, sich staendig wiederholende Menge;
   * "Stockholm" wird nach dem ersten Mal fuer alle aus dem Speicher
   * bedient.
   */
  async function jumpAnywhere() {
    const map = mapRef.current;
    const q = query.trim();
    if (!map || q.length < 2 || jumping) return;
    void tap();
    setJumping(true);
    try {
      /*
       * BEWUSST OHNE Kartenmitte.
       *
       * Die Ortssuche gewichtet Treffer nach Naehe zum mitgegebenen
       * Punkt. Wer auf einer Karte, die gerade Norditalien zeigt, "Roma"
       * tippt, landete dadurch in einem "Roma" bei Treviso statt in Rom.
       * Fuer "bring mich dorthin" ist die Naehe genau das falsche
       * Kriterium -- man will ja WEG von hier.
       *
       * Nebenwirkung, die passt: Ohne Ortsbezug liegt die Antwort unter
       * einem gemeinsamen Schluessel im Zwischenspeicher. "Roma" wird
       * damit fuer alle Nutzer nur einmal bei Google angefragt.
       */
      const results = await searchFn({ data: { query: q, ...langArg() } });
      /*
       * Unter den Treffern zuerst eine Stadt oder Region suchen. Google
       * liefert zu "Roma" auch Restaurants und Strassen; gemeint ist bei
       * dieser Frage fast immer das Gebiet.
       */
      const top = results.find(looksLikeArea) ?? results[0];
      if (!top) {
        toast.info("Nothing found");
        return;
      }
      // Ab hier bestimmt der Nutzer den Ausschnitt, nicht mehr die Daten.
      fittedRef.current = true;
      map.panTo({ lat: top.lat, lng: top.lng });
      map.setZoom(zoomForPlace(top));
    } catch (e) {
      toast.error(getErrorMessage(e, "Search failed"));
    } finally {
      setJumping(false);
    }
  }

  /*
   * In der Vorschau nimmt die Karte keine Gesten an.
   *
   * Sonst streiten sich zwei Bedeutungen um dieselbe Bewegung: Ein Wisch
   * waere zugleich "Karte verschieben" und "Seite scrollen", und ein
   * Tipp waere zugleich "oeffnen" und "Pin auswaehlen". In der Vorschau
   * gilt nur eins: antippen und gross machen.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const floor = minZoomFor(containerRef.current);
    map.setOptions({
      gestureHandling: full || !expandable ? "greedy" : "none",
      minZoom: floor,
    });
    if ((map.getZoom() ?? floor) < floor) map.setZoom(floor);
    // Die Mitte ueber den Groessenwechsel retten -- sonst rutscht der
    // Ausschnitt, weil sich das Seitenverhaeltnis aendert.
    const center = map.getCenter();
    const id = requestAnimationFrame(() => {
      if (center) map.setCenter(center);
    });
    return () => cancelAnimationFrame(id);
  }, [full, expandable, ready]);

  // Waehrend die Karte den Bildschirm fuellt, scrollt die Seite darunter
  // nicht mit.
  useEffect(() => {
    if (!full) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [full]);

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
      className={
        full
          ? "fixed inset-0 z-50 overflow-hidden bg-muted"
          : `relative overflow-hidden rounded-3xl border border-border bg-muted shadow-card ${className ?? ""}`
      }
    >
      <div ref={containerRef} className="size-full" />

      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary">
          <p className="px-6 text-center text-sm text-muted-foreground">
            {error ?? "Loading map…"}
          </p>
        </div>
      ) : null}

      {/*
        Die Vorschau: eine Flaeche, ein Tipp. Der Hinweis unten sagt, was
        passiert -- ohne ihn sieht eine Karte, die auf Wischen nicht
        reagiert, schlicht kaputt aus.
      */}
      {expandable && !full ? (
        <button
          type="button"
          onClick={() => {
            void tap();
            setFull(true);
          }}
          aria-label={`Open ${heading} full screen`}
          className="absolute inset-0 z-20 flex items-end justify-center pb-4"
        >
          <span
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ${FLOATING}`}
          >
            <Maximize2 size={14} />
            Tap to explore
          </span>
        </button>
      ) : null}

      {/* Die Leisten schweben ueber der Karte, wie auf der Hauptkarte. */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 space-y-3 p-4 ${
          expandable && !full ? "hidden" : ""
        } ${full ? "pt-[calc(1rem+env(safe-area-inset-top))]" : ""}`}
      >
        <div className="pointer-events-auto relative flex items-center gap-2">
          {full ? (
            <button
              type="button"
              onClick={() => {
                void tap();
                setFull(false);
              }}
              aria-label="Close map"
              className={`turi-tap flex size-11 shrink-0 items-center justify-center rounded-full ${FLOATING}`}
            >
              <X size={18} />
            </button>
          ) : null}
          <div className="relative min-w-0 flex-1">
            <Search
              size={17}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Die Eingabetaste bedeutet "jetzt hin": Liegt ein eigener
              // Treffer vor, ist die Karte ohnehin schon dort -- sonst
              // uebernimmt die Ortssuche.
              onKeyDown={(e) => {
                if (e.key === "Enter" && queried.length === 0) void jumpAnywhere();
              }}
              placeholder="Search these places"
              aria-label="Search these places"
              className={`h-11 rounded-full pl-10 pr-10 ${FLOATING}`}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="turi-tap turi-hit absolute right-3 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        <CategoryFilterBar items={visible} value={filter} onChange={setFilter} />

        {/*
          Der Hinweis ist zugleich der Ausweg. Frueher stand hier nur
          eine Absage -- richtig, aber eine Sackgasse: Wer "Stockholm"
          tippt, will nach Stockholm, auch wenn die Person dort nichts
          hat.
        */}
        {term && queried.length === 0 ? (
          <div
            className={`pointer-events-auto flex w-fit items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 ${FLOATING}`}
          >
            <span className="turi-meta text-xs text-muted-foreground">
              Nothing here matches “{query.trim()}”
            </span>
            <Button
              type="button"
              variant="ghost"
              disabled={jumping}
              onClick={jumpAnywhere}
              className="h-7 rounded-full bg-brand-soft px-3 text-xs font-semibold text-brand hover:bg-brand-soft hover:text-brand"
            >
              {jumping ? "Going…" : "Go there anyway"}
            </Button>
          </div>
        ) : null}
      </div>

      {/*
        Beide Knoepfe in einer Saeule, wie auf der Hauptkarte -- dort
        sitzt die Liste ueber dem Standort, und das soll man nicht
        zweimal lernen muessen.
      */}
      <div
        className={`absolute bottom-4 right-4 flex flex-col items-end gap-2 ${
          expandable && !full ? "hidden" : ""
        }`}
      >
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
              // Wie auf der Hauptkarte: zum Ort hinschieben und die
              // Vorschau oeffnen, statt die Karte zu verlassen.
              if (item.lat != null && item.lng != null) {
                mapRef.current?.panTo({ lat: item.lat, lng: item.lng });
              }
              setSelected({
                kind: "local",
                id: item.id,
                name: item.name,
                lat: item.lat ?? 0,
                lng: item.lng ?? 0,
              });
            }}
          />
        </SheetContent>
      </Sheet>

      <PlaceSheet
        target={selected}
        onClose={() => setSelected(null)}
        myPos={myPos}
        onlyUserId={onlyUserId}
      />
    </div>
  );
}
