import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/app-client";
import { useMyNetwork } from "@/hooks/use-follow";
import { EmptyState } from "@/components/turi/EmptyState";
import { ErrorState } from "@/components/turi/ErrorState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { FollowButton } from "@/components/turi/FollowButton";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
      <div className="app-shell app-top space-y-4 pb-4">
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
  const {
    data: people,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    // Ohne Suchbegriff gar nicht erst anfragen -- vorher wurden bei jedem
    // Oeffnen der Seite 30 beliebige Profile geladen, die niemand sieht.
    enabled: !!term,
    queryKey: ["people", term],
    queryFn: async () => {
      // Komma, Klammern und Punkt haben in PostgREST-Filtern eine eigene
      // Bedeutung -- ungefiltert zerlegt eine Suche nach "a,b" die
      // OR-Bedingung und die Abfrage schlaegt fehl.
      const t = term
        .replace(/^@/, "")
        .replace(/[,().*\\"]/g, " ")
        .trim();
      if (!t) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_private")
        .or(`username.ilike.%${t}%,display_name.ilike.%${t}%`)
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const data = (people ?? []).filter(
    (p) => !network || (p.id !== network.me && !network.blockedIds.has(p.id)),
  );

  if (!term) {
    return (
      <EmptyState icon={Users} title="Find friends" text="Search for your friends' usernames." />
    );
  }

  if (isError) {
    return <ErrorState text="We couldn't run that search." onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <ul className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-3 rounded-3xl border border-border p-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28 rounded-full" />
              <Skeleton className="h-3 w-20 rounded-full" />
            </div>
            <Skeleton className="h-8 w-24 rounded-full" />
          </li>
        ))}
      </ul>
    );
  }

  if (data.length === 0) {
    return <EmptyState icon={Users} title="No one found" text="Check the spelling." />;
  }

  return (
    <ul className="space-y-2">
      {data.map((p) => (
        <li
          key={p.id}
          className="flex items-center gap-3 turi-card p-3"
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
