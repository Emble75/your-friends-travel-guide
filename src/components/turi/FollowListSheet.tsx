import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserMinus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { getErrorMessage } from "@/lib/turi";
import { useMyNetwork } from "@/hooks/use-follow";
import { FollowButton } from "./FollowButton";
import { UserAvatar } from "./UserAvatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Person = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_private: boolean;
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
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const { data: network } = useMyNetwork();
  const me = network?.me;

  const { data, isLoading } = useQuery({
    queryKey: ["follow-list", userId, type],
    enabled: open,
    queryFn: async () => {
      if (type === "followers") {
        const { data: rows, error } = await supabase
          .from("follows")
          .select(
            "profiles!follows_follower_id_fkey(id, username, display_name, avatar_url, is_private)",
          )
          .eq("following_id", userId)
          .eq("status", "accepted");
        if (error) throw error;
        return (rows ?? []).map((r) => r.profiles as unknown as Person);
      }
      const { data: rows, error } = await supabase
        .from("follows")
        .select(
          "profiles!follows_following_id_fkey(id, username, display_name, avatar_url, is_private)",
        )
        .eq("follower_id", userId)
        .eq("status", "accepted");
      if (error) throw error;
      return (rows ?? []).map((r) => r.profiles as unknown as Person);
    },
  });

  async function removeFollower(personId: string) {
    if (busyIds.has(personId)) return;
    setBusyIds((prev) => new Set(prev).add(personId));

    const { data: deleted, error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", personId)
      .eq("following_id", userId)
      .select();

    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(personId);
      return next;
    });

    if (error) {
      toast.error(getErrorMessage(error, "Action failed"));
      return;
    }
    if (!deleted || deleted.length === 0) {
      // Kein Fehler, aber auch keine Zeile geloescht -- Berechtigungsproblem,
      // nicht als Erfolg werten.
      toast.error("Could not remove follower. Please try again.");
      return;
    }

    toast.success("Follower removed");
    queryClient.setQueryData(["follow-list", userId, "followers"], (old: Person[] | undefined) =>
      (old ?? []).filter((p) => p.id !== personId),
    );
    queryClient.invalidateQueries({ queryKey: ["follow-list", userId, "followers"] });
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
            data.map((p) => (
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
                    disabled={busyIds.has(p.id)}
                    onClick={() => removeFollower(p.id)}
                  >
                    <UserMinus size={14} />
                    <span className="ml-1">Remove</span>
                  </Button>
                ) : null}

                {type === "following" && p.id !== me ? (
                  <FollowButton
                    userId={p.id}
                    isPrivate={p.is_private}
                    initialStatus={network?.followStatusById.get(p.id)}
                    className="shrink-0 rounded-full"
                  />
                ) : null}
              </div>
            ))
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
