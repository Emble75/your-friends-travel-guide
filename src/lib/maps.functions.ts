import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getNearbyPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radius: z.number().min(100).max(5000).default(1200),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { nearbyPlaces } = await import("./maps.server");
    return nearbyPlaces(data.lat, data.lng, data.radius);
  });

export const searchMapPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        query: z.string().trim().min(2).max(120),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { searchPlacesText } = await import("./maps.server");
    return searchPlacesText(data.query, data.lat, data.lng);
  });
