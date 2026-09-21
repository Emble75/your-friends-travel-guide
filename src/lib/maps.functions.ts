import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppSupabaseAuth } from "@/integrations/supabase/app-auth-middleware";

export const searchMapPlaces = createServerFn({ method: "POST" })
  .middleware([requireAppSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        query: z.string().trim().min(2).max(120),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        // Sprache des Geraets -- ohne sie sucht Google auf Englisch,
        // und "Roma" findet dann Roma in Texas statt Rom.
        language: z
          .string()
          .trim()
          .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/)
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { searchPlacesText } = await import("./maps.server");
    return searchPlacesText(data.query, data.lat, data.lng, data.language);
  });

export const getPlaceById = createServerFn({ method: "POST" })
  .middleware([requireAppSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        placeId: z.string().trim().min(1).max(200),
        // Siehe suggestMapPlaces: schliesst eine Vorschlagssitzung ab.
        sessionToken: z.string().trim().min(8).max(64).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { placeById } = await import("./maps.server");
    return placeById(data.placeId, data.sessionToken);
  });

export const suggestMapPlaces = createServerFn({ method: "POST" })
  .middleware([requireAppSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        input: z.string().trim().min(2).max(120),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        /*
         * Die Kennung einer Vorschlagssitzung.
         *
         * Google rechnet alle Tastendruck-Anfragen einer Suche ZUSAMMEN
         * mit der abschliessenden Detailabfrage als EINE Sitzung ab --
         * aber nur, wenn alle dieselbe Kennung tragen. Ohne sie kostet
         * jeder Tastendruck einzeln.
         */
        sessionToken: z.string().trim().min(8).max(64).optional(),
        language: z
          .string()
          .trim()
          .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/)
          .optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { suggestPlaces } = await import("./maps.server");
    return suggestPlaces(data.input, data.lat, data.lng, data.sessionToken, data.language);
  });
