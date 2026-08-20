import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "./UserAvatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

type Person = { username: string; display_name: string | null; avatar_url: string | null };

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
  const { data, isLoading } = useQuery({
    queryKey: ["follow-list", userId, type],
    enabled: open,
    queryFn: async () => {
      if (type === "followers") {
        const { data: rows, error } = await supabase
          .from("follows")
          .select("profiles!follows_follower_id_fkey(username, display_name, avatar_url)")
          .eq("following_id", userId)
          .eq("status", "accepted");
        if (error) throw error;
        return (rows ?? []).map((r) => r.profiles as unknown as Person);
      }
      const { data: rows, error } = await supabase
        .from("follows")
        .select("profiles!follows_following_id_fkey(username, display_name, avatar_url)")
        .eq("follower_id", userId)
        .eq("status", "accepted");
      if (error) throw error;
      return (rows ?? []).map((r) => r.profiles as unknown as Person);
    },
  });

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
              <Link
                key={p.username}
                to="/u/$username"
                params={{ username: p.username }}
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-3 rounded-2xl p-2 hover:bg-secondary"
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
