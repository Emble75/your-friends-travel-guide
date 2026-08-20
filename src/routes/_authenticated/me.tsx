import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, LogOut, Star, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/turi/AppHeader";
import { EmptyState } from "@/components/turi/EmptyState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "@/components/turi/ReviewCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { compressImage, getErrorMessage } from "@/lib/turi";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({
    meta: [
      { title: "Mein Profil – Turi" },
      { name: "description", content: "Dein Turi-Profil mit deinen Ortsbewertungen." },
      { property: "og:title", content: "Mein Profil – Turi" },
      { property: "og:description", content: "Dein Turi-Profil mit deinen Ortsbewertungen." },
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
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const { data, isLoading } = useQuery({
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
      return {
        profile,
        followers: followers ?? 0,
        following: following ?? 0,
        reviews: (reviews ?? []) as unknown as ReviewWithRelations[],
        pendingRequests,
      };
    },
  });

  async function respondToRequest(followerId: string, accept: boolean) {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user!.id;
    const { error } = accept
      ? await supabase
          .from("follows")
          .update({ status: "accepted" })
          .eq("follower_id", followerId)
          .eq("following_id", me)
      : await supabase
          .from("follows")
          .delete()
          .eq("follower_id", followerId)
          .eq("following_id", me);
    if (error) {
      toast.error(getErrorMessage(error, "Aktion fehlgeschlagen"));
      return;
    }
    toast.success(accept ? "Anfrage angenommen" : "Anfrage abgelehnt");
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
      toast.error(getErrorMessage(error, "Upload fehlgeschlagen"));
      return;
    }
    const { error: pErr } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", me);
    if (pErr) {
      toast.error(getErrorMessage(pErr, "Speichern fehlgeschlagen"));
      return;
    }
    toast.success("Profilbild aktualisiert");
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
      toast.error(getErrorMessage(error, "Speichern fehlgeschlagen"));
      return;
    }
    setEditing(false);
    toast.success("Profil gespeichert");
    queryClient.invalidateQueries();
  }

  if (isLoading || !data?.profile) {
    return (
      <>
        <AppHeader />
        <div className="app-shell py-4">
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      </>
    );
  }

  const { profile, reviews, pendingRequests } = data;

  return (
    <>
      <AppHeader
        action={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abmelden"
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
                {profile.is_private ? " · Privat" : ""}
              </p>
            </div>
          </div>

          {profile.bio && !editing ? (
            <p className="mt-3 text-sm text-foreground/90">{profile.bio}</p>
          ) : null}

          <div className="mt-4 flex gap-5 text-sm">
            <span>
              <strong>{reviews.length}</strong>{" "}
              <span className="text-muted-foreground">Bewertungen</span>
            </span>
            <span>
              <strong>{data.followers}</strong>{" "}
              <span className="text-muted-foreground">Follower</span>
            </span>
            <span>
              <strong>{data.following}</strong> <span className="text-muted-foreground">Folgt</span>
            </span>
          </div>

          {editing ? (
            <div className="mt-4 space-y-3">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Anzeigename"
                className="h-12 rounded-2xl"
              />
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Kurze Bio"
                rows={3}
                className="rounded-2xl"
              />
              <div className="flex items-center justify-between rounded-2xl border border-border p-3">
                <div>
                  <Label htmlFor="is-private" className="text-sm font-medium">
                    Privates Konto
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Neue Follower musst du erst bestätigen.
                  </p>
                </div>
                <Switch id="is-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveProfile} className="flex-1 rounded-2xl">
                  Speichern
                </Button>
                <Button
                  variant="secondary"
                  className="rounded-2xl"
                  onClick={() => setEditing(false)}
                >
                  Abbrechen
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
              Profil bearbeiten
            </Button>
          )}
        </section>

        {pendingRequests.length > 0 ? (
          <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
            <h2 className="text-xs uppercase tracking-wide text-muted-foreground">
              Follow-Anfragen ({pendingRequests.length})
            </h2>
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
                    aria-label="Annehmen"
                    onClick={() => respondToRequest(r.followerId, true)}
                  >
                    <UserCheck size={16} />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="rounded-full"
                    aria-label="Ablehnen"
                    onClick={() => respondToRequest(r.followerId, false)}
                  >
                    <UserX size={16} />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {reviews.length > 0 ? (
          reviews.map((r) => <ReviewCard key={r.id} review={r} />)
        ) : (
          <EmptyState
            icon={Star}
            title="Noch keine Bewertungen"
            text="Bewerte deinen ersten Ort – deine Freunde sehen ihn sofort."
            action={
              <Button asChild className="rounded-2xl">
                <Link to="/new">Ort bewerten</Link>
              </Button>
            }
          />
        )}
      </div>
    </>
  );
}
