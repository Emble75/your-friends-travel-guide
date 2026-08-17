import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LocateFixed, MapPin, Search, Star, Users } from "lucide-react";
import { toast } from "sonner";
import { getNearbyPlaces, searchMapPlaces } from "@/lib/maps.functions";
import type { MapPlace } from "@/lib/maps.server";
import { ensureLocalPlace } from "@/lib/place-sync";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { TuriWordmark } from "@/components/turi/Logo";
import { Stars } from "@/components/turi/Stars";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/map")({
  head: () => ({
    meta: [
      { title: "Karte – Turi" },
      {
        name: "description",
        content:
          "Entdecke Cafés, Restaurants und Sehenswürdigkeiten auf der Karte und sieh die Bewertungen deiner Freunde.",
      },
      { property: "og:title", content: "Karte – Turi" },
      {
        property: "og:description",
        content: "Orte auf der Karte entdecken und Freunde-Bewertungen sehen.",
      },
    ],
  }),
  component: MapPage,
});

const DEFAULT_CENTER = { lat: 41.9028, lng: 12.4964 };

function MapPage() {
  const { ready, error } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapPlace[] | null>(null);

  const nearby = useServerFn(getNearbyPlaces);
  const searchFn = useServerFn(searchMapPlaces);

  const { data: places, isFetching } = useQuery({
    queryKey: ["nearby", center.lat.toFixed(3), center.lng.toFixed(3)],
    queryFn: () => nearby({ data: { lat: center.lat, lng: center.lng, radius: 1500 } }),
    enabled: ready,
    staleTime: 5 * 60_000,
  });

  // Init map
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 14,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      clickableIcons: false,
    });
    mapRef.current.addListener("idle", () => {
      const c = mapRef.current!.getCenter();
      if (!c) return;
      setCenter({ lat: c.lat(), lng: c.lng() });
    });
  }, [ready]);

  // Center on the user once
  useEffect(() => {
    if (!ready || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapRef.current?.setCenter(c);
        setCenter(c);
      },
      () => undefined,
      { timeout: 8000 },
    );
  }, [ready]);

  // Render markers
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = (searchResults ?? places ?? []).map((p) => {
      const marker = new google.maps.Marker({
        map: mapRef.current!,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#FF6B35",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => setSelected(p));
      return marker;
    });
  }, [ready, places, searchResults]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    try {
      const results = await searchFn({ data: { query: q, lat: center.lat, lng: center.lng } });
      setSearchResults(results);
      if (results[0] && mapRef.current) {
        mapRef.current.panTo({ lat: results[0].lat, lng: results[0].lng });
        mapRef.current.setZoom(14);
      } else {
        toast.info("Nichts gefunden");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suche fehlgeschlagen");
    }
  }, [query, center, searchFn]);

  return (
    <div className="relative h-[calc(100vh-5.5rem)] w-full overflow-hidden">
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

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 space-y-3 p-4">
        <div className="pointer-events-auto flex items-center justify-between rounded-3xl bg-card/95 px-4 py-2 shadow-card backdrop-blur">
          <TuriWordmark />
          {isFetching ? <Loader2 size={16} className="animate-spin text-primary" /> : null}
        </div>
        <div className="pointer-events-auto relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim()) setSearchResults(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Stadt oder Ort suchen"
            className="h-12 rounded-2xl border-0 bg-card pl-11 shadow-card"
          />
        </div>
      </div>

      <Button
        size="icon"
        variant="secondary"
        aria-label="Meinen Standort zeigen"
        className="absolute bottom-4 right-4 z-10 size-12 rounded-2xl shadow-card"
        onClick={() =>
          navigator.geolocation?.getCurrentPosition((pos) => {
            const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            mapRef.current?.panTo(c);
            setCenter(c);
            setSearchResults(null);
          })
        }
      >
        <LocateFixed size={20} />
      </Button>

      <PlaceSheet place={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function PlaceSheet({ place, onClose }: { place: MapPlace | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["map-place-reviews", place?.googlePlaceId],
    enabled: !!place,
    queryFn: async () => {
      const { data: local } = await supabase
        .from("places")
        .select("id")
        .eq("google_place_id", place!.googlePlaceId)
        .maybeSingle();
      if (!local) return { localId: null, reviews: [] };
      const { data: reviews } = await supabase
        .from("reviews")
        .select(
          "id, rating, text, created_at, profiles:profiles!reviews_user_id_fkey(username, display_name, avatar_url)",
        )
        .eq("place_id", local.id)
        .order("created_at", { ascending: false });
      return { localId: local.id, reviews: reviews ?? [] };
    },
  });

  const reviews = data?.reviews ?? [];
  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : null;

  async function go(target: "place" | "review") {
    if (!place) return;
    setBusy(true);
    try {
      const id = await ensureLocalPlace(place);
      if (target === "place") navigate({ to: "/place/$placeId", params: { placeId: id } });
      else navigate({ to: "/new", search: { placeId: id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ort konnte nicht geöffnet werden");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!place} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl border-0 pb-8">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-accent-foreground">
              <MapPin size={20} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold">{place?.name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {place?.category ? `${place.category} · ` : ""}
                {place?.address}
              </span>
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3 px-4">
          {avg !== null ? (
            <div className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
              <span className="font-display text-2xl font-bold">{avg.toFixed(1)}</span>
              <Stars value={avg} size={16} />
              <span className="ml-auto text-xs text-muted-foreground">
                {reviews.length} aus deinem Kreis
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-4">
              <Users size={18} className="text-primary" />
              <p className="text-xs text-muted-foreground">
                Noch keine Freunde-Bewertungen für diesen Ort.
              </p>
            </div>
          )}

          {reviews.slice(0, 2).map((r) => (
            <div key={r.id} className="flex gap-3 rounded-2xl border border-border p-3">
              <UserAvatar
                avatarPath={r.profiles?.avatar_url}
                name={r.profiles?.display_name ?? r.profiles?.username}
                className="size-9"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">
                    {r.profiles?.display_name || r.profiles?.username}
                  </span>
                  <Stars value={r.rating} size={12} />
                </div>
                {r.text ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{r.text}</p>
                ) : null}
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Button disabled={busy} onClick={() => go("review")} className="h-12 flex-1 rounded-2xl">
              <Star size={18} className="mr-1" /> Bewerten
            </Button>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => go("place")}
              className="h-12 flex-1 rounded-2xl"
            >
              Alle Bewertungen
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
