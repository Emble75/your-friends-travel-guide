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

/*
 * Wie lange eine Antwort liegen bleibt -- je nachdem, wie schnell sie
 * verdirbt.
 *
 * STAMMDATEN eines Ortes (Name, Adresse, Art, Koordinaten) aendern sich
 * praktisch nie: ein halbes Jahr. Frueher standen hier 30 Tage, weil im
 * selben Eintrag die Oeffnungszeiten lagen -- die sind entfernt, also
 * faellt die Begrenzung weg.
 *
 * TREFFERLISTEN einer Suche altern schneller: Es eroeffnen neue Orte,
 * die sonst monatelang nicht auftauchten. Zwei Monate sind ein
 * Kompromiss zwischen Kosten und Vollstaendigkeit.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_DETAILS_MS = 180 * DAY_MS;
const TTL_SEARCH_MS = 60 * DAY_MS;

/** Rundet Koordinaten auf ein ~1,1km-Raster, damit nahe beieinanderliegende
 * Suchanfragen denselben Cache-Eintrag treffen. */
function gridCoord(v: number) {
  return Math.round(v * 100) / 100;
}

async function withCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
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
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
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
/*
 * Die Einzelort-Abfrage (Get Place). Google liefert das Objekt hier
 * direkt zurueck, nicht in ein "places"-Array verpackt -- das
 * Feld-Praefix "places." darf deshalb NICHT verwendet werden (sonst
 * 400).
 *
 * KEINE OEFFNUNGSZEITEN: Sie lagen eine Zeit lang mit drin und haben
 * diese Abfrage in Googles teuerste Feldgruppe gehoben (rund 25 statt
 * 17 Dollar je tausend). Das war es nicht wert -- und es hatte eine
 * zweite, groessere Folge: Weil Oeffnungszeiten verderben, musste der
 * Zwischenspeicher kurz bleiben. Ohne sie enthaelt die Antwort nur
 * noch Stammdaten, die sich praktisch nie aendern, und darf entsprechend
 * lange liegen.
 */ const SINGLE_FIELD_MASK =
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

export async function searchPlacesText(query: string, lat?: number, lng?: number) {
  const normalizedQuery = query.trim().toLowerCase();
  const locationPart =
    typeof lat === "number" && typeof lng === "number"
      ? `${gridCoord(lat)}:${gridCoord(lng)}`
      : "global";
  const cacheKey = `text:${normalizedQuery}:${locationPart}`;

  return withCache(
    cacheKey,
    () => {
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
    },
    TTL_SEARCH_MS,
  );
}

/**
 * Holt genau einen Ort per Google Place-ID -- fuer Klicks auf Googles
 * eingebaute, kostenlose Kartensymbole (Restaurants, Cafes etc., die
 * standardmaessig auf jeder Google-Karte angezeigt werden). Deutlich
 * guenstiger als eine Nearby-Search, da nur der tatsaechlich angeklickte
 * Ort abgefragt wird, nicht ein ganzer Umkreis.
 */
export async function placeById(placeId: string, sessionToken?: string): Promise<MapPlace | null> {
  const cacheKey = `details:v2:${placeId}`;
  const result = await withCache(
    cacheKey,
    async () => {
      /*
       * Das Sitzungs-Token gehoert an die Detailabfrage, nicht nur an die
       * Vorschlaege: Erst sie schliesst die Sitzung ab, und erst dadurch
       * werden die vorausgegangenen Tastendruck-Anfragen kostenlos.
       *
       * Wird die Antwort aus dem Zwischenspeicher bedient, geht gar keine
       * Anfrage hinaus -- dann bleibt die Sitzung offen und die
       * Vorschlaege werden einzeln berechnet. Das ist der guenstigere der
       * beiden Faelle und deshalb kein Problem.
       */
      const suffix = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
      const p = await callGet(`places/v1/places/${placeId}${suffix}`);
      return map(p ? [p] : []);
    },
    TTL_DETAILS_MS,
  );
  return result[0] ?? null;
}

export type PlaceSuggestion = {
  /** Googles Kennung -- damit laesst sich der Ort danach genau holen. */
  googlePlaceId: string;
  /** Der hervorgehobene Name, z. B. "Honest Greens". */
  main: string;
  /** Der Zusatz darunter, z. B. "Rua ... , Lisboa". */
  secondary: string;
};

/**
 * Vorschlaege waehrend des Tippens -- Googles Autocomplete.
 *
 * Bewusst NICHT die Volltextsuche: Die ist fuer fertige Suchbegriffe
 * gedacht, liefert vollstaendige Ortsdatensaetze und wird pro Anfrage
 * abgerechnet. Autocomplete liefert nur Namen und Kennung, ist dafuer
 * deutlich guenstiger und genau fuer das Tippen gebaut.
 *
 * KEIN Zwischenspeicher: Jeder Tastendruck erzeugt eine andere Anfrage,
 * da waere ein Speicher nutzlos und wuerde die Tabelle mit Fragmenten
 * volllaufen lassen. Die Volltextsuche wird weiterhin zwischengespeichert.
 */
export async function suggestPlaces(
  input: string,
  lat?: number,
  lng?: number,
  sessionToken?: string,
): Promise<PlaceSuggestion[]> {
  const body: Record<string, unknown> = { input, languageCode: "en" };
  // Ohne Token kostet jeder Tastendruck einzeln; mit Token zaehlt die
  // ganze Suche samt abschliessender Detailabfrage als eine Sitzung.
  if (sessionToken) body["sessionToken"] = sessionToken;
  if (typeof lat === "number" && typeof lng === "number") {
    body["locationBias"] = {
      circle: { center: { latitude: lat, longitude: lng }, radius: 30000 },
    };
  }

  const response = await fetch(endpoint("places/v1/places:autocomplete"), {
    method: "POST",
    // Die Feldmaske der Ortssuche passt hier nicht -- Autocomplete
    // liefert "suggestions", keine "places". Ohne eigene Maske
    // antwortet Google mit 400.
    headers: headers("suggestions.placePrediction"),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`Google autocomplete failed [${response.status}]: ${text}`);
    // Vorschlaege sind Komfort, kein Kernweg: faellt der Dienst aus,
    // soll die Suche weiter benutzbar bleiben statt einen Fehler zu
    // werfen. Der Nutzer tippt dann eben zu Ende und drueckt Suchen.
    return [];
  }

  const json = (await response.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      };
    }[];
  };

  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .map((p) => ({
      googlePlaceId: p.placeId!,
      main: p.structuredFormat?.mainText?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }))
    .filter((s) => s.main);
}
