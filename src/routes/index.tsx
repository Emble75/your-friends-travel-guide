import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Users, MapPin, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TuriMark } from "@/components/turi/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Turi – Orte, die deine Freunde empfehlen" },
      {
        name: "description",
        content:
          "Turi ist die Social-Travel-App: Bewerte Orte mit Sternen und Fotos und sieh pro Ort nur die Bewertungen deiner Freunde.",
      },
      { property: "og:title", content: "Turi – Orte, die deine Freunde empfehlen" },
      {
        property: "og:description",
        content: "Bewerte Orte mit Sternen und Fotos und sieh nur die Meinungen deiner Freunde.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/feed", replace: true });
    });
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background">
      <div className="app-shell flex min-h-screen flex-col justify-between py-10">
        <div>
          <TuriMark className="size-16 text-[4rem]" />
          <h1 className="mt-8 text-4xl font-bold leading-tight">
            Reisetipps von den Leuten,
            <br />
            denen du wirklich vertraust.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Turi zeigt dir zu jedem Ort nur die Bewertungen deiner Freunde – keine Fremden, keine
            gekauften Sterne.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              { icon: Users, title: "Freunden folgen", text: "Dein Kreis, deine Empfehlungen." },
              { icon: Star, title: "Orte bewerten", text: "Sterne, Text und bis zu 3 Fotos." },
              { icon: MapPin, title: "Sofort sehen", text: "Wer aus deinem Kreis war schon da?" },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-card">
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
            <Link to="/auth">Los geht's</Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Kostenlos. Mit E-Mail in 30 Sekunden startklar.
          </p>
        </div>
      </div>
    </main>
  );
}
