import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { TuriWordmark } from "./Logo";

export function AppHeader({
  title,
  action,
  showBack = false,
}: {
  title?: string;
  action?: ReactNode;
  showBack?: boolean;
}) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 bg-background/90 backdrop-blur">
      <div className="app-shell flex h-14 items-center gap-2">
        {showBack ? (
          <button
            type="button"
            onClick={() => router.history.back()}
            aria-label="Back"
            className="-ml-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <ChevronLeft size={22} />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center justify-between">
          {title ? (
            <h1 className="min-w-0 truncate font-display text-lg font-bold tracking-tight">
              {title}
            </h1>
          ) : (
            <TuriWordmark />
          )}
          {action}
        </div>
      </div>
      <div className="brand-accent-line h-px w-full opacity-40" />
    </header>
  );
}
