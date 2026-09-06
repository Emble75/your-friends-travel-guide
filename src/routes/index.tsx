import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/app-client";
import { AppSplash } from "@/components/turi/AppSplash";

/*
 * Die Wurzel ist nur noch eine Weiche, keine Seite.
 *
 * Vorher stand hier eine Vorstellungsseite ("The map only your friends
 * could draw") mit drei erklaerenden Punkten und einem "Get started".
 * Sie war ein Umweg: Wer die App oeffnet, will sich anmelden oder auf
 * seine Karte -- nicht erst lesen, was die App ist. Angemeldete Nutzer
 * wurden ohnehin sofort weitergeleitet, sahen sie also nie.
 *
 * Waehrend entschieden wird, steht der Startbildschirm -- derselbe, der
 * schon im ausgelieferten HTML liegt. Der Uebergang ist dadurch
 * unsichtbar: es sieht aus wie ein einziger Ladevorgang.
 */
export const Route = createFileRoute("/")({
  /*
   * BEWUSST MIT SSR: Die Seite selbst ist unveraenderlich (nur die
   * Marke auf ruhigem Grund) und kommt dadurch fertig vom Server --
   * ohne SSR blitzt an ihrer Stelle erst eine leere Flaeche auf, bevor
   * ueberhaupt etwas erscheint. Die Entscheidung, wohin es geht,
   * braucht die Sitzung aus dem Browser und faellt deshalb erst danach
   * im Effekt.
   */
  head: () => ({
    meta: [
      { title: "Turi" },
      {
        name: "description",
        content: "Turi shows you only your friends' reviews for every place.",
      },
    ],
  }),
  component: Entry,
});

function Entry() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();

    supabase.auth.getSession().then(({ data }) => {
      /*
       * Kurze Mindestdauer. Die Sitzung liegt lokal, die Entscheidung
       * faellt also oft in wenigen Millisekunden -- ohne diese Bremse
       * blitzt der Bildschirm nur auf und wirkt wie ein Fehler statt wie
       * ein Start. Ist das Laden ohnehin langsamer, wartet hier nichts
       * zusaetzlich.
       */
      timer = setTimeout(
        () => {
          if (active) navigate({ to: data.session ? "/map" : "/auth", replace: true });
        },
        Math.max(0, 600 - (Date.now() - started)),
      );
    });

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [navigate]);

  return <AppSplash />;
}
