import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Users, MapPin, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TuriMark } from "@/components/turi/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Turi – Places your friends recommend" },
      {
        name: "description",
        content:
          "Turi is the social travel app: review places with stars and photos, and see only your friends' reviews for every place.",
      },
      { property: "og:title", content: "Turi – Places your friends recommend" },
      {
        property: "og:description",
        content: "Review places with stars and photos and see only what your friends think.",
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
            Travel tips from the people
            <br />
            you actually trust.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Turi shows you only your friends' reviews for every place — no strangers, no bought
            stars.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              { icon: Users, title: "Follow friends", text: "Your circle, your recommendations." },
              { icon: Star, title: "Review places", text: "Stars, text, and up to 3 photos." },
              {
                icon: MapPin,
                title: "See it instantly",
                text: "Who from your circle has been here?",
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
            Free. Ready to go with email in 30 seconds.
          </p>
        </div>
      </div>
    </main>
  );
}
