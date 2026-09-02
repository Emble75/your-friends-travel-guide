import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyNetwork } from "@/hooks/use-follow";
import { AppHeader } from "@/components/turi/AppHeader";
import { EmptyState } from "@/components/turi/EmptyState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { FollowButton } from "@/components/turi/FollowButton";
import { Input } from "@/components/ui/input";
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
  const { data: network } = useMyNetwork();

  // Reine Suchtreffer -- OHNE Follow-Status. Der Status kommt ausschliesslich
  // aus ["my-network"] und wird erst beim Rendern zusammengefuehrt. Sonst
  // wuerde ein Refetch dieser Query den optimistisch gesetzten Status mit
  // einem veralteten my-network-Stand ueberschreiben (Button sprang zurueck).
  const { data: people } = useQuery({
    queryKey: ["people", term],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_private")
        .limit(30);
      if (term) {
        const t = term.replace(/^@/, "");
        query = query.or(`username.ilike.%${t}%,display_name.ilike.%${t}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const data = network
    ? (people ?? []).filter((p) => p.id !== network.me && !network.blockedIds.has(p.id))
    : undefined;

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
          <FollowButton
            userId={p.id}
            isPrivate={p.is_private}
            initialStatus={network?.followStatusById.get(p.id)}
          />
        </li>
      ))}
    </ul>
  );
}
