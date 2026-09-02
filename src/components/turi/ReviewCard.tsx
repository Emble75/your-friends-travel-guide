import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, MapPin, MoreVertical, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Stars, StarPicker } from "./Stars";
import { UserAvatar } from "./UserAvatar";
import { ReportDialog } from "./ReportDialog";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, getErrorMessage, signedUrls, timeAgo } from "@/lib/turi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export type ReviewWithRelations = {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
  user_id: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
  places: { id: string; name: string; city: string; category: string } | null;
  review_images: { id: string; image_url: string; position: number }[];
};

type ExistingImage = { id: string; image_url: string; position: number };

export function ReviewCard({
  review,
  showPlace = true,
}: {
  review: ReviewWithRelations;
  showPlace?: boolean;
}) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editRating, setEditRating] = useState(review.rating);
  const [editText, setEditText] = useState(review.text ?? "");
  const [editExistingImages, setEditExistingImages] = useState<ExistingImage[]>([]);
  const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: me } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: 5 * 60_000,
  });
  const isOwn = me === review.user_id;

  const sortedImages = review.review_images.slice().sort((a, b) => a.position - b.position);
  const paths = sortedImages.map((i) => i.image_url);

  const { data: urls } = useQuery({
    queryKey: ["review-images", review.id, paths.join(",")],
    queryFn: () => signedUrls("review-photos", paths),
    enabled: paths.length > 0,
  });

  const urlByImageId = new Map(sortedImages.map((img, i) => [img.id, urls?.[i] ?? null]));
  const editNewPreviews = editNewFiles.map((f) => URL.createObjectURL(f));
  const totalEditPhotos = editExistingImages.length + editNewFiles.length;

  const profile = review.profiles;

  function openEdit() {
    setEditRating(review.rating);
    setEditText(review.text ?? "");
    setEditExistingImages(sortedImages);
    setEditNewFiles([]);
    setEditOpen(true);
  }

  function onPickEditFiles(list: FileList | null) {
    if (!list) return;
    const maxNew = Math.max(0, 3 - editExistingImages.length);
    setEditNewFiles((prev) => [...prev, ...Array.from(list)].slice(0, maxNew));
  }

  async function saveEdit() {
    if (editRating < 1) {
      toast.error("Please give a star rating");
      return;
    }
    if (!me) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("reviews")
        .update({ rating: editRating, text: editText.trim() || null })
        .eq("id", review.id);
      if (error) throw error;

      // Entfernte Fotos aufraeumen (Storage + DB-Zeile)
      const removedImages = sortedImages.filter(
        (img) => !editExistingImages.some((e) => e.id === img.id),
      );
      if (removedImages.length > 0) {
        await supabase.storage.from("review-photos").remove(removedImages.map((i) => i.image_url));
        const { error: delErr } = await supabase
          .from("review_images")
          .delete()
          .in(
            "id",
            removedImages.map((i) => i.id),
          );
        if (delErr) throw delErr;
      }

      // Neue Fotos hochladen
      if (editNewFiles.length > 0) {
        const startPosition = editExistingImages.length;
        for (let i = 0; i < editNewFiles.length; i++) {
          const compressed = await compressImage(editNewFiles[i]!, {
            maxDimension: 1600,
            quality: 0.8,
          });
          const ext = compressed.name.split(".").pop() ?? "jpg";
          const path = `${me}/${review.id}-edit-${Date.now()}-${i}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("review-photos")
            .upload(path, compressed, { upsert: true });
          if (upErr) throw upErr;
          const { error: imgErr } = await supabase
            .from("review_images")
            .insert({ review_id: review.id, image_url: path, position: startPosition + i });
          if (imgErr) throw imgErr;
        }
      }

      toast.success("Review updated");
      setEditOpen(false);
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteReview() {
    setDeleting(true);
    try {
      if (paths.length > 0) {
        // Best-effort: eigene Fotos dieser Bewertung im Storage entfernen.
        await supabase.storage.from("review-photos").remove(paths);
      }
      const { error } = await supabase.from("reviews").delete().eq("id", review.id);
      if (error) throw error;
      toast.success("Review deleted");
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not delete"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <Link to="/u/$username" params={{ username: profile?.username ?? "" }}>
          <UserAvatar
            avatarPath={profile?.avatar_url}
            name={profile?.display_name ?? profile?.username}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to="/u/$username"
            params={{ username: profile?.username ?? "" }}
            className="block truncate text-sm font-semibold"
          >
            {profile?.display_name || profile?.username}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            @{profile?.username} · {timeAgo(review.created_at)}
          </p>
        </div>
        <Stars value={review.rating} />
        {isOwn ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
                aria-label="More options"
              >
                <MoreVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  openEdit();
                }}
              >
                <Pencil size={16} className="mr-2" />
                Edit
              </DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="text-destructive"
                  >
                    <Trash2 size={16} className="mr-2" />
                    Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete review?</AlertDialogTitle>
                    <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={deleteReview}
                      disabled={deleting}
                      className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <ReportDialog reviewId={review.id} />
        )}
      </div>

      {showPlace && review.places ? (
        <Link
          to="/place/$placeId"
          params={{ placeId: review.places.id }}
          className="mt-3 flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2"
        >
          <MapPin size={16} className="text-primary" />
          <span className="truncate text-sm font-medium">{review.places.name}</span>
          <span className="truncate text-xs text-muted-foreground">{review.places.city}</span>
        </Link>
      ) : null}

      {review.text ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {review.text}
        </p>
      ) : null}

      {paths.length > 0 ? (
        /*
         * Foto-Komposition statt gleichfoermigem Raster: ein einzelnes Bild
         * bekommt ein Querformat (Orte sind selten quadratisch), zwei stehen
         * nebeneinander, drei bilden ein Mosaik mit einem grossen Bild links.
         */
        <div
          className={
            paths.length === 1
              ? "mt-3"
              : paths.length === 2
                ? "mt-3 grid grid-cols-2 gap-1.5"
                : "mt-3 grid aspect-3/2 grid-cols-2 grid-rows-2 gap-1.5"
          }
        >
          {(urls ?? paths.map(() => null)).slice(0, 3).map((url, i) => (
            <div
              key={i}
              className={`overflow-hidden bg-muted ${
                paths.length === 1
                  ? "aspect-4/3 rounded-2xl"
                  : paths.length === 2
                    ? "aspect-square rounded-2xl"
                    : i === 0
                      ? "row-span-2 size-full rounded-l-2xl"
                      : `size-full ${i === 1 ? "rounded-tr-2xl" : "rounded-br-2xl"}`
              }`}
            >
              {url ? (
                <img
                  src={url}
                  alt={`Photo ${i + 1} of ${review.places?.name ?? "place"}`}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>Edit review</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-2">
            <StarPicker value={editRating} onChange={setEditRating} />
          </div>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="How was it?"
            rows={5}
            className="rounded-2xl"
          />

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Photos (max. 3)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {editExistingImages.map((img) => (
                <div
                  key={img.id}
                  className="relative aspect-square overflow-hidden rounded-2xl bg-muted"
                >
                  {urlByImageId.get(img.id) ? (
                    <img
                      src={urlByImageId.get(img.id)!}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setEditExistingImages((prev) => prev.filter((p) => p.id !== img.id))
                    }
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {editNewFiles.map((_, i) => (
                <div
                  key={i}
                  className="relative aspect-square overflow-hidden rounded-2xl bg-muted"
                >
                  <img src={editNewPreviews[i]} alt="" className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setEditNewFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {totalEditPhotos < 3 ? (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-muted-foreground">
                  <ImagePlus size={22} />
                  <span className="text-[11px]">Add</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => onPickEditFiles(e.target.files)}
                  />
                </label>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={saveEdit} disabled={saving} className="w-full rounded-2xl">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

export const reviewSelect =
  "id, rating, text, created_at, user_id, profiles:profiles!reviews_user_id_fkey(username, display_name, avatar_url), places(id, name, city, category), review_images(id, image_url, position)";
