export const CATEGORIES = [
  "Restaurant",
  "Cafe",
  "Bar",
  "Hotel",
  "Beach",
  "Museum",
  "Landmark",
  "Nature",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/*
 * Kategorien vereinheitlichen.
 *
 * WARUM ES DAS BRAUCHT: In der Spalte places.category lagen bisher zwei
 * voellig verschiedene Sorten Werte nebeneinander.
 *
 *   - Von Hand angelegte Orte trugen einen unserer neun festen Werte
 *     ("Cafe", "Restaurant", ...).
 *   - Ueber die Karte angelegte Orte trugen Googles ANZEIGETEXT --
 *     "Coffee shop", "Cafetería", "Café-bar", je nach Antwortsprache.
 *     Fiel das Feld aus, stand dort "Sonstiges".
 *
 * Ein Filter "Cafes" haette damit einen Teil der Cafes nicht gefunden --
 * schlimmer als kein Filter, weil man ihm glaubt.
 *
 * Google liefert neben dem Anzeigetext auch einen maschinenlesbaren Typ
 * ("coffee_shop", "italian_restaurant"). Der ist sprachunabhaengig und
 * stabil; ihn holen wir ohnehin ab und haben ihn bisher weggeworfen. Er
 * ist jetzt die Hauptquelle, der Anzeigetext nur noch Rueckfall fuer
 * Altbestand.
 *
 * Dieselbe Zuordnung noch einmal in SQL steht in der Migration
 * 20260921090000_normalize_place_categories.sql -- sie zieht die bereits
 * gespeicherten Orte nach. Aendert sich hier etwas Grundsaetzliches,
 * gehoert es dort mit hinein.
 */

const CAFE = new Set([
  "cafe",
  "cat_cafe",
  "dog_cafe",
  "cafeteria",
  "coffee_shop",
  "bakery",
  "bagel_shop",
  "tea_house",
  "dessert_shop",
  "dessert_restaurant",
  "ice_cream_shop",
  "juice_shop",
  "donut_shop",
  "acai_shop",
  "candy_store",
  "chocolate_shop",
  "confectionery",
]);

const BAR = new Set(["bar", "bar_and_grill", "pub", "wine_bar", "night_club"]);

const HOTEL = new Set([
  "hotel",
  "lodging",
  "motel",
  "hostel",
  "inn",
  "japanese_inn",
  "budget_japanese_inn",
  "resort_hotel",
  "extended_stay_hotel",
  "bed_and_breakfast",
  "guest_house",
  "private_guest_room",
  "cottage",
  "farmstay",
  "camping_cabin",
  "campground",
  "rv_park",
]);

const MUSEUM = new Set(["museum", "art_gallery", "art_studio", "aquarium", "planetarium"]);

const LANDMARK = new Set([
  "tourist_attraction",
  "historical_landmark",
  "historical_place",
  "cultural_landmark",
  "monument",
  "sculpture",
  "observation_deck",
  "plaza",
  "visitor_center",
  "amphitheatre",
  "auditorium",
  "performing_arts_theater",
  "opera_house",
  "church",
  "mosque",
  "synagogue",
  "hindu_temple",
  "place_of_worship",
]);

const NATURE = new Set([
  "park",
  "national_park",
  "state_park",
  "dog_park",
  "garden",
  "botanical_garden",
  "hiking_area",
  "wildlife_park",
  "wildlife_refuge",
  "zoo",
  "marina",
  "natural_feature",
]);

/** Reihenfolge zaehlt: "dessert_restaurant" ist ein Cafe, nicht ein Restaurant. */
function fromType(type: string): Category | null {
  const t = type.toLowerCase();
  if (CAFE.has(t)) return "Cafe";
  if (BAR.has(t)) return "Bar";
  if (HOTEL.has(t)) return "Hotel";
  if (t === "beach") return "Beach";
  if (MUSEUM.has(t)) return "Museum";
  if (LANDMARK.has(t)) return "Landmark";
  if (NATURE.has(t)) return "Nature";
  if (t === "restaurant" || t.endsWith("_restaurant")) return "Restaurant";
  if (
    t === "steak_house" ||
    t === "diner" ||
    t === "deli" ||
    t === "food_court" ||
    t === "sandwich_shop" ||
    t === "meal_takeaway" ||
    t === "meal_delivery"
  ) {
    return "Restaurant";
  }
  if (t.endsWith("_hotel") || t.endsWith("_inn")) return "Hotel";
  return null;
}

/**
 * Rueckfall fuer Orte ohne maschinenlesbaren Typ: Googles Anzeigetext.
 *
 * Wir fragen Google mit languageCode "en" an, der Text ist also in aller
 * Regel englisch ("Coffee shop", "Italian restaurant"). Die Pruefung auf
 * "restaurant" steht VOR der auf "bar", sonst wuerde "Barbecue
 * restaurant" als Bar gelten.
 */
const TEXT_RULES: [RegExp, Category][] = [
  [/coffee|caf[eé]|bakery|tea house|ice cream|dessert|patisserie/, "Cafe"],
  [/restaurant|steak|\bdiner\b|bistro|pizzeria|food court|\bdeli\b/, "Restaurant"],
  // Wortgrenzen bei den kurzen Woertern: "bar" steckt sonst auch in
  // "Barber shop", "pub" in "Public library".
  [/\bbars?\b|\bpubs?\b|brewery|night ?club|taproom/, "Bar"],
  [/hotel|hostel|motel|lodging|resort|guest house|bed & breakfast/, "Hotel"],
  [/beach/, "Beach"],
  [/museum|gallery|aquarium/, "Museum"],
  // "park" mit Wortgrenze, sonst faellt jeder "Parking lot" unter Natur.
  [/\bparks?\b|garden|\bzoo\b|\btrail|hiking|nature|forest/, "Nature"],
  [/attraction|landmark|monument|church|temple|mosque|synagogue/, "Landmark"],
];

function fromText(text: string): Category | null {
  if (CATEGORIES.includes(text as Category)) return text as Category;
  const t = text.toLowerCase();
  for (const [pattern, category] of TEXT_RULES) {
    if (pattern.test(t)) return category;
  }
  return null;
}

/**
 * Die Kategorie eines Ortes aus Googles Angaben -- immer einer unserer
 * neun festen Werte, damit sich danach filtern laesst.
 */
export function categoryFromGoogle(
  googleType: string | null | undefined,
  displayText: string | null | undefined,
): Category {
  if (googleType) {
    const byType = fromType(googleType);
    if (byType) return byType;
  }
  if (displayText) {
    const byText = fromText(displayText);
    if (byText) return byText;
  }
  return "Other";
}

/**
 * Vorhandene Werte auf die feste Liste zwingen -- fuer Orte, die vor
 * dieser Vereinheitlichung angelegt wurden und noch Googles Anzeigetext
 * tragen. Unbekanntes bleibt "Other", damit der Filter vollstaendig ist.
 */
export function normalizeCategory(value: string | null | undefined): Category {
  if (!value) return "Other";
  if (CATEGORIES.includes(value as Category)) return value as Category;
  return fromType(value) ?? fromText(value) ?? "Other";
}
