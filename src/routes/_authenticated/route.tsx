import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/turi/BottomNav";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    /*
     * Unterer Abstand exakt auf die echte Hoehe der Navigationsleiste --
     * nicht mehr, nicht weniger. Vorher ein fester Schaetzwert (pb-24),
     * der den Home-Indikator nicht kannte.
     *
     * Bewusst ohne Zugabe: die Karte ist genau so hoch wie der Platz
     * darueber, jede Zugabe wuerde sie ueber den sichtbaren Bereich
     * hinausschieben und den Kartenscreen scrollen lassen. Die
     * scrollenden Seiten bringen ihren Luftabstand selbst mit
     * (app-top oben, pb-4 unten).
     *
     * 100dvh statt min-h-screen: 100vh rechnet auf dem Handy die
     * ein- und ausfahrende Browserleiste nicht mit.
     */
    <div className="min-h-[100dvh] bg-background" style={{ paddingBottom: "var(--bottom-nav-h)" }}>
      <Outlet />
      <BottomNav />
    </div>
  );
}
