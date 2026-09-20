import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Compass, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/app-client";
import { knownPosition, tap } from "@/lib/native";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "@/components/turi/ReviewCard";
import { EmptyState } from "@/components/turi/EmptyState";
import { ErrorState } from "@/components/turi/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/feed")({
  /*
   * Der gewaehlte Reiter steht in der Adresse -- wie die Kartenansicht
   * auf Profilseiten. Tippt man eine Bewertung an und kommt zurueck,
   * wird diese Seite neu erzeugt; ein blosser Komponentenzustand waere
   * dann weg und man laendete wieder bei "Friends".
   */
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search["tab"] === "suggested" ? { tab: "suggested" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Feed – Turi" },
      { name: "description", content: "Your friends' latest place reviews on Turi." },
      { property: "og:title", content: "Feed – Turi" },
      { property: "og:description", content: "Your friends' latest place reviews." },
    ],
  }),
  component: FeedPage,
});

const PAGE_SIZE = 20;

function FeedPage() {
  const { tab = "friends" } = Route.useSearch();
  const navigate = useNavigate();

  /*
   * Der Standort, falls er ohne Nachfrage zu haben ist -- er macht die
   * Vorschlaege oertlich. Fehlt er, kommen eben die neuesten von
   * ueberall; ein Standort-Dialog, den niemand angefordert hat, waere
   * der schlechtere Tausch.
   */
  const { data: pos } = useQuery({
    queryKey: ["known-position"],
    enabled: tab === "suggested",
    staleTime: 10 * 60_000,
    queryFn: async () => (await knownPosition()) ?? null,
  });

  return (
    <div className="app-shell app-top space-y-4 pb-4">
      {/*
        Zwei Reiter, dieselbe Geste wie der Feed/Map-Umschalter auf
        Profilseiten. "Friends" steht links und ist der Normalfall: Der
        Kern der App ist, was die eigenen Leute denken -- Vorschlaege
        sind die Ergaenzung, nicht der Ausgangspunkt.
      */}
      <div className="flex gap-1 rounded-2xl bg-secondary p-1">
        <button
          type="button"
          onClick={() => {
            void tap();
            navigate({ to: "/feed", search: {}, replace: true });
          }}
          aria-pressed={tab === "friends"}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors ${
            tab === "friends" ? "bg-card shadow-card" : "text-muted-foreground"
          }`}
        >
          <Users size={15} /> Friends
        </button>
        <button
          type="button"
          onClick={() => {
            void tap();
            navigate({ to: "/feed", search: { tab: "suggested" }, replace: true });
          }}
          aria-pressed={tab === "suggested"}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors ${
            tab === "suggested" ? "bg-card shadow-card" : "text-muted-foreground"
          }`}
        >
          <Sparkles size={15} /> Suggested
        </button>
      </div>

      {tab === "suggested" ? <SuggestedFeed pos={pos ?? null} /> : <FriendsFeed />}
    </div>
  );
}

function FriendsFeed() {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["feed"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      // Nur angenommene Follows -- eine offene Anfrage an ein privates
      // Konto darf dessen Bewertungen nicht in den Feed spuelen.
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", me ?? "")
        .eq("status", "accepted");
      const ids = (follows ?? []).map((f) => f.following_id);
      if (ids.length === 0) return { reviews: [] as ReviewWithRelations[], nextCursor: null };

      let query = supabase
        .from("reviews")
        .select(reviewSelect)
        .in("user_id", ids)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (pageParam) query = query.lt("created_at", pageParam);

      const { data: reviews, error } = await query;
      if (error) throw error;
      const list = (reviews ?? []) as unknown as ReviewWithRelations[];
      const nextCursor = list.length === PAGE_SIZE ? list[list.length - 1]!.created_at : null;
      return { reviews: list, nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const all = data?.pages.flatMap((p) => p.reviews) ?? [];

  if (isError) {
    return (
      <ErrorState text="We couldn't load your feed." error={error} onRetry={() => refetch()} />
    );
  }
  if (isLoading) return <FeedSkeleton />;
  if (all.length === 0) {
    return (
      <EmptyState
        icon={Compass}
        title="Your feed is empty"
        text="Follow friends to see their place reviews here — or look at Suggested for places nearby."
        action={
          <Button asChild className="rounded-2xl">
            <Link to="/explore">Find friends</Link>
          </Button>
        }
      />
    );
  }

  return (
    <FeedList
      reviews={all}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onMore={() => fetchNextPage()}
    />
  );
}

/*
 * Vorschlaege: Bewertungen von Leuten, denen man NICHT folgt.
 *
 * Die Daten kommen nicht aus der Tabelle, sondern aus der Funktion
 * suggested_feed (siehe Migration 20260922120000). Grund: Die
 * Sichtbarkeitsregel der Datenbank gibt Bewertungen ausschliesslich an
 * Freunde heraus, und das soll auch so bleiben -- weichte man sie auf,
 * waeren oeffentliche Konten sofort UEBERALL sichtbar, auch auf der
 * Discover-Karte und in jedem Ortsdurchschnitt. Die Funktion gibt genau
 * fuer diesen Reiter genau diese Form heraus, nur oeffentliche Konten,
 * ohne Blockierte und ohne die, denen man ohnehin folgt.
 */
function SuggestedFeed({ pos }: { pos: { lat: number; lng: number } | null }) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["suggested-feed", pos?.lat ?? null, pos?.lng ?? null],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data: rows, error } = await supabase.rpc("suggested_feed", {
        p_limit: PAGE_SIZE,
        p_before: pageParam,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      });
      if (error) throw error;
      const list = (rows ?? []) as unknown as ReviewWithRelations[];
      const nextCursor = list.length === PAGE_SIZE ? list[list.length - 1]!.created_at : null;
      return { reviews: list, nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const all = data?.pages.flatMap((p) => p.reviews) ?? [];

  if (isError) {
    return (
      <ErrorState text="We couldn't load suggestions." error={error} onRetry={() => refetch()} />
    );
  }
  if (isLoading) return <FeedSkeleton />;
  if (all.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Nothing to suggest yet"
        text="Suggestions come from public accounts. As more people review places around you, they'll show up here."
        action={
          <Button asChild variant="secondary" className="rounded-2xl">
            <Link to="/map">Open the map</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <p className="turi-meta px-1 text-xs text-muted-foreground">
        {pos ? "Public accounts, near you" : "Public accounts"}
      </p>
      <FeedList
        reviews={all}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onMore={() => fetchNextPage()}
      />
    </>
  );
}

function FeedList({
  reviews,
  hasNextPage,
  isFetchingNextPage,
  onMore,
}: {
  reviews: ReviewWithRelations[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onMore: () => void;
}) {
  return (
    <div className="space-y-4">
      {reviews.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
      {hasNextPage ? (
        <Button
          variant="secondary"
          className="w-full rounded-2xl"
          disabled={isFetchingNextPage}
          onClick={onMore}
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-56 rounded-3xl" />
      <Skeleton className="h-56 rounded-3xl" />
    </div>
  );
}
