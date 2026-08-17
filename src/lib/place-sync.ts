import { supabase } from "@/integrations/supabase/client";
import type { MapPlace } from "./maps.server";

function cityFromAddress(address: string | null) {
  if (!address) return "Unbekannt";
  const parts = address.split(",").map((p) => p.trim());
  const candidate = parts.length >= 2 ? parts[parts.length - 2]! : parts[0]!;
  return candidate.replace(/^\d{4,5}\s*/, "") || "Unbekannt";
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
