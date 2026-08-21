import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Clock, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/turi";
import { UserAvatar } from "./UserAvatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Person = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export function FollowListSheet({
  userId,
  type,
  open,
  onOpenChange,
}: {
  userId: string;
  type: "followers" | "following";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: 5 * 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["follow-list", userId, type],
    enabled: open,
    queryFn: async () => {
      if (type === "followers") {
        const { data: rows, error } = await supabase
          .from("follows")
          .select("profiles!follows_follower_id_fkey(id, username, display_name, avatar_url)")
          .eq("following_id", userId)
          .eq("status", "accepted");
        if (error) throw error;
        return (rows ?? []).map((r) => r.profiles as unknown as Person);
      }
      const { data: rows, error } = await supabase
        .from("follows")
        .select("profiles!follows_following_id_fkey(id, username, display_name, avatar_url)")
        .eq("follower_id", userId)
        .eq("status", "accepted");
      if (error) throw error;
      return (rows ?? []).map((r) => r.profiles as unknown as Person);
    },
  });

  // Fuer die "Following"-Liste: mein EIGENER Folge-Status gegenueber jeder
  // gelisteten Person -- unabhaengig davon, wessen Liste das gerade ist
  // (genau wie in der Suche).
  const { data: myFollowStatus } = useQuery({
    queryKey: ["my-follow-status-map"],
    enabled: open && type === "following" && !!me,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("follows")
        .select("following_id, status")
        .eq("follower_id", me!);
      return new Map((rows ?? []).map((r) => [r.following_id, r.status]));
    },
  });

  async function removeFollower(personId: string) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", personId)
      .eq("following_id", userId);
    if (error) {
      toast.error(getErrorMessage(error, "Action failed"));
      return;
    }
    toast.success("Follower removed");
    queryClient.invalidateQueries({ queryKey: ["follow-list", userId, "followers"] });
  }

  async function toggleFollow(personId: string, status: "pending" | "accepted" | undefined) {
    if (!me) return;
    const { error } = status
      ? await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", personId)
      : await supabase.from("follows").insert({ follower_id: me, following_id: personId });
    if (error) {
      toast.error(getErrorMessage(error, "Action failed"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["my-follow-status-map"] });
    queryClient.invalidateQueries({ queryKey: ["my-network"] });
    queryClient.invalidateQueries({ queryKey: ["people"] });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[75vh] rounded-t-3xl border-0 pb-8">
        <SheetHeader className="text-left">
          <SheetTitle>{type === "followers" ? "Followers" : "Following"}</SheetTitle>
        </SheetHeader>
        <div className="mt-2 max-h-[55vh] space-y-1 overflow-y-auto px-1">
          {isLoading ? (
            <>
              <Skeleton className="h-14 rounded-2xl" />
              <Skeleton className="h-14 rounded-2xl" />
            </>
          ) : data && data.length > 0 ? (
            data.map((p) => {
              const status = myFollowStatus?.get(p.id) as "pending" | "accepted" | undefined;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-2xl p-2 hover:bg-secondary"
                >
                  <Link
                    to="/u/$username"
                    params={{ username: p.username }}
                    onClick={() => onOpenChange(false)}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <UserAvatar avatarPath={p.avatar_url} name={p.display_name ?? p.username} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {p.display_name || p.username}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{p.username}
                      </span>
                    </span>
                  </Link>

                  {type === "followers" && userId === me ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0 rounded-full"
                      onClick={() => removeFollower(p.id)}
                    >
                      <UserMinus size={14} />
                      <span className="ml-1">Remove</span>
                    </Button>
                  ) : null}

                  {type === "following" && p.id !== me ? (
                    <Button
                      size="sm"
                      variant={status ? "secondary" : "default"}
                      className="shrink-0 rounded-full"
                      onClick={() => toggleFollow(p.id, status)}
                    >
                      {status === "accepted" ? (
                        <UserCheck size={14} />
                      ) : status === "pending" ? (
                        <Clock size={14} />
                      ) : (
                        <UserPlus size={14} />
                      )}
                      <span className="ml-1">
                        {status === "accepted"
                          ? "Following"
                          : status === "pending"
                            ? "Requested"
                            : "Follow"}
                      </span>
                    </Button>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {type === "followers" ? "No followers yet." : "Not following anyone yet."}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
