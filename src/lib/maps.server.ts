import { supabaseAdmin } from "@/integrations/supabase/client.server";

/*
 * Zwei Wege zu Googles Places-API -- der direkte gewinnt, wenn er
 * konfiguriert ist.
 *
 * Bisher lief alles ueber Lovables Connector-Gateway. Das ist ein duenner
 * Weiterleiter: Anfragekoerper und Feldmasken sind bereits exakt Googles
 * eigenes Format, nur die Authentifizierung unterscheidet sich. Damit war
 * die Karte -- das Herzstueck der App -- an Lovable gebunden, ohne dass je
 * geprueft war, ob das ausserhalb deren Infrastruktur funktioniert.
 *
 * Ist GOOGLE_PLACES_API_KEY gesetzt, geht es direkt an Google. Sonst
 * weiter ueber den Gateway. Der Umzug auf eine eigene Domain haengt damit
 * nicht mehr an dieser Frage: einen Schluessel hinterlegen genuegt.
 *
 * (Nachgemessen: der Gateway antwortet auch von ausserhalb Lovables mit
 * 401 statt einer Sperre -- ein Netzwerk-Riegel besteht also nicht.)
 */
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const GOOGLE_URL = "https://places.googleapis.com";

function directKey() {
  return process.env["GOOGLE_PLACES_API_KEY"];
}

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
// Bei der Einzelort-Abfrage (Get Place) liefert Google das Objekt direkt
// zurueck, nicht in ein "places"-Array verpackt -- das Feld-Praefix
// "places." darf hier deshalb NICHT verwendet werden (sonst 400).
const SINGLE_FIELD_MASK =
  "id,displayName,formattedAddress,location,primaryTypeDisplayName,primaryType";

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  primaryTypeDisplayName?: { text?: string };
  primaryType?: string;
  location?: { latitude: number; longitude: number };
};

function headers(fieldMask: string = FIELD_MASK) {
  const common = { "Content-Type": "application/json", "X-Goog-FieldMask": fieldMask };

  const direct = directKey();
  if (direct) return { ...common, "X-Goog-Api-Key": direct };

  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error(
      "Places API is not configured. Set GOOGLE_PLACES_API_KEY, or LOVABLE_API_KEY together with GOOGLE_MAPS_API_KEY.",
    );
  }
  return {
    ...common,
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
  };
}

/**
 * Baut die Adresse fuer einen Pfad. Google erwartet ihn ohne das
 * "places/"-Praefix, das der Gateway voranstellt -- deshalb faellt es
 * beim direkten Weg weg.
 */
function endpoint(path: string) {
  if (directKey()) return GOOGLE_URL + "/" + path.replace(/^places\//, "");
  return GATEWAY_URL + "/" + path;
}

function map(places: GooglePlace[] | undefined): MapPlace[] {
  return (places ?? [])
    .filter((p) => p.location)
    .map((p) => ({
      googlePlaceId: p.id,
      name: p.displayName?.text ?? "Unnamed place",
      address: p.formattedAddress ?? null,
      category: p.primaryTypeDisplayName?.text ?? p.primaryType ?? null,
      rawType: p.primaryType ?? null,
      lat: p.location!.latitude,
      lng: p.location!.longitude,
    }));
}

async function call(path: string, body: unknown): Promise<MapPlace[]> {
  const response = await fetch(endpoint(path), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`Google Maps request failed [${response.status}]: ${text}`);
    throw new Error(`Could not load map data (${response.status}).`);
  }
  const json = (await response.json()) as { places?: GooglePlace[] };
  return map(json.places);
}

async function callGet(path: string): Promise<GooglePlace | null> {
  const response = await fetch(endpoint(path), {
    method: "GET",
    headers: headers(SINGLE_FIELD_MASK),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`Google Maps request failed [${response.status}]: ${text}`);
    throw new Error(`Could not load place details (${response.status}).`);
  }
  return (await response.json()) as GooglePlace;
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
      languageCode: "en",
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
      languageCode: "en",
    };
    if (typeof lat === "number" && typeof lng === "number") {
      body["locationBias"] = {
        circle: { center: { latitude: lat, longitude: lng }, radius: 20000 },
      };
    }
    return call("places/v1/places:searchText", body);
  });
}

/**
 * Holt genau einen Ort per Google Place-ID -- fuer Klicks auf Googles
 * eingebaute, kostenlose Kartensymbole (Restaurants, Cafes etc., die
 * standardmaessig auf jeder Google-Karte angezeigt werden). Deutlich
 * guenstiger als eine Nearby-Search, da nur der tatsaechlich angeklickte
 * Ort abgefragt wird, nicht ein ganzer Umkreis.
 */
export async function placeById(placeId: string): Promise<MapPlace | null> {
  const cacheKey = `details:${placeId}`;
  const result = await withCache(cacheKey, async () => {
    const p = await callGet(`places/v1/places/${placeId}`);
    return map(p ? [p] : []);
  });
  return result[0] ?? null;
}
