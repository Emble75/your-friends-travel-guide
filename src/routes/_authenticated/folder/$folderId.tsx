import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Folder, Share2, Star, Trash2, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/turi";
import { AppHeader } from "@/components/turi/AppHeader";
import { EmptyState } from "@/components/turi/EmptyState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "@/components/turi/ReviewCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/folder/$folderId")({
  head: () => ({
    meta: [{ title: "Ordner – Turi" }],
  }),
  component: FolderPage,
});

function FolderPage() {
  const { folderId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [shareOpen, setShareOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["trip-folder", folderId],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      const [{ data: folder, error }, { data: reviews }] = await Promise.all([
        supabase.from("trip_folders").select("id, name, owner_id").eq("id", folderId).maybeSingle(),
        supabase
          .from("reviews")
          .select(reviewSelect)
          .eq("trip_folder_id", folderId)
          .order("created_at", { ascending: false }),
      ]);
      if (error) throw error;
      return {
        folder,
        isOwn: folder?.owner_id === me,
        reviews: (reviews ?? []) as unknown as ReviewWithRelations[],
      };
    },
  });

  async function deleteFolder() {
    const { error } = await supabase.from("trip_folders").delete().eq("id", folderId);
    if (error) {
      toast.error(getErrorMessage(error, "Löschen fehlgeschlagen"));
      return;
    }
    toast.success("Ordner gelöscht");
    queryClient.invalidateQueries();
    navigate({ to: "/me" });
  }

  if (isLoading) {
    return (
      <>
        <AppHeader title="Ordner" />
        <div className="app-shell py-4">
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      </>
    );
  }

  if (!data?.folder) {
    return (
      <>
        <AppHeader title="Ordner" />
        <div className="app-shell py-4">
          <EmptyState
            icon={Folder}
            title="Ordner nicht gefunden"
            text="Entweder existiert er nicht mehr, oder er wurde nicht mit dir geteilt."
          />
        </div>
      </>
    );
  }

  const { folder, isOwn, reviews } = data;

  return (
    <>
      <AppHeader title={folder.name} />
      <div className="app-shell space-y-4 py-4">
        <Link to="/me" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft size={14} /> Zurück zum Profil
        </Link>

        {isOwn ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 rounded-2xl"
              onClick={() => setShareOpen(true)}
            >
              <Share2 size={16} className="mr-2" /> Teilen
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" className="rounded-2xl">
                  <Trash2 size={16} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Ordner löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Die Bewertungen selbst bleiben erhalten, verlieren aber ihre Ordner-Zuordnung
                    und werden nicht mehr geteilt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-2xl">Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={deleteFolder}
                    className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}

        {reviews.length > 0 ? (
          reviews.map((r) => <ReviewCard key={r.id} review={r} />)
        ) : (
          <EmptyState
            icon={Star}
            title="Noch leer"
            text="Hier erscheinen Bewertungen aus diesem Ordner."
          />
        )}
      </div>

      {isOwn ? (
        <ShareDialog folderId={folderId} open={shareOpen} onOpenChange={setShareOpen} />
      ) : null}
    </>
  );
}

function ShareDialog({
  folderId,
  open,
  onOpenChange,
}: {
  folderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");

  const { data } = useQuery({
    queryKey: ["folder-share-candidates", folderId, term],
    enabled: open,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user!.id;
      // Kandidaten: das eigene Netzwerk (wem ich folge + wer mir folgt),
      // damit man nicht zufaellig Fremde suchen kann.
      const [{ data: iFollow }, { data: followMe }, { data: shares }] = await Promise.all([
        supabase
          .from("follows")
          .select("profiles!follows_following_id_fkey(id, username, display_name, avatar_url)")
          .eq("follower_id", me)
          .eq("status", "accepted"),
        supabase
          .from("follows")
          .select("profiles!follows_follower_id_fkey(id, username, display_name, avatar_url)")
          .eq("following_id", me)
          .eq("status", "accepted"),
        supabase.from("trip_folder_shares").select("shared_with_id").eq("folder_id", folderId),
      ]);
      type Person = {
        id: string;
        username: string;
        display_name: string | null;
        avatar_url: string | null;
      };
      const byId = new Map<string, Person>();
      for (const row of [...(iFollow ?? []), ...(followMe ?? [])]) {
        const p = row.profiles as unknown as Person;
        if (p) byId.set(p.id, p);
      }
      const sharedIds = new Set((shares ?? []).map((s) => s.shared_with_id));
      const t = term.trim().toLowerCase();
      return Array.from(byId.values())
        .filter(
          (p) =>
            !t || p.username.toLowerCase().includes(t) || p.display_name?.toLowerCase().includes(t),
        )
        .map((p) => ({ ...p, shared: sharedIds.has(p.id) }));
    },
  });

  async function toggleShare(personId: string, shared: boolean) {
    const { error } = shared
      ? await supabase
          .from("trip_folder_shares")
          .delete()
          .eq("folder_id", folderId)
          .eq("shared_with_id", personId)
      : await supabase
          .from("trip_folder_shares")
          .insert({ folder_id: folderId, shared_with_id: personId });
    if (error) {
      toast.error(getErrorMessage(error, "Aktion fehlgeschlagen"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["folder-share-candidates", folderId] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Ordner teilen</DialogTitle>
        </DialogHeader>
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Person suchen"
          className="h-11 rounded-2xl"
        />
        <div className="max-h-[45vh] space-y-1 overflow-y-auto">
          {(data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Niemand gefunden in deinem Netzwerk.
            </p>
          ) : (
            (data ?? []).map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl p-2">
                <UserAvatar avatarPath={p.avatar_url} name={p.display_name ?? p.username} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {p.display_name || p.username}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{p.username}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={p.shared ? "secondary" : "default"}
                  className="rounded-full"
                  onClick={() => toggleShare(p.id, p.shared)}
                >
                  {p.shared ? <UserMinus size={14} /> : <UserPlus size={14} />}
                  <span className="ml-1">{p.shared ? "Entfernen" : "Teilen"}</span>
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
