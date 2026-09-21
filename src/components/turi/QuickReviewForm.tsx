import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { createReview } from "@/lib/create-review";
import { getErrorMessage } from "@/lib/turi";
import { isNative, takePhoto } from "@/lib/native";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarPicker } from "./Stars";
import { FolderPicker, NO_FOLDER, resolveFolderChoice, type FolderChoice } from "./FolderPicker";

/*
 * Bewerten, ohne die Karte zu verlassen.
 *
 * Bisher fuehrte "Review" von der Ortsvorschau auf eine eigene Seite.
 * Die Karte wurde dabei abgebaut, und der Wechsel las sich als Bruch --
 * dasselbe, was schon beim Lesen der Bewertungen gestoert hat.
 *
 * Diese Fassung ist bewusst KUERZER als das Formular auf der Seite: Der
 * Ort steht ja bereits fest. Es fehlen die Ortssuche, das Anlegen eines
 * neuen Ortes und die Entwurfsverwaltung -- alles Dinge, die nur
 * gebraucht werden, wenn man ohne Ort anfaengt. Was bleibt: Sterne,
 * Text, Fotos, Ordner.
 *
 * Das Anlegen selbst teilen sich beide Wege (lib/create-review.ts),
 * damit nicht zwei Fassungen auseinanderlaufen.
 */
export function QuickReviewForm({
  placeId,
  placeName,
  onDone,
  onCancel,
}: {
  placeId: string;
  placeName: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [folder, setFolder] = useState<FolderChoice>(NO_FOLDER);
  const [saving, setSaving] = useState(false);

  const previews = files.map((f) => URL.createObjectURL(f));

  async function addPhotoNative() {
    const file = await takePhoto("prompt");
    if (file) setFiles((prev) => [...prev, file].slice(0, 3));
  }

  async function submit() {
    if (rating < 1) {
      toast.error("Please give a star rating");
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;
      const folderId = await resolveFolderChoice(folder, userId);
      await createReview({ userId, placeId, rating, text, files, folderId });
      toast.success("Review saved");
      queryClient.invalidateQueries();
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center py-1">
        <StarPicker value={rating} onChange={setRating} />
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`How was ${placeName}? What should your friends know?`}
        rows={5}
        className="rounded-2xl"
      />

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Photos (max. 3)
        </p>
        <div className="grid grid-cols-3 gap-2">
          {files.map((_, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
              <img src={previews[i]} alt="" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Remove photo"
                className="turi-hit absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {files.length < 3 ? (
            isNative() ? (
              <button
                type="button"
                onClick={addPhotoNative}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-muted-foreground"
              >
                <ImagePlus size={22} />
                <span className="text-2xs">Add</span>
              </button>
            ) : (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-muted-foreground">
                <ImagePlus size={22} />
                <span className="text-2xs">Add</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) =>
                    e.target.files &&
                    setFiles((prev) => [...prev, ...Array.from(e.target.files!)].slice(0, 3))
                  }
                />
              </label>
            )
          ) : null}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Folder</p>
        <FolderPicker value={folder} onChange={setFolder} />
      </div>

      <div className="flex gap-2 pb-4 pt-1">
        <Button variant="secondary" onClick={onCancel} className="h-12 flex-1 rounded-2xl">
          Cancel
        </Button>
        <Button disabled={saving} onClick={submit} className="h-12 flex-[2] rounded-2xl">
          {saving ? "Saving…" : "Publish review"}
        </Button>
      </div>
    </div>
  );
}
