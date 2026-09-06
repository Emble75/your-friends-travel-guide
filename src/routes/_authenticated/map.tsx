import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bookmark,
  Loader2,
  LocateFixed,
  Navigation,
  Plus,
  Search,
  Star,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getPlaceById, searchMapPlaces } from "@/lib/maps.functions";
import type { MapPlace } from "@/lib/maps.server";
import { ensureLocalPlace } from "@/lib/place-sync";
import { currentLocationIcon, mapColor, ratingPinIcon, searchPinIcon } from "@/lib/mapIcons";
import { supabase } from "@/integrations/supabase/app-client";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { Stars } from "@/components/turi/Stars";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { directionsUrl, getErrorMessage } from "@/lib/turi";
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
} = { camera: null, mode: null, centeredOnUser: false };

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

type MyPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  rating: number;
};

/*
 * Woher der Ort im unteren Panel stammt.
 *
 * "google": ein Symbol aus Googles eigener Karte oder ein Suchtreffer --
 * der Ort existiert bei uns vielleicht noch gar nicht und wird erst beim
 * Bewerten oder Merken angelegt (ensureLocalPlace).
 *
 * "local": einer unserer eigenen Pins. Der Ort steht bereits in unserer
 * Datenbank, seine id ist bekannt. Wichtig: ueber die Google-Kennung
 * darf hier NICHT nachgeschlagen werden -- von Hand angelegte Orte
 * ("Can't find it?") haben keine, und genau die wuerden sonst wieder
 * durchs Raster fallen.
 */
