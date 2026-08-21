import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

// Orte ändern sich selten – 30 Tage Cache spart die meisten Google-Places-Kosten.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Rundet Koordinaten auf ein ~1,1km-Raster, damit nahe beieinanderliegende
 * Suchanfragen denselben Cache-Eintrag treffen. */
function gridCoord(v: number) {
  return Math.round(v * 100) / 100;
}

async function withCache<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  const { data: cached } = await supabaseAdmin
    .from("poi_cache")
    .select("payload, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (cached && new Date(cached.expires_at) > new Date()) {
    return cached.payload as T;
  }

  const fresh = await fetcher();

  // Cache best-effort schreiben – ein Fehler hier darf die eigentliche Antwort nicht blockieren.
  void supabaseAdmin
    .from("poi_cache")
    .upsert({
      cache_key: cacheKey,
      payload: fresh as unknown as never,
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    })
    .then(({ error }) => {
      if (error)
        console.error(`[poi_cache] Schreiben fehlgeschlagen für ${cacheKey}:`, error.message);
    });

  return fresh;
}

export type MapPlace = {
  googlePlaceId: string;
  name: string;
  address: string | null;
  category: string | null;
  // Roher Google-Typ (z. B. "restaurant", aber auch "locality",
  // "administrative_area_level_1" fuer Staedte/Regionen). Wird genutzt,
  // um bei der Suche zwischen "Stadt/Region gesucht" (hinzoomen) und
  // "konkreter Ort gesucht" (direkt oeffnen) zu unterscheiden.
  rawType: string | null;
  lat: number;
  lng: number;
};

const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,places.primaryType";

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  primaryTypeDisplayName?: { text?: string };
  primaryType?: string;
  location?: { latitude: number; longitude: number };
};

function headers() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovableKey || !connectionKey) throw new Error("Google Maps ist nicht verbunden.");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
    "X-Goog-FieldMask": FIELD_MASK,
  };
}

function map(places: GooglePlace[] | undefined): MapPlace[] {
  return (places ?? [])
    .filter((p) => p.location)
    .map((p) => ({
      googlePlaceId: p.id,
      name: p.displayName?.text ?? "Unbenannter Ort",
      address: p.formattedAddress ?? null,
      category: p.primaryTypeDisplayName?.text ?? p.primaryType ?? null,
      rawType: p.primaryType ?? null,
      lat: p.location!.latitude,
      lng: p.location!.longitude,
    }));
}

async function call(path: string, body: unknown): Promise<MapPlace[]> {
  const response = await fetch(`${GATEWAY_URL}/${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`Google Maps request failed [${response.status}]: ${text}`);
    throw new Error(`Kartendaten konnten nicht geladen werden (${response.status}).`);
  }
  const json = (await response.json()) as { places?: GooglePlace[] };
  return map(json.places);
}

export async function nearbyPlaces(lat: number, lng: number, radius: number) {
  const roundedRadius = Math.round(Math.min(radius, 5000) / 250) * 250;
  const cacheKey = `nearby:${gridCoord(lat)}:${gridCoord(lng)}:${roundedRadius}`;
  return withCache(cacheKey, () =>
    call("places/v1/places:searchNearby", {
      includedTypes: [
        "restaurant",
        "cafe",
        "bar",
        "hotel",
        "museum",
        "tourist_attraction",
        "park",
        "bakery",
        "night_club",
      ],
      maxResultCount: 20,
      languageCode: "de",
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: roundedRadius },
      },
    }),
  );
}

export async function searchPlacesText(query: string, lat?: number, lng?: number) {
  const normalizedQuery = query.trim().toLowerCase();
  const locationPart =
    typeof lat === "number" && typeof lng === "number"
      ? `${gridCoord(lat)}:${gridCoord(lng)}`
      : "global";
  const cacheKey = `text:${normalizedQuery}:${locationPart}`;

  return withCache(cacheKey, () => {
    const body: Record<string, unknown> = {
      textQuery: query,
      maxResultCount: 15,
      languageCode: "de",
    };
    if (typeof lat === "number" && typeof lng === "number") {
      body["locationBias"] = {
        circle: { center: { latitude: lat, longitude: lng }, radius: 20000 },
      };
    }
    return call("places/v1/places:searchText", body);
  });
}
