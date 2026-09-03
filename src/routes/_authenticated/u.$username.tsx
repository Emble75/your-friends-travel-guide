import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Flag,
  Lock,
  Map as MapIcon,
  Rows3,
  ShieldOff,
  Star,
  UserCheck,
  UserPlus,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { getErrorMessage } from "@/lib/turi";
import type { FollowStatus } from "@/hooks/use-follow";
import { AppHeader } from "@/components/turi/AppHeader";
import { FollowButton } from "@/components/turi/FollowButton";
import { EmptyState } from "@/components/turi/EmptyState";
import { ErrorState } from "@/components/turi/ErrorState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { ReportDialog } from "@/components/turi/ReportDialog";
import { FollowListSheet } from "@/components/turi/FollowListSheet";
import { PlacesMiniMap, type MiniMapPlace } from "@/components/turi/PlacesMiniMap";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "@/components/turi/ReviewCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/_authenticated/u/$username")({
  head: () => ({
    meta: [
      { title: "Profile – Turi" },
      { name: "description", content: "This person's reviews and places on Turi." },
      { property: "og:title", content: "Profile – Turi" },
      { property: "og:description", content: "This person's reviews and places on Turi." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { username } = Route.useParams();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [followListOpen, setFollowListOpen] = useState<"followers" | "following" | null>(null);
  const [view, setView] = useState<"feed" | "map">("feed");
  // Nach einem Klick gilt der vom Button bestaetigte Status, sonst der
  // aus der Profil-Query geladene.
  const [clickedStatus, setClickedStatus] = useState<{ value: FollowStatus } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["profile", username],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id ?? "";
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, is_private")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      if (!profile) return null;

      const [
        { data: follow },
        { count: followers },
        { count: following },
        { data: reviews },
        { data: block },
      ] = await Promise.all([
        supabase
          .from("follows")
          .select("status")
          .eq("follower_id", me)
          .eq("following_id", profile.id)
          .maybeSingle(),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", profile.id)
          .eq("status", "accepted"),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", profile.id)
          .eq("status", "accepted"),
        supabase
          .from("reviews")
          .select(reviewSelect)
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("blocks")
          .select("blocked_id")
          .eq("blocker_id", me)
          .eq("blocked_id", profile.id)
          .maybeSingle(),
      ]);

      return {
        profile,
        isMe: profile.id === me,
        followStatus: follow?.status as "pending" | "accepted" | undefined,
        isBlocked: !!block,
        followers: followers ?? 0,
        following: following ?? 0,
        reviews: (reviews ?? []) as unknown as ReviewWithRelations[],
      };
    },
  });

  async function toggleBlock() {
    if (!data) return;
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) return;

    if (data.isBlocked) {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", me)
        .eq("blocked_id", data.profile.id);
      if (error) toast.error(getErrorMessage(error, "Action failed"));
      else {
        toast.success(`@${data.profile.username} unblocked`);
        queryClient.invalidateQueries();
      }
      return;
    }

    const { error } = await supabase
      .from("blocks")
      .insert({ blocker_id: me, blocked_id: data.profile.id });
    if (error) {
      toast.error(getErrorMessage(error, "Action failed"));
      return;
    }
    // Gegenseitige Follows aufheben, damit die Inhalte auch wirklich verschwinden.
    await supabase
      .from("follows")
      .delete()
      .or(
        `and(follower_id.eq.${me},following_id.eq.${data.profile.id}),and(follower_id.eq.${data.profile.id},following_id.eq.${me})`,
      );
    toast.success(`@${data.profile.username} blocked`);
    queryClient.invalidateQueries();
  }

  const followStatus = clickedStatus ? clickedStatus.value : data?.followStatus;

  const canSeeReviews = data
    ? !data.profile.is_private || followStatus === "accepted" || data.isMe
    : false;

  const { data: mapPlaces } = useQuery({
    queryKey: ["profile-map-places", data?.profile.id],
    enabled: view === "map" && !!data?.profile && canSeeReviews,
    queryFn: async () => {
      // RLS auf reviews filtert automatisch auf das, was ich bei dieser
      // Person sehen darf (gleiche Sichtbarkeit wie im Feed).
      const { data: rows } = await supabase
        .from("reviews")
        .select("place_id, rating, places(id, name, lat, lng, category)")
        .eq("user_id", data!.profile.id);
      const byId = new Map<string, { name: string; lat: number; lng: number }>();
      const sums = new Map<string, { total: number; count: number }>();
      for (const r of rows ?? []) {
        const p = r.places as unknown as {
          id: string;
          name: string;
          lat: number | null;
          lng: number | null;
        } | null;
        if (p && p.lat != null && p.lng != null) {
          byId.set(p.id, { name: p.name, lat: p.lat, lng: p.lng });
          const entry = sums.get(p.id) ?? { total: 0, count: 0 };
          entry.total += r.rating;
          entry.count += 1;
          sums.set(p.id, entry);
        }
      }
      const result: MiniMapPlace[] = [];
      for (const [id, place] of byId) {
        const { total, count } = sums.get(id)!;
        result.push({ id, ...place, rating: total / count });
      }
      return result;
    },
  });

  if (isLoading) {
    return (
      <>
        <AppHeader title="Profile" showBack fallbackTo="/feed" />
        <div className="app-shell py-4">
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <AppHeader title="Profile" showBack fallbackTo="/feed" />
        <div className="app-shell py-4">
          <ErrorState text="We couldn't load this profile." onRetry={() => refetch()} />
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AppHeader title="Profile" showBack fallbackTo="/feed" />
        <div className="app-shell py-4">
          <EmptyState
            icon={UserPlus}
            title="Profile not found"
            text={`@${username} doesn't exist.`}
          />
        </div>
      </>
    );
  }

  const { profile, reviews } = data;

  return (
    <>
      <AppHeader title={`@${profile.username}`} showBack fallbackTo="/feed" />
      <div className="app-shell space-y-4 py-4">
        <section className="turi-card p-5">
          <div className="flex items-center gap-4">
            <UserAvatar
              avatarPath={profile.avatar_url}
              name={profile.display_name ?? profile.username}
              className="size-16"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">
                {profile.display_name || profile.username}
              </h1>
              <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
            </div>
            {!data.isMe ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="turi-tap flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
                    aria-label="More options"
                  >
                    <MoreVertical size={18} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl">
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setReportOpen(true);
                    }}
                  >
                    <Flag size={16} className="mr-2" />
                    Report
                  </DropdownMenuItem>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        onSelect={(e) => e.preventDefault()}
                        className="text-destructive"
                      >
                        <ShieldOff size={16} className="mr-2" />
                        {data.isBlocked ? "Entblockieren" : "Blockieren"}
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-3xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {data.isBlocked
                            ? `Unblock @${profile.username}?`
                            : `Block @${profile.username}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {data.isBlocked
                            ? "You'll be able to see and follow each other again afterward."
                            : "You won't be able to see each other's reviews or follow each other anymore."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={toggleBlock} className="rounded-2xl">
                          {data.isBlocked ? "Entblockieren" : "Blockieren"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          {!data.isMe ? (
            <ReportDialog
              reportedUserId={profile.id}
              trigger={null}
              open={reportOpen}
              onOpenChange={setReportOpen}
            />
          ) : null}
          {profile.bio ? <p className="mt-3 text-sm text-foreground/90">{profile.bio}</p> : null}
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
          {!data.isMe ? (
            <FollowButton
              userId={profile.id}
              isPrivate={profile.is_private}
              initialStatus={data.followStatus}
              size="default"
              className="mt-4 h-11 w-full rounded-2xl"
              privateLabel="Send request"
              onChanged={(value) => setClickedStatus({ value })}
            />
          ) : null}
        </section>

        {profile.is_private && followStatus !== "accepted" && !data.isMe ? (
          <EmptyState
            icon={Lock}
            title="Private account"
            text={
              followStatus === "pending"
                ? "Your request is waiting for approval."
                : `Follow @${profile.username} to see reviews.`
            }
          />
        ) : (
          <>
            <div className="flex gap-1 rounded-2xl bg-secondary p-1">
              <button
                type="button"
                onClick={() => setView("feed")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors ${
                  view === "feed" ? "bg-card shadow-card" : "text-muted-foreground"
                }`}
              >
                <Rows3 size={15} /> Feed
              </button>
              <button
                type="button"
                onClick={() => setView("map")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors ${
                  view === "map" ? "bg-card shadow-card" : "text-muted-foreground"
                }`}
              >
                <MapIcon size={15} /> Map
              </button>
            </div>

            {view === "map" ? (
              <div className="h-[60vh] overflow-hidden rounded-3xl border border-border shadow-card">
                <PlacesMiniMap places={mapPlaces ?? []} />
              </div>
            ) : reviews.length > 0 ? (
              reviews.map((r) => <ReviewCard key={r.id} review={r} />)
            ) : (
              <EmptyState
                icon={Star}
                title="No reviews yet"
                text="All reviewed places will appear here."
              />
            )}
          </>
        )}
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
