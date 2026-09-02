import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/turi";
import { AppHeader } from "@/components/turi/AppHeader";
import { EmptyState } from "@/components/turi/EmptyState";
import { ErrorState } from "@/components/turi/ErrorState";
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
  const queryClient = useQueryClient();

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

  const { data: isSaved } = useQuery({
    queryKey: ["is-place-saved", placeId],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) return false;
      const { data } = await supabase
        .from("saved_places")
        .select("place_id")
        .eq("user_id", me)
        .eq("place_id", placeId)
        .maybeSingle();
      return !!data;
    },
  });

  async function toggleSave() {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) return;
    const { error } = isSaved
      ? await supabase.from("saved_places").delete().eq("user_id", me).eq("place_id", placeId)
      : await supabase.from("saved_places").insert({ user_id: me, place_id: placeId });
    if (error) {
      toast.error(getErrorMessage(error, "Action failed"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["is-place-saved", placeId] });
    queryClient.invalidateQueries({ queryKey: ["my-saved-places"] });
  }

  const {
    data: reviews,
    isLoading,
    isError,
    refetch,
  } = useQuery({
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
      <AppHeader title={place?.name ?? "Place"} showBack fallbackTo="/map" />
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

          <button
            type="button"
            onClick={toggleSave}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition-colors ${
              isSaved
                ? "border-map-saved bg-map-saved/10 text-map-saved"
                : "border-border text-muted-foreground"
            }`}
          >
            <Bookmark size={16} fill={isSaved ? "currentColor" : "none"} />
            {isSaved ? "Saved to want to go" : "Add to want to go"}
          </button>

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

        <h2 className="px-1 turi-eyebrow">From your circle</h2>

        {isError ? (
          <ErrorState text="We couldn't load the reviews." onRetry={() => refetch()} />
        ) : isLoading ? (
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
