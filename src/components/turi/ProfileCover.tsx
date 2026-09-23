import { useQuery } from "@tanstack/react-query";

import { signedUrl } from "@/lib/turi";

/*
 * Das Band hinter dem Profilbild.
 *
 * Es gibt dem Profil ein Gesicht -- ohne es sah jedes Konto aus wie
 * jedes andere.
 *
 * WARUM JETZT EIN BILD STATT EINER FARBE:
 *
 * Hier standen zuletzt zehn waehlbare Farben. Die Ueberlegung dahinter
 * war richtig -- das Band ist die einzige Flaeche, die dem Profil einer
 * Person wirklich gehoert, und vier Farben waren dafuer zu wenig. Nur
 * ist zehn genauso wenig, sobald der Anspruch "mein Profil" heisst: Eine
 * Farbe sagt nichts ueber jemanden, der Orte empfiehlt. Ein Foto aus
 * Lissabon schon.
 *
 * Ohne Bild bleibt es ruhig: ein helles Blau, abgeleitet aus der
 * Markenfarbe statt frei gegriffen. Es ist ein Hintergrund, keine
 * Aussage -- wer etwas zu zeigen hat, legt sein Bild darueber.
 */

/** Ohne Bild: helles Blau, aus der Markenfarbe abgeleitet. */
const PLAIN =
  "linear-gradient(160deg, color-mix(in oklab, var(--brand) 20%, white), color-mix(in oklab, var(--brand) 34%, white))";

export function ProfileCover({ imagePath }: { imagePath?: string | null }) {
  const { data: url } = useQuery({
    queryKey: ["profile-cover", imagePath],
    queryFn: () => signedUrl("avatars", imagePath),
    enabled: !!imagePath,
  });

  return (
    <div aria-hidden className="h-24 w-full overflow-hidden" style={{ backgroundImage: PLAIN }}>
      {url ? (
        /*
         * object-cover statt contain: Das Band ist ein Streifen, kein
         * Rahmen. Ein eingepasstes Bild haette Balken links und rechts --
         * und graue Balken sind genau das, was ein Titelbild nicht sein
         * darf.
         */
        <img src={url} alt="" className="size-full object-cover" />
      ) : null}
    </div>
  );
}
