import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Ladefehler ehrlich anzeigen.
 *
 * Vorher liefen fehlgeschlagene Abfragen ueberall in den leeren Zustand --
 * "Your feed is empty", obwohl in Wahrheit die Verbindung gescheitert war.
 * Das verbirgt Probleme und laesst Nutzer glauben, es gaebe keine Inhalte.
 */
export function ErrorState({
  title = "Something went wrong",
  text = "We couldn't load this. Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  text?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="turi-enter flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/60 px-6 py-12 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle size={26} />
      </span>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{text}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-5 rounded-2xl" onClick={onRetry}>
          <RotateCw size={16} />
          <span className="ml-1.5">Try again</span>
        </Button>
      ) : null}
    </div>
  );
}
