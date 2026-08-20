import { createServerFn } from "@tanstack/react-start";
import { requireAppSupabaseAuth } from "@/integrations/supabase/app-auth-middleware";

/**
 * Loescht das eigene Konto vollstaendig (App Store Guideline 5.1.1(v) --
 * eine reine "Deaktivierung" reicht Apple nicht, es muss eine echte
 * In-App-Loeschung geben). Laeuft server-seitig mit dem Service-Role-Key,
 * da normale Nutzer keine auth.users-Zeilen loeschen duerfen.
 *
 * Die Datenbank-Fremdschluessel sind mit ON DELETE CASCADE angelegt
 * (profiles -> reviews, follows, blocks, reports, review_images), daher
 * loescht sich der komplette Datensatz automatisch mit. Storage-Dateien
 * (Avatar, Fotos) werden hier zusaetzlich best-effort aufgeraeumt, da sie
 * nicht per Fremdschluessel verknuepft sind.
 */
export const deleteOwnAccount = createServerFn({ method: "POST" })
  .middleware([requireAppSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    for (const bucket of ["avatars", "review-photos"] as const) {
      const { data: files } = await supabaseAdmin.storage.from(bucket).list(userId);
      if (files && files.length > 0) {
        await supabaseAdmin.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
      }
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
