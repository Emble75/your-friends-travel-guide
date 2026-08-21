import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Stars, StarPicker } from "./Stars";
import { UserAvatar } from "./UserAvatar";
import { ReportDialog } from "./ReportDialog";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage, signedUrls, timeAgo } from "@/lib/turi";
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
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: me } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: 5 * 60_000,
  });
  const isOwn = me === review.user_id;

  const paths = review.review_images
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((i) => i.image_url);

  const { data: urls } = useQuery({
    queryKey: ["review-images", review.id, paths.join(",")],
    queryFn: () => signedUrls("review-photos", paths),
    enabled: paths.length > 0,
  });

  const profile = review.profiles;

  async function saveEdit() {
    if (editRating < 1) {
      toast.error("Please give a star rating");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("reviews")
      .update({ rating: editRating, text: editText.trim() || null })
      .eq("id", review.id);
    setSaving(false);
    if (error) {
      toast.error(getErrorMessage(error, "Could not save"));
      return;
    }
    toast.success("Review updated");
    setEditOpen(false);
    queryClient.invalidateQueries();
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
                  setEditRating(review.rating);
                  setEditText(review.text ?? "");
                  setEditOpen(true);
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
        <div
          className="mt-3 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.min(paths.length, 3)}, minmax(0,1fr))` }}
        >
          {(urls ?? paths.map(() => null)).map((url, i) => (
            <div key={i} className="aspect-square overflow-hidden rounded-2xl bg-muted">
              {url ? (
                <img
                  src={url}
                  alt={`Photo ${i + 1} of ${review.places?.name ?? "place"}`}
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-3xl">
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
