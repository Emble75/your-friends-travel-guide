import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Users, MapPin, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TuriMark } from "@/components/turi/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Turi – Trust your people, not strangers" },
      {
        name: "description",
        content:
          "Turi is the social travel app: rate places with your friends' honesty, and see only what people you trust actually think.",
      },
      { property: "og:title", content: "Turi – Trust your people, not strangers" },
      {
        property: "og:description",
        content: "Rate places for your friends. See only what they actually think.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/map", replace: true });
    });
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background">
      <div className="app-shell flex min-h-screen flex-col justify-between py-10">
        <div>
          <TuriMark className="size-16 text-[4rem]" />
          <h1 className="mt-8 text-4xl font-bold leading-tight">
            Finally, reviews
            <br />
            you can actually trust.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Every place, rated only by the friends whose taste you actually share. No strangers, no
            bots, no five stars for a free appetizer.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              {
                icon: Users,
                title: "Build your circle",
                text: "Follow the friends whose recommendations you'd actually take.",
              },
              {
                icon: Star,
                title: "Rate the real thing",
                text: "Stars, a few words, and the photo that proves you were there.",
              },
              {
                icon: MapPin,
                title: "Never guess again",
                text: "Open any spot and see instantly who from your circle already loved it.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-card"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-accent-foreground">
                  <Icon size={20} />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-xs text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 space-y-3">
          <Button asChild className="h-13 w-full rounded-2xl py-4 text-base">
            <Link to="/auth">Get started</Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Free forever. In your feed in under 30 seconds.
          </p>
        </div>
      </div>
    </main>
  );
}
