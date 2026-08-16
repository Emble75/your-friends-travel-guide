import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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

function FeedPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["feed"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", me ?? "");
      const ids = (follows ?? []).map((f) => f.following_id);
      if (ids.length === 0) return [] as ReviewWithRelations[];
      const { data: reviews, error } = await supabase
        .from("reviews")
        .select(reviewSelect)
        .in("user_id", ids)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (reviews ?? []) as unknown as ReviewWithRelations[];
    },
  });

  return (
    <>
      <AppHeader />
      <div className="app-shell space-y-4 py-4">
        {isLoading ? (
          <>
            <Skeleton className="h-56 rounded-3xl" />
            <Skeleton className="h-56 rounded-3xl" />
          </>
        ) : data && data.length > 0 ? (
          data.map((r) => <ReviewCard key={r.id} review={r} />)
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
