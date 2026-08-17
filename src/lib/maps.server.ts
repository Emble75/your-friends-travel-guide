const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

export type MapPlace = {
  googlePlaceId: string;
  name: string;
  address: string | null;
  category: string | null;
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
  return call("places/v1/places:searchNearby", {
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
      circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radius, 5000) },
    },
  });
}

export async function searchPlacesText(query: string, lat?: number, lng?: number) {
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
}
