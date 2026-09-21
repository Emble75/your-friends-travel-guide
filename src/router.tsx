import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/*
 * Keine Uebergaenge in einer unsichtbaren Seite.
 *
 * Browser lehnen startViewTransition ab, wenn die Seite versteckt ist,
 * und werfen dabei einen Fehler, den niemand faengt -- er landet
 * ungefiltert in der Konsole. Das ist kein Randfall: Genau das
 * passiert, wenn jemand eine Push-Nachricht antippt und die App aus
 * dem Hintergrund an die gemeinte Stelle springt.
 *
 * Die Ersatzfassung fuehrt die Aenderung sofort aus und meldet eine
 * abgeschlossene Ueberblendung. Animiert wird nichts -- was niemand
 * sieht, muss auch nicht weich sein.
 */
function guardViewTransitions() {
  if (typeof document === "undefined") return;
  const doc = document as Document & {
    startViewTransition?: (cb: () => unknown) => unknown;
    __turiViewTransitionGuarded?: boolean;
  };
  if (typeof doc.startViewTransition !== "function" || doc.__turiViewTransitionGuarded) return;
  doc.__turiViewTransitionGuarded = true;

  const native = doc.startViewTransition.bind(doc);
  /*
   * Die Ersatzfassung gibt dieselbe Form zurueck wie das Original,
   * traegt aber bewusst nicht dessen vollstaendige Typsignatur --
   * "types" etwa beschreibt eine Animation, die hier nicht stattfindet.
   * Deshalb hier ein gezielter Cast statt einer Attrappe, die so tut,
   * als koennte sie alles.
   */
  doc.startViewTransition = ((callback: () => unknown) => {
    if (doc.visibilityState === "hidden") {
      const done = Promise.resolve(callback?.());
      return {
        updateCallbackDone: done,
        ready: done,
        finished: done,
        types: new Set<string>(),
        skipTransition: () => undefined,
      };
    }
    return native(callback);
  }) as typeof doc.startViewTransition;
}

export const getRouter = () => {
  guardViewTransitions();

  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    /*
     * Weiche Uebergaenge zwischen den Seiten.
     *
     * Vorher wurde bei jedem Wechsel hart umgeschaltet: Die alte Seite
     * verschwand, die neue war schlagartig da. Im Browser ist man das
     * gewohnt -- in einer App liest es sich, als spraenge ein neues
     * Fenster auf. Am deutlichsten beim Weg von der Ortsvorschau auf
     * der Karte zur vollstaendigen Ortsseite.
     *
     * Der Browser blendet jetzt zwischen beiden Zustaenden ueber
     * (View Transitions). Das Aussehen des Uebergangs steht in
     * styles.css; Browser, die das nicht koennen, schalten weiterhin
     * hart um -- ohne Fehler, nur ohne Bewegung.
     */
    defaultViewTransition: true,
  });

  return router;
};
