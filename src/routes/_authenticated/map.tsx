import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Compass,
  List,
  Loader2,
  LocateFixed,
  MapPin,
  MapPinned,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getPlaceById, searchMapPlaces, suggestMapPlaces } from "@/lib/maps.functions";
import type { MapPlace, PlaceSuggestion } from "@/lib/maps.server";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { currentLocationIcon, mapColor, ratingPinIcon, searchPinIcon } from "@/lib/mapIcons";
import { CATEGORIES, type Category, normalizeCategory } from "@/lib/categories";
import { PlaceList } from "@/components/turi/PlaceList";
import { PlaceSheet, type SheetTarget } from "@/components/turi/PlaceSheet";
import { CategoryFilterBar } from "@/components/turi/CategoryFilter";
import { metersBetween } from "@/lib/geo";
import { supabase } from "@/integrations/supabase/app-client";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { getErrorMessage } from "@/lib/turi";
import { currentPosition, tap, watchPosition } from "@/lib/native";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/map")({
  head: () => ({
    meta: [
      { title: "Map – Turi" },
      {
        name: "description",
        content:
          "Discover cafes, restaurants, and sights on the map and see your friends' reviews.",
      },
      { property: "og:title", content: "Map – Turi" },
      {
        property: "og:description",
        content: "Discover places on the map and see friends' reviews.",
      },
    ],
  }),
  component: MapPage,
});

const DEFAULT_CENTER = { lat: 41.9028, lng: 12.4964 };

/*
 * Das Material aller schwebenden Bedienelemente auf der Karte --
 * Umschalter, Suchfeld, Standort- und "Can't find it?"-Knopf.
 *
 * Bewusst EINE Konstante: Vorher hatte jedes dieser Elemente seine
 * eigene Mischung aus Farbe, Rundung und Rand. Sie schweben aber alle
 * ueber derselben Karte und gehoeren damit sichtbar zusammen -- und es
 * ist dasselbe Glas wie das der unteren Navigationsleiste, damit die
 * Karte nicht zwei Sprachen spricht.
 */
const FLOATING =
  "border border-border bg-card/80 shadow-card backdrop-blur-xl backdrop-saturate-150";

/*
 * Kartenzustand ueber einen Seitenwechsel hinweg merken.
 *
 * Oeffnet man von der Karte aus eine Ortsseite, wird die Karte komplett
 * abgebaut und beim Zurueckkehren neu erzeugt. Ohne dieses Gedaechtnis
 * landet man wieder im Ausgangszustand: Modus zurueck auf "Discover",
 * Kamera zurueck auf den eigenen Standort -- man wird also aus der gerade
 * betrachteten Stadt geworfen, obwohl man nur kurz einen Ort angesehen hat.
 *
 * Bewusst modulweit und nicht im React-State: genau der geht beim Abbauen
 * der Komponente ja verloren. Ein vollstaendiger Neustart der App setzt
 * alles zurueck -- das ist gewollt, dann soll die Karte wieder beim
 * eigenen Standort beginnen.
 */
const mapSession: {
  camera: { lat: number; lng: number; zoom: number } | null;
  mode: "discover" | "mine" | null;
  centeredOnUser: boolean;
  /*
   * Auch der Filter gehoert hierher: Wer auf "Cafes" stellt, einen Pin
   * antippt und zurueckkommt, stand sonst wieder vor allen Orten --
   * und musste die Auswahl bei jedem Ort neu treffen.
   */
  filter: Category | null;
} = { camera: null, mode: null, centeredOnUser: false, filter: null };

const AREA_TYPES = new Set([
  "locality",
  "sublocality",
  "sublocality_level_1",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "country",
  "postal_town",
  "neighborhood",
]);

/*
 * Ein Ort, wie ihn die Karte braucht -- egal aus welcher Quelle.
 *
 * Vorher hatte jeder der vier Zweige (bewertet/gemerkt, jeweils
 * "Discover" und "My Map") seine eigene Form und seinen eigenen
 * Marker-Code. Filter und Liste haetten das vervierfacht. Jetzt laufen
 * alle Quellen in EINE Liste, und Marker, Filterleiste und Trefferliste
 * lesen aus derselben.
 *
 * rating ist die Durchschnittsnote aus dem eigenen Kreis (in "My Map"
 * die eigene), friends die Anzahl der Bewertungen dahinter. Fehlt beides,
 * ist es ein reiner Merk-Ort.
 */
type Pin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: Category;
  rating?: number;
  friends: number;
  saved: boolean;
};

