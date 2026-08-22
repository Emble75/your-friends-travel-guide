import type { ReactNode } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { TuriWordmark } from "./Logo";
import { navHistory } from "@/lib/nav-history";

export function AppHeader({
  title,
  action,
  showBack = false,
  fallbackTo,
}: {
  title?: string;
  action?: ReactNode;
  showBack?: boolean;
  // Wohin, falls es keine Browser-Historie zum Zurueckgehen gibt (z. B.
  // bei einem frisch geoeffneten geteilten Link). Ohne Angabe wird trotzdem
  // versucht, ganz normal zurueckzugehen.
  fallbackTo?: string;
}) {
  const router = useRouter();
  const navigate = useNavigate();

  function goBack() {
    if (navHistory.hasNavigatedInApp || !fallbackTo) {
      router.history.back();
    } else {
      navigate({ to: fallbackTo });
    }
  }

  return (
    <header className="sticky top-0 z-30 bg-background/90 backdrop-blur">
      <div className="app-shell flex h-14 items-center gap-2">
        {showBack ? (
          <button
            type="button"
            onClick={goBack}
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
