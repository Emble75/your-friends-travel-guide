import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/turi/AppHeader";
import { EmptyState } from "@/components/turi/EmptyState";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "@/components/turi/ReviewCard";
import { Stars } from "@/components/turi/Stars";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/place/$placeId")({
  head: () => ({
    meta: [
      { title: "Place – Turi" },
      { name: "description", content: "Your friends' reviews of this place." },
      { property: "og:title", content: "Place – Turi" },
      { property: "og:description", content: "Your friends' reviews of this place." },
    ],
  }),
  component: PlacePage,
});

function PlacePage() {
  const { placeId } = Route.useParams();

  const { data: place } = useQuery({
    queryKey: ["place", placeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("places")
        .select("id, name, city, category")
        .eq("id", placeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: reviews, isLoading } = useQuery({
    queryKey: ["place-reviews", placeId],
    queryFn: async () => {
      // RLS returns only reviews from the current user and people they follow.
      const { data, error } = await supabase
        .from("reviews")
        .select(reviewSelect)
        .eq("place_id", placeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReviewWithRelations[];
    },
  });

  const avg =
    reviews && reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : null;

  return (
    <>
      <AppHeader title={place?.name ?? "Place"} />
      <div className="app-shell space-y-4 py-4">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-accent-foreground">
              <MapPin size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold">{place?.name ?? "…"}</h1>
              <p className="truncate text-sm text-muted-foreground">
                {place?.city}
                {place?.category ? ` · ${place.category}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
            {avg !== null ? (
              <>
                <span className="font-display text-2xl font-bold">{avg.toFixed(1)}</span>
                <Stars value={avg} size={16} />
                <span className="ml-auto text-xs text-muted-foreground">
                  {reviews!.length} {reviews!.length === 1 ? "friend" : "friends"}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No average from your circle yet</span>
            )}
          </div>
        </section>

        <h2 className="px-1 text-sm font-semibold text-muted-foreground">From your circle</h2>

        {isLoading ? (
          <Skeleton className="h-48 rounded-3xl" />
        ) : reviews && reviews.length > 0 ? (
          reviews.map((r) => <ReviewCard key={r.id} review={r} showPlace={false} />)
        ) : (
          <EmptyState
            icon={Users}
            title="No friend reviews for this place yet"
            text="Follow more friends, or be the first to review it yourself."
            action={
              <div className="flex gap-2">
                <Button asChild className="rounded-2xl">
                  <Link to="/new">Review now</Link>
                </Button>
                <Button asChild variant="secondary" className="rounded-2xl">
                  <Link to="/explore">Find friends</Link>
                </Button>
              </div>
            }
          />
        )}
      </div>
    </>
  );
}
