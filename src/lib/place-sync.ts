import { supabase } from "@/integrations/supabase/app-client";
import type { MapPlace } from "./maps.server";

/**
 * Holt den Ortsnamen aus einer Google-Adresse.
 *
 * Der vorletzte Abschnitt einer Adresse traegt ueblicherweise
 * Postleitzahl und Stadt ("1200-161 Lisboa"). Die Zahl muss weg.
 *
 * Frueher wurde dafuer nur `\d{4,5}` gefolgt von Leerzeichen entfernt.
 * Das trifft die deutsche Form ("10115 Berlin"), scheitert aber an allen
 * mehrteiligen: aus "1200-161 Lisboa" wurde "-161 Lisboa", aus
 * "00-001 Warszawa" wurde "-001 Warszawa". Jetzt faellt die fuehrende
 * Zahlengruppe samt Bindestrichen weg, danach noch ein evtl. folgendes
 * Buchstabenpaar (Niederlande: "1012 AB Amsterdam").
 */
function cityFromAddress(address: string | null) {
  if (!address) return "Unknown";
  const parts = address.split(",").map((p) => p.trim());
  const candidate = parts.length >= 2 ? parts[parts.length - 2]! : parts[0]!;
  return (
    candidate
      .replace(/^\d[\d\s-]*/, "")
      .replace(/^[A-Z]{1,2}\s+/, "")
      .trim() || "Unknown"
  );
}

/** Find (or create) the local place row that belongs to a place from the map. */
export async function ensureLocalPlace(place: MapPlace) {
  const { data: existing } = await supabase
    .from("places")
    .select("id")
    .eq("google_place_id", place.googlePlaceId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("places")
    .insert({
      name: place.name,
      city: cityFromAddress(place.address),
      category: place.category ?? "Sonstiges",
      google_place_id: place.googlePlaceId,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      created_by: auth.user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // Someone else created it in the meantime.
    const { data: retry } = await supabase
      .from("places")
      .select("id")
      .eq("google_place_id", place.googlePlaceId)
      .maybeSingle();
    if (retry) return retry.id;
    throw error;
  }
  return data.id;
}
