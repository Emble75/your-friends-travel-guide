import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, MapPin, Share2, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signedUrls } from "@/lib/turi";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/folder/$folderId/recap")({
  head: () => ({
    meta: [{ title: "Recap – Turi" }],
  }),
  component: RecapPage,
});

type RecapReview = {
  id: string;
  rating: number;
  created_at: string;
  places: { name: string; city: string } | null;
  review_images: { image_url: string; position: number }[];
};

function RecapPage() {
  const { folderId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["trip-recap", folderId],
    queryFn: async () => {
      const [{ data: folder }, { data: reviews }] = await Promise.all([
        supabase.from("trip_folders").select("name").eq("id", folderId).maybeSingle(),
        supabase
          .from("reviews")
          .select("id, rating, created_at, places(name, city), review_images(image_url, position)")
          .eq("trip_folder_id", folderId)
          .order("created_at", { ascending: true }),
      ]);

      const reviewList = (reviews ?? []) as unknown as RecapReview[];
      const placeCount = reviewList.length;
      const photoPaths = reviewList
        .flatMap((r) => r.review_images.slice().sort((a, b) => a.position - b.position))
        .map((i) => i.image_url)
        .slice(0, 9);
      const photoCount = reviewList.reduce((s, r) => s + r.review_images.length, 0);
      const avg = placeCount > 0 ? reviewList.reduce((s, r) => s + r.rating, 0) / placeCount : null;
      const dates = reviewList.map((r) => new Date(r.created_at).getTime());
      const dateRange =
        dates.length > 0
          ? {
              from: new Date(Math.min(...dates)),
              to: new Date(Math.max(...dates)),
            }
          : null;

      const photoUrls = await signedUrls("review-photos", photoPaths);

      return {
        folderName: folder?.name ?? "Trip",
        reviews: reviewList,
        placeCount,
        photoCount,
        avg,
        dateRange,
        photoUrls: photoUrls.filter((u): u is string => !!u),
      };
    },
  });

  async function share() {
    const summary = data
      ? `${data.folderName} on Turi: ${data.placeCount} places, ${data.photoCount} photos${
          data.avg ? `, ⭐ ${data.avg.toFixed(1)} average` : ""
        }.`
      : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: data?.folderName ?? "Turi trip recap", text: summary });
      } catch {
        // Nutzer hat den Teilen-Dialog abgebrochen -- kein Fehler.
      }
    } else {
      await navigator.clipboard.writeText(summary);
      toast.success("Copied to clipboard");
    }
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-[#171310] p-6">
        <Skeleton className="h-64 rounded-3xl bg-white/10" />
      </div>
    );
  }

  const monthFormat = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" });
  const dateLabel = data.dateRange
    ? data.dateRange.from.getTime() === data.dateRange.to.getTime()
      ? monthFormat.format(data.dateRange.from)
      : `${monthFormat.format(data.dateRange.from)} – ${monthFormat.format(data.dateRange.to)}`
    : "";

  return (
    <div className="min-h-screen bg-[#171310] pb-16 text-white">
      {/* Ambient warm glow, dezent im Hintergrund */}
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 40% at 50% 0%, oklch(0.67 0.19 38 / 35%), transparent 70%)",
        }}
      />

      <div className="relative app-shell py-6">
        <div className="flex items-center justify-between">
          <Link
            to="/folder/$folderId"
            params={{ folderId }}
            className="flex items-center gap-1 text-xs text-white/60"
          >
            <ArrowLeft size={14} /> Back
          </Link>
          <button
            type="button"
            onClick={share}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur"
          >
            <Share2 size={13} /> Share
          </button>
        </div>

        <div className="mt-10 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-white/70 backdrop-blur">
            <Sparkles size={12} /> Trip recap
          </span>
          <h1 className="font-display mt-4 text-4xl font-bold leading-tight">{data.folderName}</h1>
          {dateLabel ? <p className="mt-1 text-sm text-white/50">{dateLabel}</p> : null}
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          <StatCard icon={MapPin} value={data.placeCount} label="places" />
          <StatCard icon={Camera} value={data.photoCount} label="photos" />
          <StatCard icon={Star} value={data.avg ? data.avg.toFixed(1) : "–"} label="avg rating" />
        </div>

        {data.photoUrls.length > 0 ? (
          <div className="mt-8 grid grid-cols-3 gap-1.5">
            {data.photoUrls.map((url, i) => (
              <div
                key={i}
                className={`overflow-hidden rounded-2xl bg-white/5 ${
                  i === 0 ? "col-span-2 row-span-2 aspect-square" : "aspect-square"
                }`}
              >
                <img src={url} alt="" className="size-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-8 space-y-2">
          {data.reviews.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 backdrop-blur"
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {r.places?.name ?? "Place"}
              </span>
              <span className="ml-3 flex shrink-0 items-center gap-1 text-xs text-white/60">
                <Star size={12} className="fill-current text-[#e0b04a]" />
                {r.rating.toFixed(1)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <p className="font-display text-lg font-bold">Turi</p>
          <p className="text-xs text-white/40">Places, seen through the people who get you.</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof MapPin;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-3xl bg-white/5 py-5 backdrop-blur">
      <Icon size={16} className="text-[#FF6B35]" />
      <span className="font-display text-2xl font-bold">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-white/50">{label}</span>
    </div>
  );
}
