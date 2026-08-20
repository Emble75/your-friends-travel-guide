import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useGoogleMaps } from "@/hooks/use-google-maps";

export type MiniMapPlace = { id: string; name: string; lat: number; lng: number };

/**
 * Kleine, statische Karte mit Markern fuer eine feste Liste von Orten
 * (z. B. alle von einer Person bewerteten Orte). Zoomt automatisch auf
 * alle Marker. Klick auf einen Marker fuehrt zur Ortsseite.
 */
export function PlacesMiniMap({ places }: { places: MiniMapPlace[] }) {
  const { ready } = useGoogleMaps();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(containerRef.current, {
      center: { lat: 20, lng: 0 },
      zoom: 2,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      clickableIcons: false,
    });
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = places.map((p) => {
      const marker = new google.maps.Marker({
        map: mapRef.current!,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#C9A227",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
      marker.addListener("click", () =>
        navigate({ to: "/place/$placeId", params: { placeId: p.id } }),
      );
      return marker;
    });
    if (places.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      mapRef.current.fitBounds(bounds, 60);
    }
  }, [ready, places, navigate]);

  return <div ref={containerRef} className="size-full rounded-3xl bg-muted" />;
}
