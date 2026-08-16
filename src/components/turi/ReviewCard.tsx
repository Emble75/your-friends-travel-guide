import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { Stars } from "./Stars";
import { UserAvatar } from "./UserAvatar";
import { signedUrls, timeAgo } from "@/lib/turi";

export type ReviewWithRelations = {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
  user_id: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
  places: { id: string; name: string; city: string; category: string } | null;
  review_images: { id: string; image_url: string; position: number }[];
};

export function ReviewCard({
  review,
  showPlace = true,
}: {
  review: ReviewWithRelations;
  showPlace?: boolean;
}) {
  const paths = review.review_images
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((i) => i.image_url);

  const { data: urls } = useQuery({
    queryKey: ["review-images", review.id, paths.join(",")],
    queryFn: () => signedUrls("review-photos", paths),
    enabled: paths.length > 0,
  });

  const profile = review.profiles;

  return (
    <article className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <Link to="/u/$username" params={{ username: profile?.username ?? "" }}>
          <UserAvatar avatarPath={profile?.avatar_url} name={profile?.display_name ?? profile?.username} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to="/u/$username"
            params={{ username: profile?.username ?? "" }}
            className="block truncate text-sm font-semibold"
          >
            {profile?.display_name || profile?.username}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            @{profile?.username} · {timeAgo(review.created_at)}
          </p>
        </div>
        <Stars value={review.rating} />
      </div>

      {showPlace && review.places ? (
        <Link
          to="/place/$placeId"
          params={{ placeId: review.places.id }}
          className="mt-3 flex items-center gap-2 rounded-2xl bg-secondary px-3 py-2"
        >
          <MapPin size={16} className="text-primary" />
          <span className="truncate text-sm font-medium">{review.places.name}</span>
          <span className="truncate text-xs text-muted-foreground">{review.places.city}</span>
        </Link>
      ) : null}

      {review.text ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {review.text}
        </p>
      ) : null}

      {paths.length > 0 ? (
        <div
          className="mt-3 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.min(paths.length, 3)}, minmax(0,1fr))` }}
        >
          {(urls ?? paths.map(() => null)).map((url, i) => (
            <div key={i} className="aspect-square overflow-hidden rounded-2xl bg-muted">
              {url ? (
                <img
                  src={url}
                  alt={`Foto ${i + 1} von ${review.places?.name ?? "Ort"}`}
                  loading="lazy"
                  className="size-full object-cover"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export const reviewSelect =
  "id, rating, text, created_at, user_id, profiles:profiles!reviews_user_id_fkey(username, display_name, avatar_url), places(id, name, city, category), review_images(id, image_url, position)";
