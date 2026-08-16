import type { ReactNode } from "react";
import { TuriWordmark } from "./Logo";

export function AppHeader({ title, action }: { title?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="app-shell flex h-14 items-center justify-between">
        {title ? (
          <h1 className="font-display text-lg font-bold tracking-tight">{title}</h1>
        ) : (
          <TuriWordmark />
        )}
        {action}
      </div>
    </header>
  );
}