type SheetTarget =
  | { kind: "google"; place: MapPlace }
  | { kind: "local"; id: string; name: string; lat: number; lng: number };

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
  // Nur ein aktiver Wechsel auf "My Map" soll die Ansicht auf alle eigenen
  // Orte einpassen -- nicht ein blosser Neuaufbau der Karte.
  const wantFitRef = useRef(false);

  function switchMode(next: "discover" | "mine") {
    if (next === "mine" && mode !== "mine") wantFitRef.current = true;
    mapSession.mode = next;
    setMode(next);
  }

  const placeByIdFn = useServerFn(getPlaceById);
  const searchFn = useServerFn(searchMapPlaces);

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
      const byId = new Map<string, { name: string; lat: number; lng: number; category: string }>();
      for (const r of data ?? []) {
        const p = r.places as unknown as {
          id: string;
          name: string;
          lat: number | null;
          lng: number | null;
          category: string;
        } | null;
        if (p && p.lat != null && p.lng != null) {
          byId.set(p.id, { name: p.name, lat: p.lat, lng: p.lng, category: p.category });
          const entry = seen.get(p.id) ?? { total: 0, count: 0 };
          entry.total += r.rating;
          entry.count += 1;
          seen.set(p.id, entry);
        }
      }
      const result: MyPlace[] = [];
      for (const [id, place] of byId) {
        const { total, count } = seen.get(id)!;
        result.push({ id, ...place, rating: total / count });
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
        .select("places(id, name, lat, lng)")
        .eq("user_id", me);
      const result: { id: string; name: string; lat: number; lng: number }[] = [];
      for (const r of data ?? []) {
        const p = r.places as unknown as {
          id: string;
          name: string;
          lat: number | null;
          lng: number | null;
        } | null;
        if (p && p.lat != null && p.lng != null) {
          result.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng });
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
          googlePlaceId: string | null;
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
          google_place_id: string | null;
        };
        const entry = seen.get(p.id) ?? {
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          googlePlaceId: p.google_place_id,
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
        rating: v.total / v.count,
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
        .select("places!inner(id, name, lat, lng)")
        .eq("user_id", me)
        .gte("places.lat", swLat)
        .lte("places.lat", neLat)
        .gte("places.lng", swLng)
        .lte("places.lng", neLng);
      if (qErr) throw qErr;
      return (data ?? []).map((r) => {
        const p = r.places as unknown as { id: string; name: string; lat: number; lng: number };
        return { id: p.id, name: p.name, lat: p.lat, lng: p.lng };
      });
    },
  });

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

  // Render markers
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));

    if (mode === "mine") {
      const reviewedIds = new Set((myPlaces ?? []).map((p) => p.id));
      const mySavedIds = new Set((mySavedPlaces ?? []).map((p) => p.id));
      const reviewedMarkers = (myPlaces ?? []).map((p) => {
        const marker = new google.maps.Marker({
          map: mapRef.current!,
          position: { lat: p.lat, lng: p.lng },
          title: p.name,
          zIndex: 10,
          // Steht der Ort zusaetzlich auf der Wunschliste, traegt der Pin
          // beides -- sonst verschwaende die eine Angabe hinter der anderen.
          icon: ratingPinIcon(mapColor("reviewed"), p.rating, { saved: mySavedIds.has(p.id) }),
        });
        marker.addListener("click", () =>
          setSelected({ kind: "local", id: p.id, name: p.name, lat: p.lat, lng: p.lng }),
        );
        return marker;
      });
      // Eigene Wunschliste ("Will ich noch hin") zusaetzlich zeigen -- nur
      // die, die noch nicht ohnehin schon bewertet sind (sonst doppelt).
      const savedMarkers = (mySavedPlaces ?? [])
        .filter((p) => !reviewedIds.has(p.id))
        .map((p) => {
          const marker = new google.maps.Marker({
            map: mapRef.current!,
            position: { lat: p.lat, lng: p.lng },
            title: p.name,
            zIndex: 10,
            icon: ratingPinIcon(mapColor("saved")),
          });
          marker.addListener("click", () =>
            setSelected({ kind: "local", id: p.id, name: p.name, lat: p.lat, lng: p.lng }),
          );
          return marker;
        });
      markersRef.current = [...reviewedMarkers, ...savedMarkers];
      return;
    }

    // Entdecken-Modus: nur unsere eigenen Pins (bewertet/gemerkt). Alles
    // andere zeigt Google selbst ueber die eingebauten, kostenlosen Symbole
    // (siehe clickableIcons + Klick-Listener oben).
    //
    // Prioritaet: "Will ich noch hin" (teal) gewinnt gegen "von Freunden
    // bewertet" (orange), wenn beides auf denselben Ort zutrifft -- die
    // eigene, bewusste Merkliste soll auf einen Blick erkennbar bleiben,
    // statt von der Bewertungs-Farbe ueberdeckt zu werden.
    const savedIds = new Set((savedInView ?? []).map((p) => p.id));
    const ratingById = new Map((reviewedInView ?? []).map((p) => [p.id, p.rating]));
    const reviewedMarkers = (reviewedInView ?? [])
      .filter((p) => !savedIds.has(p.id))
      .map((p) => {
        const marker = new google.maps.Marker({
          map: mapRef.current!,
          position: { lat: p.lat, lng: p.lng },
          title: p.name,
          zIndex: 10,
          icon: ratingPinIcon(mapColor("reviewed"), p.rating),
        });
        marker.addListener("click", () =>
          setSelected({ kind: "local", id: p.id, name: p.name, lat: p.lat, lng: p.lng }),
        );
        return marker;
      });
    const savedMarkers = (savedInView ?? []).map((p) => {
      const marker = new google.maps.Marker({
        map: mapRef.current!,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        zIndex: 11,
        // Pin statt Punkt -- mit Bewertung drin, falls ein Freund den Ort
        // schon bewertet hat, sonst nur das Lesezeichen. Das Lesezeichen
        // steht auch neben der Note: sonst saehe ein gemerkter, bewerteter
        // Ort aus wie ein bloss bewerteter in anderer Farbe.
        icon: ratingPinIcon(mapColor("saved"), ratingById.get(p.id), { saved: true }),
      });
      marker.addListener("click", () =>
        setSelected({ kind: "local", id: p.id, name: p.name, lat: p.lat, lng: p.lng }),
      );
      return marker;
    });
    markersRef.current = [...reviewedMarkers, ...savedMarkers];
  }, [ready, mode, reviewedInView, savedInView, myPlaces, mySavedPlaces, navigate]);

  // "Meine Karte": nur beim aktiven Wechsel in den Modus auf alle eigenen
  // Orte (bewertet + Wunschliste) zoomen.
  //
  // wantFitRef wird ausschliesslich von switchMode gesetzt. Ohne diese
  // Absicherung lief das Einpassen auch beim blossen Neuaufbau der Karte
  // und beim Nachladen der Ortsdaten -- und zog die Ansicht wieder von der
  // gerade betrachteten Stadt auf alle eigenen Orte heraus.
  useEffect(() => {
    if (!wantFitRef.current || mode !== "mine" || !mapRef.current) return;
    const all = [...(myPlaces ?? []), ...(mySavedPlaces ?? [])];
    // Noch keine Daten -- eingepasst wird, sobald sie eintreffen.
    if (all.length === 0) return;
    wantFitRef.current = false;
    const fitBounds = new google.maps.LatLngBounds();
    all.forEach((p) => fitBounds.extend({ lat: p.lat, lng: p.lng }));
    mapRef.current.fitBounds(fitBounds, 60);
  }, [mode, myPlaces, mySavedPlaces]);

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
    <div className="relative h-[calc(100dvh-var(--bottom-nav-h))] w-full overflow-hidden">
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
        <div className="pointer-events-auto flex gap-1 rounded-2xl bg-card/95 p-1 shadow-card backdrop-blur">
          <button
            type="button"
            onClick={() => switchMode("discover")}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
              mode === "discover" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Discover
          </button>
          <button
            type="button"
            onClick={() => switchMode("mine")}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
              mode === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            My Map
          </button>
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
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder={mode === "mine" ? "Search a city or place" : "Search city or place"}
            className="h-12 rounded-2xl border-0 bg-card pl-11 pr-11 shadow-card"
          />
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

        {mode === "discover" && reviewedInView && reviewedInView.length > 0 ? (
          <div className="pointer-events-auto flex w-fit items-center gap-1.5 rounded-full bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-card backdrop-blur">
            <span className="inline-block size-2.5 rounded-full bg-map-reviewed" /> reviewed by
            friends
          </div>
        ) : null}

        {mode === "discover" && savedInView && savedInView.length > 0 ? (
          <div className="pointer-events-auto flex w-fit items-center gap-1.5 rounded-full bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-card backdrop-blur">
            <span className="inline-block size-2.5 rounded-full bg-map-saved" /> want to go
          </div>
        ) : null}

        {mode === "mine" ? (
          <div className="pointer-events-auto flex flex-col gap-1.5">
            <div className="flex w-fit items-center gap-1.5 rounded-full bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-card backdrop-blur">
              <span className="inline-block size-2.5 rounded-full bg-map-reviewed" />{" "}
              {(myPlaces ?? []).length} places you've reviewed
            </div>
            {mySavedPlaces && mySavedPlaces.length > 0 ? (
              <div className="flex w-fit items-center gap-1.5 rounded-full bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-card backdrop-blur">
                <span className="inline-block size-2.5 rounded-full bg-map-saved" />{" "}
                {mySavedPlaces.length} want to go
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Button
        size="icon"
        variant="secondary"
        aria-label="Show my location"
        className="absolute bottom-6 right-4 z-10 size-12 rounded-2xl shadow-card"
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

      {mode === "discover" ? (
        <Button
          asChild
          variant="secondary"
          className="absolute bottom-6 left-4 z-10 h-9 rounded-full px-3 text-xs shadow-card"
        >
          <Link to="/new" search={{ create: true }}>
            <Plus size={14} className="mr-1" /> Can't find it?
          </Link>
        </Button>
      ) : null}

      <PlaceSheet target={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function PlaceSheet({ target, onClose }: { target: SheetTarget | null; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  /*
   * Ein Panel, zwei Herkuenfte. Ein eigener Pin bringt seine Datenbank-id
   * schon mit -- dann entfaellt das Nachschlagen ueber die Google-Kennung,
   * das fuer von Hand angelegte Orte ohnehin ins Leere liefe.
   */
  const cacheKey = target
    ? target.kind === "local"
      ? `local:${target.id}`
      : `google:${target.place.googlePlaceId}`
    : null;

  const { data } = useQuery({
    queryKey: ["map-place-reviews", cacheKey],
    enabled: !!target,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      const local =
        target!.kind === "local"
          ? { id: target!.id }
          : (
              await supabase
                .from("places")
                .select("id")
                .eq("google_place_id", target!.place.googlePlaceId)
                .maybeSingle()
            ).data;
      if (!local)
        return { localId: null, place: null, reviews: [], isSaved: false, myRating: null };
      const [{ data: reviews }, savedRes, placeRes, mineRes] = await Promise.all([
        // Ohne die eigene Bewertung: dieses Panel ist durchgehend als
        // "from your circle" beschriftet, die eigene Meinung gehoert
        // nicht hinein -- weder in die Liste noch in den Durchschnitt.
        // Die vollstaendige Ansicht ("All reviews") zeigt sie separat.
        supabase
          .from("reviews")
          .select(
            "id, rating, text, created_at, profiles:profiles!reviews_user_id_fkey(username, display_name, avatar_url)",
          )
          .eq("place_id", local.id)
          .neq("user_id", me ?? "")
          .order("created_at", { ascending: false }),
        me
          ? supabase
              .from("saved_places")
              .select("place_id")
              .eq("user_id", me)
              .eq("place_id", local.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        // Nur fuer eigene Pins noetig: Kategorie, Stadt und Google-Kennung
        // stehen dort nicht im Marker, kommen also aus der Datenbank.
        target!.kind === "local"
          ? supabase
              .from("places")
              .select("name, city, category, google_place_id")
              .eq("id", local.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        // Die eigene Bewertung getrennt holen. Sie gehoert nicht in den
        // Freundes-Durchschnitt, darf aber auch nicht verschwiegen werden:
        // auf "My Map" zeigt der Pin genau diese Note, und ein Panel, das
        // dazu "keine Bewertungen" meldet, widerspraeche dem Pin.
        me
          ? supabase
              .from("reviews")
              .select("rating")
              .eq("place_id", local.id)
              .eq("user_id", me)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        localId: local.id,
        place: placeRes.data,
        reviews: reviews ?? [],
        isSaved: !!savedRes.data,
        myRating: (mineRes.data as { rating: number } | null)?.rating ?? null,
      };
    },
  });

  /*
   * Was der Kopf des Panels anzeigt. Bei einem eigenen Pin steht der Name
   * sofort zur Verfuegung (aus dem Marker), Kategorie und Stadt kommen
   * nach -- so ist das Panel nie einen Moment lang leer.
   */
  const header = !target
    ? null
    : target.kind === "google"
      ? {
          name: target.place.name,
          subtitle: [target.place.category, target.place.address].filter(Boolean).join(" · "),
          lat: target.place.lat,
          lng: target.place.lng,
          googlePlaceId: target.place.googlePlaceId as string | null,
        }
      : {
          name: data?.place?.name ?? target.name,
          subtitle: [data?.place?.category, data?.place?.city].filter(Boolean).join(" · "),
          lat: target.lat,
          lng: target.lng,
          googlePlaceId: data?.place?.google_place_id ?? null,
        };

  const reviews = data?.reviews ?? [];
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

  /*
   * Die Datenbank-id des Ortes. Ein eigener Pin kennt sie bereits; ein
   * Google-Ort wird bei Bedarf angelegt -- aber erst, wenn der Nutzer
   * wirklich etwas tut (bewerten, merken), nicht schon beim Ansehen.
   */
  async function resolveLocalId() {
    if (!target) return null;
    return target.kind === "local" ? target.id : await ensureLocalPlace(target.place);
  }

  async function go(to: "place" | "review") {
    if (!target) return;
    setBusy(true);
    try {
      const id = await resolveLocalId();
      if (!id) return;
      /*
       * Erst schliessen, dann wechseln. Waehrend das Panel offen ist,
       * sperrt es die Klicks auf der Seite dahinter und raeumt das erst
       * beim Schliessen wieder auf. Wechselt man die Seite, ohne es zu
       * schliessen, kann diese Sperre zurueckbleiben -- die neue Seite
       * ist dann sichtbar, aber nicht bedienbar.
       */
      onClose();
      if (to === "place") navigate({ to: "/place/$placeId", params: { placeId: id } });
      else navigate({ to: "/new", search: { placeId: id } });
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not open place"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSave() {
    if (!target) return;
    void tap();
    setBusy(true);
    try {
      const id = await resolveLocalId();
      if (!id) return;
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) return;
      if (data?.isSaved) {
        await supabase.from("saved_places").delete().eq("user_id", me).eq("place_id", id);
      } else {
        await supabase.from("saved_places").insert({ user_id: me, place_id: id });
      }
      queryClient.invalidateQueries({ queryKey: ["map-place-reviews", cacheKey] });
      queryClient.invalidateQueries({ queryKey: ["saved-google-ids"] });
      queryClient.invalidateQueries({ queryKey: ["my-saved-places"] });
      // Die Pins selbst muessen mitziehen: merkt man einen Ort hier, muss
      // sein Lesezeichen sofort auf der Karte erscheinen.
      queryClient.invalidateQueries({ queryKey: ["my-saved-places-map"] });
      queryClient.invalidateQueries({ queryKey: ["saved-in-view"] });
    } catch (e) {
      toast.error(getErrorMessage(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!target} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0 pb-8">
        {/*
          Kopf neu gefasst: Name und Adresse tragen die Zeile, die beiden
          Nebenhandlungen sitzen als runde Symbolknoepfe rechts daneben.
          Vorher waren beide breite Balken untereinander -- "Take me there"
          bekam damit dasselbe Gewicht wie das Bewerten, obwohl es aus der
          App HERAUS fuehrt. Das gehoert nicht in die erste Reihe.
        */}
        <SheetHeader className="text-left">
          {/*
            pr-8 haelt die Ecke fuer das Schliessen-X frei. Ohne das
            ueberlappten beide: das X sitzt 16px vom Rand, der Inhalt
            beginnt bei 24px -- der Merken-Knopf lag damit teilweise
            darunter, und beide waren schwer zu treffen.
          */}
          <SheetTitle className="flex items-center gap-3 pr-8">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-bold">{header?.name}</span>
              <span className="turi-meta block truncate text-xs font-normal text-muted-foreground">
                {header?.subtitle}
              </span>
            </span>

            <button
              type="button"
              onClick={toggleSave}
              disabled={busy}
              aria-label={data?.isSaved ? "Remove from want to go" : "Add to want to go"}
              aria-pressed={!!data?.isSaved}
              className={`turi-tap flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
                data?.isSaved
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              <Bookmark size={18} fill={data?.isSaved ? "currentColor" : "none"} />
            </button>

            {header ? (
              <a
                href={directionsUrl({
                  name: header.name,
                  lat: header.lat,
                  lng: header.lng,
                  googlePlaceId: header.googlePlaceId,
                })}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Directions in Google Maps"
                className="turi-tap flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground"
              >
                <Navigation size={18} />
              </a>
            ) : null}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3 px-4">
          {/*
            Bewusst NUR der Durchschnitt, keine einzelnen Bewertungen.
            Das Panel ist der schnelle Blick von der Karte aus -- die
            Bewertungen selbst stehen vollstaendig hinter "All reviews".
            Zwei angerissene Karten hier waren beides halb: zu wenig zum
            Lesen, zu viel fuer einen Blick.
          */}
          {avg !== null ? (
            <div className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
              <span className="font-display text-2xl font-bold">{avg.toFixed(1)}</span>
              <Stars value={avg} size={16} />
              <span className="ml-auto text-xs text-muted-foreground">
                {reviews.length} from your circle
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-4">
              <Users size={18} className="text-primary" />
              {/*
                Die eigene Note wird hier benannt, statt sie zu verschweigen:
                auf "My Map" zeigt der Pin genau sie, und ein Panel, das
                daneben "keine Bewertungen" meldet, widerspraeche dem Pin.
              */}
              <p className="text-xs text-muted-foreground">
                {data?.myRating != null
                  ? `You rated this ${data.myRating.toFixed(1)}. No friends have reviewed it yet.`
                  : "No reviews from friends for this place yet."}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              disabled={busy}
              onClick={() => go("review")}
              className="h-12 flex-1 rounded-2xl"
            >
              <Star size={18} className="mr-1" /> Review
            </Button>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => go("place")}
              className="h-12 flex-1 rounded-2xl"
            >
              All reviews
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