function MapPage() {
  const { ready, error } = useGoogleMaps();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  // Suchtreffer-Marker bewusst getrennt von markersRef: das normale
  // Neuzeichnen der Karte (beim Verschieben, Moduswechsel, Nachladen)
  // raeumt markersRef komplett ab -- die Suchtreffer sollen dabei stehen
  // bleiben, bis die Suche verworfen wird.
  const searchMarkersRef = useRef<google.maps.Marker[]>([]);
  // Eigener Standort: Punkt und Genauigkeitskreis.
  const meMarkerRef = useRef<google.maps.Marker | null>(null);
  const meAccuracyRef = useRef<google.maps.Circle | null>(null);
  const [center, setCenter] = useState(
    mapSession.camera ? { lat: mapSession.camera.lat, lng: mapSession.camera.lng } : DEFAULT_CENTER,
  );
  const [bounds, setBounds] = useState<{
    swLat: number;
    swLng: number;
    neLat: number;
    neLng: number;
  } | null>(null);
  const [selected, setSelected] = useState<SheetTarget | null>(null);
  const [query, setQuery] = useState("");
  const [searchCandidates, setSearchCandidates] = useState<MapPlace[] | null>(null);
  const [mode, setMode] = useState<"discover" | "mine">(mapSession.mode ?? "discover");
  // Filter nach Art des Ortes -- null heisst "alles zeigen".
  const [filter, setFilter] = useState<Category | null>(mapSession.filter);
  // Die Trefferliste zum aktuellen Ausschnitt.
  const [listOpen, setListOpen] = useState(false);
  // Der eigene Standort als Zustand (nicht nur als Marker), damit
  // Entfernungen in Liste und Ortspanel gerechnet werden koennen.
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  /*
   * Der Moduswechsel laesst die Kamera in Ruhe.
   *
   * Frueher passte "My Map" die Ansicht auf ALLE eigenen Orte ein. Wer
   * in Barcelona stand und umschaltete, wurde auf halb Europa
   * herausgezogen, weil irgendwo noch Stockholm und Lissabon liegen --
   * und musste sich jedes Mal zurueckarbeiten. Der Umschalter beantwortet
   * die Frage "was liegt HIER von mir?", nicht "zeig mir mein Lebenswerk".
   *
   * Wer doch alles sehen will, bekommt es weiterhin -- aber auf
   * Zuruf: Liegt im Bild kein einziger eigener Ort, erscheint dafuer
   * ein Knopf (siehe fitAll).
   */
  function switchMode(next: "discover" | "mine") {
    mapSession.mode = next;
    setMode(next);
  }

  const placeByIdFn = useServerFn(getPlaceById);
  const searchFn = useServerFn(searchMapPlaces);
  const suggestFn = useServerFn(suggestMapPlaces);

  /*
   * Vorschlaege waehrend des Tippens.
   *
   * Nicht zu verwechseln mit der frueheren Trefferliste: Die stand
   * NACH der Suche ueber der Karte und verdeckte genau die Pins, die
   * sie erklaeren sollte. Diese Liste haengt am Eingabefeld, erscheint
   * nur beim Tippen und verschwindet bei der Auswahl.
   */
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[] | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 220);
  // Die Kartenmitte als Ref, nicht als Abhaengigkeit: sonst fragte jede
  // Verschiebung der Karte waehrend des Tippens neue Vorschlaege an.
  const centerRef = useRef(center);
  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setSuggestions(null);
      return;
    }
    let active = true;
    void suggestFn({ data: { input: q, lat: centerRef.current.lat, lng: centerRef.current.lng } })
      .then((r) => active && setSuggestions(r))
      .catch(() => active && setSuggestions(null));
    return () => {
      active = false;
    };
  }, [debouncedQuery, suggestFn]);

  async function pickSuggestion(s: PlaceSuggestion) {
    setSuggestOpen(false);
    setSuggestions(null);
    setQuery("");
    try {
      const place = await placeByIdFn({ data: { placeId: s.googlePlaceId } });
      if (!place || !mapRef.current) return;
      const c = { lat: place.lat, lng: place.lng };
      mapRef.current.panTo(c);
      mapRef.current.setZoom(16);
      setCenter(c);
      setSelected({ kind: "google", place });
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not open place"));
    }
  }

  const { data: myPlaces } = useQuery({
    queryKey: ["my-reviewed-places"],
    enabled: mode === "mine",
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user!.id;
      const { data } = await supabase
        .from("reviews")
        .select("place_id, rating, places(id, name, lat, lng, category)")
        .eq("user_id", me);
      const seen = new Map<string, { total: number; count: number }>();
      const byId = new Map<
        string,
        { name: string; lat: number; lng: number; category: Category }
      >();
      for (const r of data ?? []) {
        const p = r.places as unknown as {
          id: string;
          name: string;
          lat: number | null;
          lng: number | null;
          category: string;
        } | null;
        if (p && p.lat != null && p.lng != null) {
          byId.set(p.id, {
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            // Altbestand kann noch Googles Anzeigetext tragen, solange
            // die Migration nicht gelaufen ist -- hier abgefangen, damit
            // der Filter trotzdem vollstaendig bleibt.
            category: normalizeCategory(p.category),
          });
          const entry = seen.get(p.id) ?? { total: 0, count: 0 };
          entry.total += r.rating;
          entry.count += 1;
          seen.set(p.id, entry);
        }
      }
      const result: Omit<Pin, "saved">[] = [];
      for (const [id, place] of byId) {
        const { total, count } = seen.get(id)!;
        result.push({ id, ...place, rating: total / count, friends: count });
      }
      return result;
    },
  });

  // "Meine Karte": eigene Wunschliste ("Will ich noch hin") mit dazu, damit
  // die Karte einen vollstaendigen persoenlichen Ueberblick zeigt -- nicht
  // nur bereits Bewertetes.
  const { data: mySavedPlaces } = useQuery({
    queryKey: ["my-saved-places-map"],
    enabled: mode === "mine",
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user!.id;
      const { data } = await supabase
        .from("saved_places")
        .select("places(id, name, lat, lng, category)")
        .eq("user_id", me);
      const result: { id: string; name: string; lat: number; lng: number; category: Category }[] =
        [];
      for (const r of data ?? []) {
        const p = r.places as unknown as {
          id: string;
          name: string;
          lat: number | null;
          lng: number | null;
          category: string;
        } | null;
        if (p && p.lat != null && p.lng != null) {
          result.push({
            id: p.id,
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            category: normalizeCategory(p.category),
          });
        }
      }
      return result;
    },
  });

  const boundsKey = bounds
    ? `${bounds.swLat.toFixed(3)},${bounds.swLng.toFixed(3)},${bounds.neLat.toFixed(3)},${bounds.neLng.toFixed(3)}`
    : null;

  // Von Freunden (oder mir) bewertete Orte im aktuell sichtbaren Kartenbereich
  // -- direkt aus unserer eigenen Datenbank, ganz ohne Google-Nearby-Search.
  // RLS auf reviews filtert bereits automatisch auf das, was ich sehen darf.
  const { data: reviewedInView, isFetching: reviewedLoading } = useQuery({
    queryKey: ["reviewed-in-view", boundsKey],
    enabled: mode === "discover" && !!bounds,
    queryFn: async () => {
      const { swLat, swLng, neLat, neLng } = bounds!;
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id ?? "";
      const { data, error: qErr } = await supabase
        .from("reviews")
        .select("rating, places!inner(id, name, lat, lng, google_place_id, category)")
        .neq("user_id", me)
        .gte("places.lat", swLat)
        .lte("places.lat", neLat)
        .gte("places.lng", swLng)
        .lte("places.lng", neLng);
      if (qErr) throw qErr;
      const seen = new Map<
        string,
        {
          name: string;
          lat: number;
          lng: number;
          category: Category;
          total: number;
          count: number;
        }
      >();
      for (const r of data ?? []) {
        const p = r.places as unknown as {
          id: string;
          name: string;
          lat: number;
          lng: number;
          category: string;
        };
        const entry = seen.get(p.id) ?? {
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          category: normalizeCategory(p.category),
          total: 0,
          count: 0,
        };
        entry.total += r.rating;
        entry.count += 1;
        seen.set(p.id, entry);
      }
      return Array.from(seen.entries()).map(([id, v]) => ({
        id,
        name: v.name,
        lat: v.lat,
        lng: v.lng,
        category: v.category,
        rating: v.total / v.count,
        // Wie viele aus dem Kreis diesen Ort bewertet haben -- die Liste
        // zeigt es ("3 friends"), und es ist der Unterschied zwischen
        // einer einzelnen Meinung und einem echten Tipp.
        friends: v.count,
      }));
    },
  });

  // "Will ich noch hin" im aktuell sichtbaren Kartenbereich.
  const { data: savedInView } = useQuery({
    queryKey: ["saved-in-view", boundsKey],
    enabled: mode === "discover" && !!bounds,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) return [];
      const { swLat, swLng, neLat, neLng } = bounds!;
      const { data, error: qErr } = await supabase
        .from("saved_places")
        .select("places!inner(id, name, lat, lng, category)")
        .eq("user_id", me)
        .gte("places.lat", swLat)
        .lte("places.lat", neLat)
        .gte("places.lng", swLng)
        .lte("places.lng", neLng);
      if (qErr) throw qErr;
      return (data ?? []).map((r) => {
        const p = r.places as unknown as {
          id: string;
          name: string;
          lat: number;
          lng: number;
          category: string;
        };
        return {
          id: p.id,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          category: normalizeCategory(p.category),
        };
      });
    },
  });

  /*
   * Aus allen Quellen EINE Liste -- Grundlage fuer Marker, Filterleiste
   * und Trefferliste. Ein Ort, der bewertet UND gemerkt ist, steht genau
   * einmal darin und traegt beides.
   */
  const pins = useMemo<Pin[]>(() => {
    const reviewed = mode === "mine" ? (myPlaces ?? []) : (reviewedInView ?? []);
    const saved = mode === "mine" ? (mySavedPlaces ?? []) : (savedInView ?? []);
    const savedIds = new Set(saved.map((p) => p.id));
    const reviewedIds = new Set(reviewed.map((p) => p.id));
    const out: Pin[] = reviewed.map((p) => ({ ...p, saved: savedIds.has(p.id) }));
    for (const p of saved) {
      if (!reviewedIds.has(p.id)) out.push({ ...p, friends: 0, saved: true });
    }
    return out;
  }, [mode, myPlaces, mySavedPlaces, reviewedInView, savedInView]);

  /*
   * Was davon im Bild liegt.
   *
   * In "Discover" holt die Abfrage ohnehin nur den sichtbaren
   * Ausschnitt; in "My Map" liegen dagegen ALLE eigenen Orte vor, auch
   * die auf anderen Kontinenten. Filterleiste, Liste und die Zahl auf
   * dem Listenknopf beziehen sich aber ausdruecklich auf das Bild
   * ("12 places in this view") -- ohne diesen Schnitt waere die Zahl
   * dort eine ueber die ganze Welt.
   */
  const visiblePins = useMemo(() => {
    if (!bounds) return pins;
    return pins.filter(
      (p) =>
        p.lat >= bounds.swLat &&
        p.lat <= bounds.neLat &&
        p.lng >= bounds.swLng &&
        p.lng <= bounds.neLng,
    );
  }, [pins, bounds]);

  const byFilter = useCallback(
    (list: Pin[]) => (filter ? list.filter((p) => p.category === filter) : list),
    [filter],
  );

  // Marker: alle Orte des Modus -- was ausserhalb des Bildes liegt,
  // stoert nicht und ist sofort da, sobald man dorthin schiebt.
  const filteredPins = useMemo(() => byFilter(pins), [byFilter, pins]);
  // Liste und Filterleiste: nur das Sichtbare.
  const listPins = useMemo(() => byFilter(visiblePins), [byFilter, visiblePins]);

  // Init map
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(containerRef.current, {
      // Kehrt man von einer Ortsseite zurueck, genau dort weitermachen,
      // wo die Karte vorher stand.
      center: mapSession.camera
        ? { lat: mapSession.camera.lat, lng: mapSession.camera.lng }
        : DEFAULT_CENTER,
      zoom: mapSession.camera?.zoom ?? 14,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      // Googles eingebaute, kostenlose Orts-Symbole (Restaurants, Cafes
      // etc.) anklickbar lassen -- so sind viel mehr Orte sichtbar/
      // auswaehlbar, ohne dass wir sie per Nearby-Search selbst einkaufen
      // muessen. Nur der tatsaechlich angeklickte Ort kostet dann eine
      // einzelne, guenstige Detailabfrage (siehe Klick-Listener unten).
      clickableIcons: true,
    });
    mapRef.current.addListener("idle", () => {
      const c = mapRef.current!.getCenter();
      if (!c) return;
      setCenter({ lat: c.lat(), lng: c.lng() });
      mapSession.camera = {
        lat: c.lat(),
        lng: c.lng(),
        zoom: mapRef.current!.getZoom() ?? 14,
      };
      const b = mapRef.current!.getBounds();
      if (b) {
        const ne = b.getNorthEast();
        const sw = b.getSouthWest();
        setBounds({ swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() });
      }
    });
    mapRef.current.addListener("click", async (event: google.maps.MapMouseEvent) => {
      const iconEvent = event as google.maps.IconMouseEvent;
      if (!iconEvent.placeId) return;
      // Verhindert Googles eigenes Standard-Infofenster -- wir zeigen
      // stattdessen unser eigenes PlaceSheet.
      iconEvent.stop();
      try {
        const place = await placeByIdFn({ data: { placeId: iconEvent.placeId } });
        if (place) setSelected({ kind: "google", place });
      } catch (e) {
        toast.error(getErrorMessage(e, "Could not open place"));
      }
    });
  }, [ready, placeByIdFn]);

  /*
   * Eigener Standort: laufender Punkt auf der Karte, dazu ein Kreis fuer
   * die Ortungsgenauigkeit -- wie in gaengigen Kartenanwendungen.
   *
   * Die frueher getrennte, einmalige Abfrage fuer die Erstzentrierung ist
   * hier aufgegangen: die erste Position aus der Verfolgung erledigt das
   * mit. Das spart eine zweite Ortungsanfrage samt Wartezeit.
   *
   * Zentriert wird weiterhin nur EINMAL pro App-Start. Da die Karte beim
   * Zurueckkehren von einer Ortsseite neu aufgebaut wird, wuerde man sonst
   * jedes Mal aus der betrachteten Stadt zurueckgeworfen.
   *
   * Die Verfolgung endet beim Verlassen der Karte -- sonst liefe die
   * Ortung im Hintergrund weiter und zoege unnoetig Akku.
   */
  useEffect(() => {
    if (!ready) return;

    const stop = watchPosition((c) => {
      const map = mapRef.current;
      if (!map) return;

      if (!meMarkerRef.current) {
        meMarkerRef.current = new google.maps.Marker({
          map,
          // Unter allen Ortspins: der eigene Standort soll sie nicht
          // verdecken, wenn man genau davorsteht.
          zIndex: 1,
          clickable: false,
          icon: currentLocationIcon(),
        });
        meAccuracyRef.current = new google.maps.Circle({
          map,
          strokeOpacity: 0,
          fillColor: mapColor("me"),
          fillOpacity: 0.12,
          clickable: false,
        });
      }
      meMarkerRef.current.setPosition(c);
      // Nur bei echter Bewegung neu setzen: die Ortung meldet sich alle
      // paar Sekunden, und jede Meldung wuerde sonst die ganze Seite neu
      // zeichnen, obwohl sich an den Entfernungen nichts aendert.
      setMyPos((prev) => (prev && metersBetween(prev, c) < 20 ? prev : { lat: c.lat, lng: c.lng }));
      meAccuracyRef.current?.setCenter(c);
      // Bei guter Ortung waere der Kreis winzig und nur Unruhe.
      meAccuracyRef.current?.setRadius(c.accuracy > 25 ? c.accuracy : 0);

      if (!mapSession.centeredOnUser) {
        mapSession.centeredOnUser = true;
        map.setCenter(c);
        setCenter(c);
      }
    });

    return () => {
      stop();
      meMarkerRef.current?.setMap(null);
      meAccuracyRef.current?.setMap(null);
      meMarkerRef.current = null;
      meAccuracyRef.current = null;
    };
  }, [ready]);

  // Suchtreffer als Marker zeichnen.
  //
  // Farbe: das neutrale Dunkel der Marke. In "Discover" -- dem einzigen
  // Modus mit Suche -- ist es sonst nicht belegt, kollidiert also weder
  // mit Orange (von Freunden bewertet) noch mit Teal (Wunschliste).
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    searchMarkersRef.current.forEach((m) => m.setMap(null));
    searchMarkersRef.current = [];
    if (!searchCandidates || searchCandidates.length === 0) return;

    searchMarkersRef.current = searchCandidates.map((c) => {
      const marker = new google.maps.Marker({
        map: mapRef.current!,
        position: { lat: c.lat, lng: c.lng },
        title: c.name,
        // Ueber allen anderen Pins -- es ist das, wonach gerade gesucht wurde.
        zIndex: 20,
        icon: searchPinIcon(),
        animation: google.maps.Animation.DROP,
      });
      marker.addListener("click", () => setSelected({ kind: "google", place: c }));
      return marker;
    });
  }, [ready, searchCandidates]);

  // Beim Verlassen der Karte aufraeumen.
  useEffect(() => {
    const markers = searchMarkersRef;
    return () => markers.current.forEach((m) => m.setMap(null));
  }, []);

  /*
   * Marker zeichnen -- ein Zweig fuer beide Modi.
   *
   * Vorher standen hier zwei fast gleiche Bloecke (einer fuer "Discover",
   * einer fuer "My Map") mit je zwei Unterfaellen. Die Unterschiede
   * liegen laengst in der Pin-Liste oben; hier bleibt nur noch das
   * Zeichnen.
   */
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));

    markersRef.current = filteredPins.map((p) => {
      const marker = new google.maps.Marker({
        map: mapRef.current!,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        // Gemerkte Orte eine Stufe hoeher: die eigene, bewusste Liste
        // soll nicht hinter fremden Bewertungen verschwinden.
        zIndex: p.saved ? 11 : 10,
        icon: ratingPinIcon(p.rating, { saved: p.saved }),
      });
      marker.addListener("click", () =>
        setSelected({ kind: "local", id: p.id, name: p.name, lat: p.lat, lng: p.lng }),
      );
      return marker;
    });
  }, [ready, filteredPins]);

  /** Auf Zuruf: die Ansicht auf alle eigenen Orte einpassen. */
  const fitAll = useCallback(() => {
    if (!mapRef.current || pins.length === 0) return;
    void tap();
    const box = new google.maps.LatLngBounds();
    pins.forEach((p) => box.extend({ lat: p.lat, lng: p.lng }));
    mapRef.current.fitBounds(box, 60);
  }, [pins]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchCandidates(null);
      return;
    }
    try {
      const results = await searchFn({ data: { query: q, lat: center.lat, lng: center.lng } });
      const top = results[0];
      if (!top || !mapRef.current) {
        toast.info("Nothing found");
        return;
      }
      setQuery("");

      // Ohne erkannten Geschaefts-Typ ODER ohne genaue Adresse ist das
      // vermutlich eine Stadt/Region (auch wenn ihr Typ nicht in unserer
      // AREA_TYPES-Liste steht) -- dann nur hinzoomen, nicht automatisch
      // oeffnen.
      const looksLikeArea = !top.rawType || AREA_TYPES.has(top.rawType) || !top.address;

      if (looksLikeArea || results.length === 1) {
        // Stadt/Region oder eindeutiger Treffer: dorthin springen.
        const newCenter = { lat: top.lat, lng: top.lng };
        mapRef.current.panTo(newCenter);
        mapRef.current.setZoom(14);
        setCenter(newCenter);
        setSearchCandidates(null);
        if (!looksLikeArea) setSelected({ kind: "google", place: top });
        return;
      }

      // Mehrere Treffer -- typisch bei Ketten ("Aldi") oder nur teilweise
      // erinnerten Namen. Alle als Marker zeigen, statt zum ersten zu
      // springen: sonst sieht man genau eine Filiale und die uebrigen
      // tauchen nur in der Liste auf.
      const candidates = results.slice(0, 8);
      setSearchCandidates(candidates);

      // Die aktuelle Ansicht bewusst beibehalten, solange ueberhaupt
      // etwas davon im Bild ist -- man sucht meist in der Gegend, die man
      // gerade betrachtet. Nur wenn kein einziger Treffer sichtbar waere,
      // so weit herausgehen, dass alle hineinpassen. Sonst starrt man auf
      // eine leere Karte.
      const view = mapRef.current.getBounds();
      const anyVisible =
        !!view && candidates.some((c) => view.contains(new google.maps.LatLng(c.lat, c.lng)));
      if (!anyVisible) {
        const searchBounds = new google.maps.LatLngBounds();
        candidates.forEach((c) => searchBounds.extend({ lat: c.lat, lng: c.lng }));
        mapRef.current.fitBounds(searchBounds, 80);
      }
    } catch (e) {
      toast.error(getErrorMessage(e, "Search failed"));
    }
  }, [query, center, searchFn]);

  return (
    // 100dvh statt 100vh: auf dem Handy zaehlt 100vh die ein- und
    // ausfahrende Browserleiste nicht mit, wodurch der untere Rand der
    // Karte -- und mit ihm die schwebenden Knoepfe -- aus dem sichtbaren
    // Bereich rutscht. dvh folgt der tatsaechlich sichtbaren Hoehe.
    <div
      className="relative h-[100dvh] w-full overflow-hidden"
      style={{ marginBottom: "calc(-1 * var(--bottom-nav-h))" }}
    >
      <div ref={containerRef} className="absolute inset-0 bg-muted" />

      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          {error ? (
            <p className="px-8 text-center text-sm text-muted-foreground">{error}</p>
          ) : (
            <Loader2 className="animate-spin text-primary" />
          )}
        </div>
      ) : null}

      {/* Dieselbe app-top-Klasse wie die uebrigen Wurzel-Reiter: die
          schwebenden Bedienelemente beginnen damit auf einer Linie mit
          dem ersten Element von Feed, Suche und Profil. Vorher stand hier
          derselbe Wert noch einmal von Hand -- zwei Stellen, die
          auseinanderdriften koennen. */}
      <div className="app-top pointer-events-none absolute inset-x-0 top-0 z-10 space-y-3 px-4 pb-4">
        {/*
          Die schwebende Logo-Karte ist hier entfallen. Auf der Karte
          stapelten sich vier Reihen uebereinander -- Logo, Umschalter,
          Suchfeld, Legende -- und die oberste trug nichts als den
          Markennamen. Google Maps setzt aus demselben Grund die Suche
          ganz nach oben. Der Ladeindikator sitzt jetzt im Suchfeld, wo er
          auch inhaltlich hingehoert (er zeigt an, dass die Orte fuer den
          sichtbaren Ausschnitt geladen werden).
        */}
        <div
          className={`pointer-events-auto grid grid-cols-2 gap-1 rounded-full p-1 ${FLOATING}`}
          role="group"
          aria-label="Map view"
        >
          <Button
            type="button"
            variant="ghost"
            onClick={() => switchMode("discover")}
            aria-pressed={mode === "discover"}
            // Aktiv in der weichen Markenfarbe statt in massivem Schwarz --
            // dieselbe Sprache wie der aktive Reiter unten. Der schwarze
            // Block lag als schweres Gewicht ueber der Karte.
            className={`h-10 rounded-full px-3 text-sm font-semibold shadow-none ${
              mode === "discover"
                ? "bg-brand-soft text-brand hover:bg-brand-soft hover:text-brand"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            }`}
          >
            <Compass size={17} />
            Discover
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => switchMode("mine")}
            aria-pressed={mode === "mine"}
            className={`h-10 rounded-full px-3 text-sm font-semibold shadow-none ${
              mode === "mine"
                ? "bg-brand-soft text-brand hover:bg-brand-soft hover:text-brand"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            }`}
          >
            <MapPinned size={17} />
            My Map
          </Button>
        </div>

        {/*
          Die Suche steht in BEIDEN Modi zur Verfuegung. Sie war frueher
          auf "Discover" beschraenkt -- in "My Map" liess sich damit nicht
          zu einer Stadt springen, obwohl die eigenen Orte ueber die halbe
          Welt verteilt sein koennen. Die Suchtreffer liegen ohnehin in
          einer eigenen Marker-Ablage und stoeren die Modus-Pins nicht.
        */}
        <div className="pointer-events-auto relative">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim()) {
                setSearchCandidates(null);
              }
            }}
            onFocus={() => setSuggestOpen(true)}
            // Verzoegert schliessen: ein Klick auf einen Vorschlag loest
            // sonst erst blur aus und die Liste waere weg, bevor der
            // Klick ankommt.
            onBlur={() => window.setTimeout(() => setSuggestOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSuggestOpen(false);
                void runSearch();
              }
              if (e.key === "Escape") setSuggestOpen(false);
            }}
            placeholder={mode === "mine" ? "Search a city or place" : "Search city or place"}
            className={`h-12 rounded-full pl-11 pr-11 ${FLOATING}`}
          />

          {suggestOpen && suggestions && suggestions.length > 0 ? (
            <ul className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
              {suggestions.slice(0, 6).map((s) => (
                <li key={s.googlePlaceId} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    // Verhindert, dass das Feld den Fokus verliert, bevor
                    // der Klick ankommt -- sonst schliesst blur die Liste
                    // und der Klick geht ins Leere.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void pickSuggestion(s)}
                    className="turi-tap flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary"
                  >
                    <MapPin size={16} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{s.main}</span>
                      {s.secondary ? (
                        <span className="turi-meta block truncate text-xs text-muted-foreground">
                          {s.secondary}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {/* Zeigt an, dass die Orte fuer den sichtbaren Ausschnitt noch
              geladen werden. Nur in "Discover" -- dort haengt die
              Pin-Anzeige am sichtbaren Bereich, in "My Map" nicht. */}
          {mode === "discover" && reviewedLoading ? (
            <Loader2
              size={16}
              aria-label="Loading places"
              className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          ) : null}
        </div>

        {/*
          Nur noch ein schmaler Hinweis statt der frueheren Trefferliste.
          Die Liste sass im oberen Ueberlagerungsbereich und verdeckte
          genau die Pins, die sie erklaeren sollte -- man konnte die
          Treffer lesen ODER sehen, nicht beides. Angetippt wird jetzt
          direkt der Pin auf der Karte.
        */}
        {searchCandidates && searchCandidates.length > 0 ? (
          <div className="pointer-events-auto flex w-fit items-center gap-2 rounded-full bg-card/95 py-1.5 pl-3 pr-1.5 shadow-card backdrop-blur">
            <span className="turi-eyebrow">{searchCandidates.length} on the map — tap a pin</span>
            <button
              type="button"
              onClick={() => setSearchCandidates(null)}
              aria-label="Clear search results"
              className="turi-tap turi-hit flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
            >
              <X size={14} />
            </button>
          </div>
        ) : null}

        {/*
          Filter nach Art des Ortes.

          Hier standen bisher zwei feste Legenden-Pillen ("4.5 = von
          Freunden bewertet", "Lesezeichen = will ich noch hin"). Sie
          erklaerten die Karte einmal und standen danach fuer immer im
          Weg. Die Leiste sagt dasselbe -- welche Arten von Orten hier
          liegen -- und laesst sich benutzen.

          Das Bauteil liegt in CategoryFilter.tsx und steht genauso ueber
          den Karten von Profilen und Ordnern.
        */}
        <CategoryFilterBar
          items={visiblePins}
          value={filter}
          onChange={(next) => {
            mapSession.filter = next;
            setFilter(next);
          }}
        />
      </div>

      {/*
        Beide Knoepfe in einer Saeule statt einzeln positioniert: so
        bleibt ihr Abstand zueinander an einer Stelle festgelegt, und
        die Liste sitzt sichtbar ueber dem Standortknopf.
      */}
      <div
        className="absolute right-4 z-10 flex flex-col items-end gap-2"
        style={{ bottom: "calc(var(--bottom-nav-h) + 0.75rem)" }}
      >
        {listPins.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            aria-label={`Show the ${listPins.length} places here as a list`}
            className={`h-12 rounded-full px-4 text-sm font-semibold ${FLOATING}`}
            onClick={() => {
              void tap();
              setListOpen(true);
            }}
          >
            <List size={18} className="mr-1.5" />
            {listPins.length}
          </Button>
        ) : null}

        <Button
          size="icon"
          variant="ghost"
          aria-label="Show my location"
          className={`size-12 rounded-full ${FLOATING}`}
          onClick={async () => {
            // Die laufende Ortung kennt die Position bereits -- direkt
            // hinspringen statt erneut zu messen. Das war vorher eine
            // zweite Anfrage mit spuerbarer Wartezeit, obwohl der Punkt
            // schon auf der Karte lag.
            const known = meMarkerRef.current?.getPosition();
            if (known) {
              mapRef.current?.panTo(known);
              mapRef.current?.setZoom(16);
              setCenter({ lat: known.lat(), lng: known.lng() });
              return;
            }
            // Noch keine Ortung erhalten (Berechtigung offen oder kein
            // Empfang) -- dann doch einmal aktiv fragen.
            const c = await currentPosition();
            if (!c) {
              toast.error("Couldn't get your location");
              return;
            }
            mapRef.current?.panTo(c);
            mapRef.current?.setZoom(16);
            setCenter(c);
          }}
        >
          <LocateFixed size={20} />
        </Button>
      </div>

      {mode === "discover" ? (
        <Button
          asChild
          variant="ghost"
          // Gleiche Hoehe wie der Standortknopf gegenueber: Die beiden
          // sitzen auf einer Linie und lasen sich vorher als zwei
          // verschiedene Dinge -- flache Pille gegen hohes Quadrat.
          className={`absolute left-4 z-10 h-12 rounded-full px-4 text-sm ${FLOATING}`}
          style={{ bottom: "calc(var(--bottom-nav-h) + 0.75rem)" }}
        >
          <Link to="/new" search={{ create: true }}>
            <Plus size={16} className="mr-1" /> Can't find it?
          </Link>
        </Button>
      ) : null}

      <PlacesListSheet
        open={listOpen}
        onClose={() => setListOpen(false)}
        pins={listPins}
        myPos={myPos}
        heading={mode === "mine" ? "Your places here" : "Your friends here"}
        onPick={(p) => {
          setListOpen(false);
          mapRef.current?.panTo({ lat: p.lat, lng: p.lng });
          setSelected({ kind: "local", id: p.id, name: p.name, lat: p.lat, lng: p.lng });
        }}
      />

      <PlaceSheet target={selected} onClose={() => setSelected(null)} myPos={myPos} />
    </div>
  );
}

/*
 * Die Orte des aktuellen Ausschnitts als Liste.
 *
 * WARUM ES SIE GIBT: Auf der Karte siehst du, WO etwas liegt, aber nicht,
 * was das Beste davon ist -- dazu muesstest du jeden Pin einzeln
 * antippen. Bei dreissig Pins in einer fremden Stadt ist das der
 * Unterschied zwischen "ich habe eine Karte" und "ich weiss, wo ich
 * hingehe".
 *
 * Die Darstellung selbst steht in PlaceList und wird mit der
 * Wunschliste geteilt.
 */
function PlacesListSheet({
  open,
  onClose,
  pins,
  myPos,
  heading,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  pins: Pin[];
  myPos: { lat: number; lng: number } | null;
  heading: string;
  onPick: (pin: Pin) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="flex max-h-[78dvh] flex-col rounded-t-3xl border-0 p-0"
      >
        <SheetHeader className="px-6 pb-2 pt-6 text-left">
          <SheetTitle className="truncate pr-8 text-lg font-bold">{heading}</SheetTitle>
        </SheetHeader>
        <PlaceList
          items={pins}
          myPos={myPos}
          summary={`${pins.length} ${pins.length === 1 ? "place" : "places"} in this view`}
          onPick={(item) => onPick(item as Pin)}
        />
      </SheetContent>
    </Sheet>
  );
}
