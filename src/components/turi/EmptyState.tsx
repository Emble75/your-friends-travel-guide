import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-accent-foreground">
        <Icon size={26} />
      </span>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{text}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
