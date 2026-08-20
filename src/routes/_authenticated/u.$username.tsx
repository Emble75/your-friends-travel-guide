import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Flag,
  Lock,
  ShieldOff,
  Star,
  UserCheck,
  UserPlus,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/turi";
import { AppHeader } from "@/components/turi/AppHeader";
import { EmptyState } from "@/components/turi/EmptyState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { ReportDialog } from "@/components/turi/ReportDialog";
import { FollowListSheet } from "@/components/turi/FollowListSheet";
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
  const [reportOpen, setReportOpen] = useState(false);
  const [followListOpen, setFollowListOpen] = useState<"followers" | "following" | null>(null);

  const { data, isLoading } = useQuery({
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

  async function toggleFollow() {
    if (!data) return;
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) return;
    const { error } = data.followStatus
      ? await supabase
          .from("follows")
          .delete()
          .eq("follower_id", me)
          .eq("following_id", data.profile.id)
      : await supabase.from("follows").insert({ follower_id: me, following_id: data.profile.id });
    if (error) toast.error(getErrorMessage(error, "Aktion fehlgeschlagen"));
    else queryClient.invalidateQueries();
  }

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
      if (error) toast.error(getErrorMessage(error, "Aktion fehlgeschlagen"));
      else {
        toast.success(`@${data.profile.username} entblockt`);
        queryClient.invalidateQueries();
      }
      return;
    }

    const { error } = await supabase
      .from("blocks")
      .insert({ blocker_id: me, blocked_id: data.profile.id });
    if (error) {
      toast.error(getErrorMessage(error, "Aktion fehlgeschlagen"));
      return;
    }
    // Gegenseitige Follows aufheben, damit die Inhalte auch wirklich verschwinden.
    await supabase
      .from("follows")
      .delete()
      .or(
        `and(follower_id.eq.${me},following_id.eq.${data.profile.id}),and(follower_id.eq.${data.profile.id},following_id.eq.${me})`,
      );
    toast.success(`@${data.profile.username} blockiert`);
    queryClient.invalidateQueries();
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
          <EmptyState
            icon={UserPlus}
            title="Profil nicht gefunden"
            text={`@${username} gibt es nicht.`}
          />
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
            {!data.isMe ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
                    aria-label="Weitere Optionen"
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
                    Melden
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
                            ? `@${profile.username} entblockieren?`
                            : `@${profile.username} blockieren?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {data.isBlocked
                            ? "Ihr könnt euch danach wieder gegenseitig sehen und folgen."
                            : "Ihr könnt euch danach gegenseitig keine Bewertungen mehr sehen und folgt euch nicht mehr."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-2xl">Abbrechen</AlertDialogCancel>
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
              <span className="text-muted-foreground">Bewertungen</span>
            </span>
            <button
              type="button"
              onClick={() => setFollowListOpen("followers")}
              className="text-left"
            >
              <strong>{data.followers}</strong>{" "}
              <span className="text-muted-foreground">Follower</span>
            </button>
            <button
              type="button"
              onClick={() => setFollowListOpen("following")}
              className="text-left"
            >
              <strong>{data.following}</strong> <span className="text-muted-foreground">Folgt</span>
            </button>
          </div>
          {!data.isMe ? (
            <Button
              onClick={toggleFollow}
              variant={data.followStatus ? "secondary" : "default"}
              className="mt-4 h-11 w-full rounded-2xl"
            >
              {data.followStatus === "accepted" ? (
                <UserCheck size={18} />
              ) : data.followStatus === "pending" ? (
                <Clock size={18} />
              ) : (
                <UserPlus size={18} />
              )}
              <span className="ml-1">
                {data.followStatus === "accepted"
                  ? "Du folgst"
                  : data.followStatus === "pending"
                    ? "Angefragt"
                    : profile.is_private
                      ? "Anfrage senden"
                      : "Folgen"}
              </span>
            </Button>
          ) : null}
        </section>

        {profile.is_private && data.followStatus !== "accepted" && !data.isMe ? (
          <EmptyState
            icon={Lock}
            title="Privates Konto"
            text={
              data.followStatus === "pending"
                ? "Deine Anfrage wartet auf Bestätigung."
                : `Folge @${profile.username}, um Bewertungen zu sehen.`
            }
          />
        ) : reviews.length > 0 ? (
          reviews.map((r) => <ReviewCard key={r.id} review={r} />)
        ) : (
          <EmptyState
            icon={Star}
            title="Noch keine Bewertungen"
            text="Hier erscheinen alle bewerteten Orte."
          />
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
