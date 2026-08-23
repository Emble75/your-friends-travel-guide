import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, UserPlus, UserCheck, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/turi";
import { AppHeader } from "@/components/turi/AppHeader";
import { EmptyState } from "@/components/turi/EmptyState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const Route = createFileRoute("/_authenticated/explore")({
  head: () => ({
    meta: [
      { title: "Search – Turi" },
      { name: "description", content: "Find friends on Turi." },
      { property: "og:title", content: "Search – Turi" },
      { property: "og:description", content: "Find friends on Turi." },
    ],
  }),
  component: ExplorePage,
});

function ExplorePage() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const term = debouncedQ.trim();

  return (
    <>
      <AppHeader />
      <div className="app-shell space-y-4 py-4">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search @username"
            className="h-12 rounded-2xl pl-11"
          />
        </div>

        <PeopleResults term={term} />
      </div>
    </>
  );
}

function PeopleResults({ term }: { term: string }) {
  const queryClient = useQueryClient();

  // Eigener Netzwerk-Status (Follows + Blocks) -- unabhaengig vom Suchbegriff,
  // muss also nicht bei jedem Tastendruck neu geladen werden.
  const { data: myNetwork } = useQuery({
    queryKey: ["my-network"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id ?? "";
      const [{ data: follows }, { data: blocksMade }, { data: blocksReceived }] = await Promise.all(
        [
          supabase.from("follows").select("following_id, status").eq("follower_id", me),
          supabase.from("blocks").select("blocked_id").eq("blocker_id", me),
          supabase.from("blocks").select("blocker_id").eq("blocked_id", me),
        ],
      );
      return {
        me,
        followStatusById: new Map((follows ?? []).map((f) => [f.following_id, f.status])),
        blockedIds: new Set([
          ...(blocksMade ?? []).map((b) => b.blocked_id),
          ...(blocksReceived ?? []).map((b) => b.blocker_id),
        ]),
      };
    },
    staleTime: 30_000,
  });

  const { data } = useQuery({
    queryKey: ["people", term],
    enabled: !!myNetwork,
    queryFn: async () => {
      const { me, followStatusById, blockedIds } = myNetwork!;
      let query = supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_private")
        .limit(30);
      if (term) {
        const t = term.replace(/^@/, "");
        query = query.or(`username.ilike.%${t}%,display_name.ilike.%${t}%`);
      }
      const { data: people, error } = await query;
      if (error) throw error;
      return (people ?? [])
        .filter((p) => p.id !== me && !blockedIds.has(p.id))
        .map((p) => ({
          ...p,
          followStatus: followStatusById.get(p.id) as "pending" | "accepted" | undefined,
        }));
    },
  });

  async function toggleFollow(
    id: string,
    followStatus: "pending" | "accepted" | undefined,
    isPrivate: boolean,
  ) {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) return;

    // Optimistisches Update: Button/Status sofort anpassen, nicht erst auf
    // den Server-Rundlauf warten -- verhindert das "haengt fest"-Gefuehl,
    // falls die Invalidierung mal einen Moment braucht.
    const optimisticStatus: "pending" | "accepted" | undefined = followStatus
      ? undefined
      : isPrivate
        ? "pending"
        : "accepted";
    queryClient.setQueryData(
      ["people", term],
      (old: { id: string; followStatus?: "pending" | "accepted" }[] | undefined) =>
        (old ?? []).map((p) => (p.id === id ? { ...p, followStatus: optimisticStatus } : p)),
    );

    if (followStatus) {
      const { data: deleted, error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", me)
        .eq("following_id", id)
        .select();
      if (error) {
        toast.error(getErrorMessage(error, "Action failed"));
      } else if (!deleted || deleted.length === 0) {
        // Kein Fehler, aber auch keine Zeile geloescht -- deutet auf ein
        // Berechtigungsproblem hin, nicht einfach als Erfolg werten.
        toast.error("Could not unfollow. Please try again.");
      } else {
        toast.success(followStatus === "accepted" ? "Unfollowed" : "Request withdrawn");
      }
    } else {
      const { data: inserted, error } = await supabase
        .from("follows")
        .insert({ follower_id: me, following_id: id })
        .select("status");
      if (error) {
        toast.error(getErrorMessage(error, "Action failed"));
      } else {
        const actualStatus = inserted?.[0]?.status;
        toast.success(actualStatus === "pending" ? "Requested" : "Following");
      }
    }

    queryClient.invalidateQueries({ queryKey: ["my-network"] });
    queryClient.invalidateQueries({ queryKey: ["people"] });
  }

  if (!term) {
    return (
      <EmptyState icon={Users} title="Find friends" text="Search for your friends' usernames." />
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState icon={Users} title="No one found" text="Check the spelling." />;
  }

  return (
    <ul className="space-y-2">
      {data.map((p) => (
        <li
          key={p.id}
          className="flex items-center gap-3 rounded-3xl border border-border bg-card p-3 shadow-card"
        >
          <Link
            to="/u/$username"
            params={{ username: p.username }}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <UserAvatar avatarPath={p.avatar_url} name={p.display_name ?? p.username} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {p.display_name || p.username}
              </span>
              <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>
            </span>
          </Link>
          <Button
            size="sm"
            variant={p.followStatus ? "secondary" : "default"}
            className="rounded-full"
            onClick={() => toggleFollow(p.id, p.followStatus, p.is_private)}
          >
            {p.followStatus === "accepted" ? (
              <UserCheck size={16} />
            ) : p.followStatus === "pending" ? (
              <Clock size={16} />
            ) : (
              <UserPlus size={16} />
            )}
            <span className="ml-1">
              {p.followStatus === "accepted"
                ? "Following"
                : p.followStatus === "pending"
                  ? "Requested"
                  : p.is_private
                    ? "Request"
                    : "Follow"}
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
