import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Navigation, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { directionsUrl, getErrorMessage } from "@/lib/turi";
import { tap } from "@/lib/native";
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

  // Gleicher Query-Key wie in ReviewCard -- der Wert wird geteilt, nicht
  // ein zweites Mal geholt.
  const { data: me } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: 5 * 60_000,
  });

  const { data: place } = useQuery({
    queryKey: ["place", placeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("places")
        .select("id, name, city, category, lat, lng, google_place_id")
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
    void tap();
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

  /*
   * Eigene Bewertung von denen des Freundeskreises trennen.
   *
   * Die Abfrage liefert beides -- die Sichtbarkeitsregel schliesst die
   * eigenen Inhalte ausdruecklich ein. Vorher landete die eigene
   * Bewertung dadurch unter "From your circle", wurde als Freund
   * mitgezaehlt und floss in den Durchschnitt ein. Der Kern der App ist
   * aber, was ANDERE denken; die eigene Meinung darf ihn nicht faerben.
   */
  const myReview = reviews?.find((r) => r.user_id === me) ?? null;
  const circleReviews = reviews?.filter((r) => r.user_id !== me) ?? [];

  const avg =
    circleReviews.length > 0
      ? circleReviews.reduce((s, r) => s + r.rating, 0) / circleReviews.length
      : null;

  return (
    <>
      <AppHeader title={place?.name ?? "Place"} showBack fallbackTo="/map" />
      <div className="app-shell space-y-4 py-4">
        <section className="turi-card p-5 ">
          {/*
            Dieselbe Ordnung wie im Karten-Panel: Name traegt die Zeile,
            Merken und Route sitzen als runde Symbolknoepfe daneben. Als
            breite Balken bekamen sie das Gewicht der Hauptsache -- der
            Routen-Knopf fuehrt aber aus der App HERAUS und gehoert nicht
            in die erste Reihe.
          */}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold">{place?.name ?? "…"}</h1>
              <p className="turi-meta truncate text-sm text-muted-foreground">
                {place?.city}
                {place?.category ? ` · ${place.category}` : ""}
              </p>
            </div>

            <button
              type="button"
              onClick={toggleSave}
              aria-label={isSaved ? "Remove from want to go" : "Add to want to go"}
              aria-pressed={!!isSaved}
              className={`turi-tap flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
                isSaved
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              <Bookmark size={18} fill={isSaved ? "currentColor" : "none"} />
            </button>

            {place ? (
              <a
                href={directionsUrl(place)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Directions in Google Maps"
                className="turi-tap flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground"
              >
                <Navigation size={18} />
              </a>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
            {avg !== null ? (
              <>
                <span className="font-display text-2xl font-bold">{avg.toFixed(1)}</span>
                <Stars value={avg} size={16} />
                <span className="ml-auto text-xs text-muted-foreground">
                  {circleReviews.length} {circleReviews.length === 1 ? "friend" : "friends"}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No average from your circle yet</span>
            )}
          </div>
        </section>

        {myReview ? (
          <>
            <h2 className="px-1 turi-eyebrow">Your review</h2>
            <ReviewCard review={myReview} showPlace={false} />
          </>
        ) : null}

        <h2 className="px-1 turi-eyebrow">From your circle</h2>

        {isError ? (
          <ErrorState text="We couldn't load the reviews." onRetry={() => refetch()} />
        ) : isLoading ? (
          <Skeleton className="h-48 rounded-3xl" />
        ) : circleReviews.length > 0 ? (
          circleReviews.map((r) => <ReviewCard key={r.id} review={r} showPlace={false} />)
        ) : (
          <EmptyState
            icon={Users}
            title="No friend reviews for this place yet"
            text="Follow more friends, or be the first to review it yourself."
            action={
              <div className="flex gap-2">
                {/* Den Ort mitgeben -- ohne ihn landet man in der
                    Ortsauswahl, obwohl man ihn gerade offen hat. */}
                <Button asChild className="rounded-2xl">
                  <Link to="/new" search={{ placeId }}>
                    Review now
                  </Link>
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
