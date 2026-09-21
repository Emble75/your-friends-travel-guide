import { supabase } from "@/integrations/supabase/app-client";
import { compressImage } from "./turi";

/*
 * Eine Bewertung anlegen -- an einer Stelle.
 *
 * Das Anlegen gibt es jetzt an zwei Orten: als eigene Seite (wenn man
 * den Ort erst suchen oder von Hand anlegen muss) und als Panel ueber
 * der Karte (wenn der Ort schon feststeht). Beide teilen sich diesen
 * Weg, damit nicht zwei Fassungen auseinanderlaufen -- etwa bei der
 * Bildgroesse oder der Reihenfolge der Fotos.
 */
export async function createReview(input: {
  userId: string;
  placeId: string;
  rating: number;
  text: string;
  files: File[];
  folderId: string | null;
}): Promise<string> {
  const { data: review, error } = await supabase
    .from("reviews")
    .insert({
      user_id: input.userId,
      place_id: input.placeId,
      rating: input.rating,
      text: input.text.trim() || null,
      trip_folder_id: input.folderId,
    })
    .select("id")
    .single();
  if (error) throw error;

  for (let i = 0; i < input.files.length; i++) {
    // Verkleinern vor dem Hochladen: Ein Foto aus der Kamera hat gern
    // vier Megabyte, und niemand sieht den Unterschied zu 1600 Pixeln.
    const file = await compressImage(input.files[i]!, { maxDimension: 1600, quality: 0.8 });
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${input.userId}/${review.id}-${i}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("review-photos")
      .upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { error: imgErr } = await supabase
      .from("review_images")
      .insert({ review_id: review.id, image_url: path, position: i });
    if (imgErr) throw imgErr;
  }

  return review.id;
}
