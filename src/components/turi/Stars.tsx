import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stars({
  value,
  size = 14,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          aria-hidden="true"
          // Goldflaeche mit dunklerer Kontur: das helle Gold allein
          // erreicht auf Weiss nur 1.98:1 und verschwimmt. Siehe
          // --star-outline in styles.css.
          className={cn(
            value >= i - 0.25
              ? "fill-star text-star-outline"
              : "fill-muted text-muted-foreground/40",
          )}
        />
      ))}
    </div>
  );
}

export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          aria-label={i === 1 ? "1 star" : `${i} stars`}
          aria-pressed={value === i}
          className="rounded-full p-1 transition-transform active:scale-90"
        >
          <Star
            size={32}
            aria-hidden="true"
            className={cn(
              value >= i ? "fill-star text-star-outline" : "fill-muted text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}
