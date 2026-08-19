import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Compass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/turi/AppHeader";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "@/components/turi/ReviewCard";
import { EmptyState } from "@/components/turi/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/feed")({
  head: () => ({
    meta: [
      { title: "Feed – Turi" },
      { name: "description", content: "Die neuesten Ortsbewertungen deiner Freunde auf Turi." },
      { property: "og:title", content: "Feed – Turi" },
      { property: "og:description", content: "Die neuesten Ortsbewertungen deiner Freunde." },
    ],
  }),
  component: FeedPage,
});

const PAGE_SIZE = 20;

function FeedPage() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["feed"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", me ?? "");
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

  const allReviews = data?.pages.flatMap((p) => p.reviews) ?? [];

  return (
    <>
      <AppHeader />
      <div className="app-shell space-y-4 py-4">
        {isLoading ? (
          <>
            <Skeleton className="h-56 rounded-3xl" />
            <Skeleton className="h-56 rounded-3xl" />
          </>
        ) : allReviews.length > 0 ? (
          <>
            {allReviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
            {hasNextPage ? (
              <Button
                variant="secondary"
                className="w-full rounded-2xl"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                {isFetchingNextPage ? "Lädt…" : "Mehr laden"}
              </Button>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={Compass}
            title="Dein Feed ist noch leer"
            text="Folge Freunden, um ihre Ortsbewertungen hier zu sehen."
            action={
              <Button asChild className="rounded-2xl">
                <Link to="/explore">Freunde finden</Link>
              </Button>
            }
          />
        )}
      </div>
    </>
  );
}
