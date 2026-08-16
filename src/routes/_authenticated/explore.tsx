import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, Search, UserPlus, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/turi/AppHeader";
import { EmptyState } from "@/components/turi/EmptyState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/explore")({
  head: () => ({
    meta: [
      { title: "Suchen – Turi" },
      { name: "description", content: "Finde Orte und Freunde auf Turi." },
      { property: "og:title", content: "Suchen – Turi" },
      { property: "og:description", content: "Finde Orte und Freunde auf Turi." },
    ],
  }),
  component: ExplorePage,
});

function ExplorePage() {
  const [q, setQ] = useState("");
  const term = q.trim();

  return (
    <>
      <AppHeader title="Suchen" />
      <div className="app-shell space-y-4 py-4">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ort, Stadt oder @username"
            className="h-12 rounded-2xl pl-11"
          />
        </div>

        <Tabs defaultValue="places">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl">
            <TabsTrigger value="places" className="rounded-xl">
              Orte
            </TabsTrigger>
            <TabsTrigger value="people" className="rounded-xl">
              Personen
            </TabsTrigger>
          </TabsList>
          <TabsContent value="places" className="mt-4">
            <PlaceResults term={term} />
          </TabsContent>
          <TabsContent value="people" className="mt-4">
            <PeopleResults term={term} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function PlaceResults({ term }: { term: string }) {
  const { data } = useQuery({
    queryKey: ["places", term],
    queryFn: async () => {
      let query = supabase.from("places").select("id, name, city, category").limit(30);
      if (term) query = query.or(`name.ilike.%${term}%,city.ilike.%${term}%`);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="Kein Ort gefunden"
        text="Lege den Ort einfach beim Bewerten neu an."
        action={
          <Button asChild className="rounded-2xl">
            <Link to="/new">Ort bewerten</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((p) => (
        <li key={p.id}>
          <Link
            to="/place/$placeId"
            params={{ placeId: p.id }}
            className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-card"
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-accent-foreground">
              <MapPin size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{p.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {p.city} · {p.category}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PeopleResults({ term }: { term: string }) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["people", term],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id ?? "";
      let query = supabase.from("profiles").select("id, username, display_name, avatar_url").limit(30);
      if (term) {
        const t = term.replace(/^@/, "");
        query = query.or(`username.ilike.%${t}%,display_name.ilike.%${t}%`);
      }
      const { data: people, error } = await query;
      if (error) throw error;
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", me);
      const followingIds = new Set((follows ?? []).map((f) => f.following_id));
      return (people ?? [])
        .filter((p) => p.id !== me)
        .map((p) => ({ ...p, isFollowing: followingIds.has(p.id) }));
    },
  });

  async function toggleFollow(id: string, isFollowing: boolean) {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) return;
    const { error } = isFollowing
      ? await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", id)
      : await supabase.from("follows").insert({ follower_id: me, following_id: id });
    if (error) toast.error(error.message);
    else {
      toast.success(isFollowing ? "Nicht mehr gefolgt" : "Du folgst jetzt");
      queryClient.invalidateQueries();
    }
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Niemand gefunden"
        text="Suche nach dem Benutzernamen deiner Freunde."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((p) => (
        <li
          key={p.id}
          className="flex items-center gap-3 rounded-3xl border border-border bg-card p-3 shadow-card"
        >
          <Link to="/u/$username" params={{ username: p.username }} className="flex min-w-0 flex-1 items-center gap-3">
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
            variant={p.isFollowing ? "secondary" : "default"}
            className="rounded-full"
            onClick={() => toggleFollow(p.id, p.isFollowing)}
          >
            {p.isFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}
            <span className="ml-1">{p.isFollowing ? "Folgst du" : "Folgen"}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
