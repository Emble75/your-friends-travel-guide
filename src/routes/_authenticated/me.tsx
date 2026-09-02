import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Camera, Folder, LogOut, Star, Trash2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteOwnAccount } from "@/lib/account.functions";
import { AppHeader } from "@/components/turi/AppHeader";
import { EmptyState } from "@/components/turi/EmptyState";
import { ErrorState } from "@/components/turi/ErrorState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { FollowListSheet } from "@/components/turi/FollowListSheet";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "@/components/turi/ReviewCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { compressImage, getErrorMessage } from "@/lib/turi";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({
    meta: [
      { title: "My Profile – Turi" },
      { name: "description", content: "Your Turi profile with all your place reviews." },
      { property: "og:title", content: "My Profile – Turi" },
      { property: "og:description", content: "Your Turi profile with all your place reviews." },
    ],
  }),
  component: MePage,
});

type PendingRequest = {
  followerId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

function MePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteAccountFn = useServerFn(deleteOwnAccount);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [followListOpen, setFollowListOpen] = useState<"followers" | "following" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user!.id;
      const [
        { data: profile },
        { count: followers },
        { count: following },
        { data: reviews },
        { data: pending },
        { data: folders },
        { data: sharedFolders },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, bio, is_private")
          .eq("id", me)
          .maybeSingle(),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", me)
          .eq("status", "accepted"),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", me)
          .eq("status", "accepted"),
        supabase
          .from("reviews")
          .select(reviewSelect)
          .eq("user_id", me)
          .order("created_at", { ascending: false }),
        supabase
          .from("follows")
          .select(
            "follower_id, profiles!follows_follower_id_fkey(username, display_name, avatar_url)",
          )
          .eq("following_id", me)
          .eq("status", "pending"),
        supabase.from("trip_folders").select("id, name").eq("owner_id", me).order("name"),
        supabase
          .from("trip_folder_shares")
          .select(
            "trip_folders(id, name, owner_id, profiles:profiles!trip_folders_owner_id_fkey(username))",
          )
          .eq("shared_with_id", me),
      ]);
      const pendingRequests: PendingRequest[] = (pending ?? []).map((p) => {
        const requester = p.profiles as unknown as {
          username: string;
          display_name: string | null;
          avatar_url: string | null;
        };
        return {
          followerId: p.follower_id,
          username: requester.username,
          displayName: requester.display_name,
          avatarUrl: requester.avatar_url,
        };
      });
      type SharedFolder = {
        id: string;
        name: string;
        owner_id: string;
        profiles: { username: string } | null;
      };
      const sharedWithMe: SharedFolder[] = (sharedFolders ?? [])
        .map((s) => s.trip_folders as unknown as SharedFolder)
        .filter(Boolean);
      return {
        profile,
        followers: followers ?? 0,
        following: following ?? 0,
        reviews: (reviews ?? []) as unknown as ReviewWithRelations[],
        pendingRequests,
        folders: folders ?? [],
        sharedWithMe,
      };
    },
  });

  const { data: savedPlaces } = useQuery({
    queryKey: ["my-saved-places"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user!.id;
      const { data, error } = await supabase
        .from("saved_places")
        .select("place_id, places(id, name, city)")
        .eq("user_id", me)
        .order("created_at", { ascending: false });
      if (error) throw error;
      type Place = { id: string; name: string; city: string };
      return (data ?? []).map((s) => s.places as unknown as Place).filter(Boolean);
    },
  });

  async function respondToRequest(followerId: string, accept: boolean) {
    // Verhindert doppeltes Antworten bei schnellem Doppelklick, waehrend
    // die Anfrage noch unterwegs ist.
    if (respondingIds.has(followerId)) return;
    setRespondingIds((prev) => new Set(prev).add(followerId));

    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user!.id;
    const { data: affected, error } = accept
      ? await supabase
          .from("follows")
          .update({ status: "accepted" })
          .eq("follower_id", followerId)
          .eq("following_id", me)
          .select()
      : await supabase
          .from("follows")
          .delete()
          .eq("follower_id", followerId)
          .eq("following_id", me)
          .select();

    setRespondingIds((prev) => {
      const next = new Set(prev);
      next.delete(followerId);
      return next;
    });

    if (error) {
      toast.error(getErrorMessage(error, "Action failed"));
      return;
    }
    if (!affected || affected.length === 0) {
      // Kein Fehler, aber auch keine Zeile betroffen -- Berechtigungsproblem,
      // nicht als Erfolg werten.
      toast.error("Could not update the request. Please try again.");
      queryClient.invalidateQueries({ queryKey: ["me"] });
      return;
    }

    toast.success(accept ? "Request accepted" : "Request declined");
    // Optimistisch aus der Liste entfernen, statt auf den vollen Refetch zu warten.
    queryClient.setQueryData(
      ["me"],
      (old: { pendingRequests: PendingRequest[] } | undefined) =>
        old && {
          ...old,
          pendingRequests: old.pendingRequests.filter((r) => r.followerId !== followerId),
        },
    );
    queryClient.invalidateQueries();
  }

  async function uploadAvatar(rawFile: File) {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user!.id;
    const file = await compressImage(rawFile, { maxDimension: 512, quality: 0.85 });
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${me}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      toast.error(getErrorMessage(error, "Upload failed"));
      return;
    }
    const { error: pErr } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", me);
    if (pErr) {
      toast.error(getErrorMessage(pErr, "Could not save"));
      return;
    }
    toast.success("Profile photo updated");
    queryClient.invalidateQueries();
  }

  async function saveProfile() {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        is_private: isPrivate,
      })
      .eq("id", auth.user!.id);
    if (error) {
      toast.error(getErrorMessage(error, "Could not save"));
      return;
    }
    setEditing(false);
    toast.success("Profile saved");
    queryClient.invalidateQueries();
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await deleteAccountFn();
      await supabase.auth.signOut();
      queryClient.clear();
      toast.success("Account deleted");
      navigate({ to: "/auth" });
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not delete account"));
      setDeleting(false);
    }
  }

  // Ohne diese Verzweigung bliebe der Screen bei einem Ladefehler dauerhaft
  // im Skeleton haengen -- data waere nie gesetzt, isLoading nie wieder true.
  if (isError) {
    return (
      <>
        <AppHeader />
        <div className="app-shell py-4">
          <ErrorState text="We couldn't load your profile." onRetry={() => refetch()} />
        </div>
      </>
    );
  }

  if (isLoading || !data?.profile) {
    return (
      <>
        <AppHeader />
        <div className="app-shell space-y-4 py-4">
          <Skeleton className="h-40 rounded-3xl" />
          <Skeleton className="h-24 rounded-3xl" />
        </div>
      </>
    );
  }

  const { profile, reviews, pendingRequests, folders, sharedWithMe } = data;

  return (
    <>
      <AppHeader
        action={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={async () => {
              await supabase.auth.signOut();
              queryClient.clear();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut size={18} />
          </Button>
        }
      />
      <div className="app-shell space-y-4 py-4">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-4">
            <label className="relative cursor-pointer">
              <UserAvatar
                avatarPath={profile.avatar_url}
                name={profile.display_name ?? profile.username}
                className="size-16"
              />
              <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Camera size={14} />
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
              />
            </label>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">
                {profile.display_name || profile.username}
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                @{profile.username}
                {profile.is_private ? " · Private" : ""}
              </p>
            </div>
          </div>

          {profile.bio && !editing ? (
            <p className="mt-3 text-sm text-foreground/90">{profile.bio}</p>
          ) : null}

          <div className="mt-4 flex gap-5 text-sm">
            <span>
              <strong>{reviews.length}</strong>{" "}
              <span className="text-muted-foreground">Reviews</span>
            </span>
            <button
              type="button"
              onClick={() => setFollowListOpen("followers")}
              className="text-left"
            >
              <strong>{data.followers}</strong>{" "}
              <span className="text-muted-foreground">Followers</span>
            </button>
            <button
              type="button"
              onClick={() => setFollowListOpen("following")}
              className="text-left"
            >
              <strong>{data.following}</strong>{" "}
              <span className="text-muted-foreground">Following</span>
            </button>
          </div>

          {editing ? (
            <div className="mt-4 space-y-3">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="h-12 rounded-2xl"
              />
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Short bio"
                rows={3}
                className="rounded-2xl"
              />
              <div className="flex items-center justify-between rounded-2xl border border-border p-3">
                <div>
                  <Label htmlFor="is-private" className="text-sm font-medium">
                    Private account
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    New followers must be approved first.
                  </p>
                </div>
                <Switch id="is-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveProfile} className="flex-1 rounded-2xl">
                  Save
                </Button>
                <Button
                  variant="secondary"
                  className="rounded-2xl"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              className="mt-4 h-11 w-full rounded-2xl"
              onClick={() => {
                setDisplayName(profile.display_name ?? "");
                setBio(profile.bio ?? "");
                setIsPrivate(profile.is_private);
                setEditing(true);
              }}
            >
              Edit profile
            </Button>
          )}
        </section>

        {pendingRequests.length > 0 ? (
          <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
            <h2 className="turi-eyebrow">Follow requests ({pendingRequests.length})</h2>
            <ul className="mt-3 space-y-3">
              {pendingRequests.map((r) => (
                <li key={r.followerId} className="flex items-center gap-3">
                  <UserAvatar avatarPath={r.avatarUrl} name={r.displayName ?? r.username} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {r.displayName || r.username}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{r.username}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    className="rounded-full"
                    aria-label="Accept"
                    disabled={respondingIds.has(r.followerId)}
                    onClick={() => respondToRequest(r.followerId, true)}
                  >
                    <UserCheck size={16} />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="rounded-full"
                    aria-label="Decline"
                    disabled={respondingIds.has(r.followerId)}
                    onClick={() => respondToRequest(r.followerId, false)}
                  >
                    <UserX size={16} />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {folders.length > 0 || sharedWithMe.length > 0 ? (
          <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
            <h2 className="turi-eyebrow">Folders</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {folders.map((f) => (
                <Link
                  key={f.id}
                  to="/folder/$folderId"
                  params={{ folderId: f.id }}
                  className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-sm font-medium"
                >
                  <Folder size={14} /> {f.name}
                </Link>
              ))}
              {sharedWithMe.map((f) => (
                <Link
                  key={f.id}
                  to="/folder/$folderId"
                  params={{ folderId: f.id }}
                  className="flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-2 text-sm font-medium text-primary"
                >
                  <Folder size={14} /> {f.name}
                  <span className="text-xs text-muted-foreground">
                    from @{f.profiles?.username}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {savedPlaces && savedPlaces.length > 0 ? (
          <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
            <h2 className="turi-eyebrow">Want to go</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {savedPlaces.map((p) => (
                <Link
                  key={p.id}
                  to="/place/$placeId"
                  params={{ placeId: p.id }}
                  className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-sm font-medium"
                >
                  <Bookmark size={14} /> {p.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {reviews.length > 0 ? (
          reviews.map((r) => <ReviewCard key={r.id} review={r} />)
        ) : (
          <EmptyState
            icon={Star}
            title="No reviews yet"
            text="Review your first place — your friends will see it right away."
            action={
              <Button asChild className="rounded-2xl">
                <Link to="/new">Review a place</Link>
              </Button>
            }
          />
        )}

        <section className="rounded-3xl border border-destructive/30 bg-card p-4 shadow-card">
          <h2 className="text-sm font-semibold text-destructive">Delete account</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Permanently deletes your account and all your reviews, photos, and follows. This can't
            be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="mt-3 rounded-2xl">
                <Trash2 size={16} className="mr-2" /> Permanently delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-3xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Really delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  All your reviews, photos, followers, and requests will be permanently deleted.
                  This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteAccount}
                  disabled={deleting}
                  className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Deleting…" : "Permanently delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </div>

      <FollowListSheet
        userId={profile.id}
        type={followListOpen ?? "followers"}
        open={followListOpen !== null}
        onOpenChange={(open) => !open && setFollowListOpen(null)}
      />
    </>
  );
}
