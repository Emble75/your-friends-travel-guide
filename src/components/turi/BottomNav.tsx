import { Link } from "@tanstack/react-router";
import { Home, Search, Plus, User } from "lucide-react";

const items = [
  { to: "/feed", label: "Feed", icon: Home },
  { to: "/explore", label: "Suchen", icon: Search },
  { to: "/new", label: "Bewerten", icon: Plus },
  { to: "/me", label: "Profil", icon: User },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <div className="app-shell flex items-stretch justify-between py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-muted-foreground transition-colors"
            activeProps={{ className: "text-primary" }}
          >
            <Icon size={22} strokeWidth={2} />
            <span className="text-[11px] font-medium">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
