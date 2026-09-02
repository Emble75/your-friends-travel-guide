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
  error,
  onRetry,
}: {
  title?: string;
  text?: string;
  /** Der technische Fehler -- aufklappbar, damit man ihn im Zweifel
   *  vorlesen kann, statt die Browser-Konsole oeffnen zu muessen. */
  error?: unknown;
  onRetry?: () => void;
}) {
  const detail =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : null;
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
      {detail ? (
        <details className="mt-4 w-full max-w-xs text-left">
          <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
          <p className="mt-1.5 break-words rounded-xl bg-secondary px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {detail}
          </p>
        </details>
      ) : null}
    </div>
  );
}
