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
    <div className={cn("flex items-center gap-0.5", className)} aria-label={`${value} von 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={cn(
            value >= i - 0.25 ? "fill-star text-star" : "fill-muted text-muted-foreground/40",
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
          aria-label={`${i} Sterne`}
          className="rounded-full p-1 transition-transform active:scale-90"
        >
          <Star
            size={32}
            className={cn(
              value >= i ? "fill-star text-star" : "fill-muted text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}
