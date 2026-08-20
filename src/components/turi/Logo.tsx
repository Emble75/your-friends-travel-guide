import { cn } from "@/lib/utils";

export function TuriMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "brand-gradient flex items-center justify-center rounded-2xl shadow-glow",
        className,
      )}
    >
      <span
        className="font-display font-bold leading-none text-white"
        style={{ fontSize: "0.58em", letterSpacing: "-0.04em" }}
      >
        T
      </span>
    </div>
  );
}

export function TuriWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <TuriMark className="size-9 text-[2.25rem]" />
      <span className="font-display text-xl font-bold tracking-tight">Turi</span>
    </div>
  );
}
