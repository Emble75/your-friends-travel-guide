import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/turi/AppHeader";
import { EmptyState } from "@/components/turi/EmptyState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "@/components/turi/ReviewCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/u/$username")({
  head: () => ({
    meta: [
      { title: "Profil – Turi" },
      { name: "description", content: "Bewertungen und Orte dieser Person auf Turi." },
      { property: "og:title", content: "Profil – Turi" },
      { property: "og:description", content: "Bewertungen und Orte dieser Person auf Turi." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { username } = Route.useParams();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["profile", username],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id ?? "";
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      if (!profile) return null;

      const [{ data: follow }, { count: followers }, { count: following }, { data: reviews }] =
        await Promise.all([
          supabase
            .from("follows")
            .select("follower_id")
            .eq("follower_id", me)
            .eq("following_id", profile.id)
            .maybeSingle(),
          supabase
            .from("follows")
            .select("*", { count: "exact", head: true })
            .eq("following_id", profile.id),
          supabase
            .from("follows")
            .select("*", { count: "exact", head: true })
            .eq("follower_id", profile.id),
          supabase
            .from("reviews")
            .select(reviewSelect)
            .eq("user_id", profile.id)
            .order("created_at", { ascending: false }),
        ]);

      return {
        profile,
        isMe: profile.id === me,
        isFollowing: !!follow,
        followers: followers ?? 0,
        following: following ?? 0,
        reviews: (reviews ?? []) as unknown as ReviewWithRelations[],
      };
    },
  });

  async function toggleFollow() {
    if (!data) return;
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) return;
    const { error } = data.isFollowing
      ? await supabase
          .from("follows")
          .delete()
          .eq("follower_id", me)
          .eq("following_id", data.profile.id)
      : await supabase.from("follows").insert({ follower_id: me, following_id: data.profile.id });
    if (error) toast.error(error.message);
    else queryClient.invalidateQueries();
  }

  if (isLoading) {
    return (
      <>
        <AppHeader title="Profil" />
        <div className="app-shell py-4">
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AppHeader title="Profil" />
        <div className="app-shell py-4">
          <EmptyState icon={UserPlus} title="Profil nicht gefunden" text={`@${username} gibt es nicht.`} />
        </div>
      </>
    );
  }

  const { profile, reviews } = data;

  return (
    <>
      <AppHeader title={`@${profile.username}`} />
      <div className="app-shell space-y-4 py-4">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
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
          </div>
          {profile.bio ? <p className="mt-3 text-sm text-foreground/90">{profile.bio}</p> : null}
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
          {!data.isMe ? (
            <Button
              onClick={toggleFollow}
              variant={data.isFollowing ? "secondary" : "default"}
              className="mt-4 h-11 w-full rounded-2xl"
            >
              {data.isFollowing ? <UserCheck size={18} /> : <UserPlus size={18} />}
              <span className="ml-1">{data.isFollowing ? "Du folgst" : "Folgen"}</span>
            </Button>
          ) : null}
        </section>

        {reviews.length > 0 ? (
          reviews.map((r) => <ReviewCard key={r.id} review={r} />)
        ) : (
          <EmptyState
            icon={Star}
            title={data.isFollowing || data.isMe ? "Noch keine Bewertungen" : "Folge, um zu sehen"}
            text={
              data.isFollowing || data.isMe
                ? "Hier erscheinen alle bewerteten Orte."
                : `Bewertungen von @${profile.username} siehst du, sobald du folgst.`
            }
          />
        )}
      </div>
    </>
  );
}
