import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronUp, Navigation, Star, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import type { MapPlace } from "@/lib/maps.server";
import { ensureLocalPlace } from "@/lib/place-sync";
import { directionsUrl, getErrorMessage, signedUrls } from "@/lib/turi";
import { distanceLabel, metersBetween } from "@/lib/geo";
import { tap } from "@/lib/native";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Stars } from "./Stars";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "./ReviewCard";

/*
 * Zwei Hoehen statt zweier Seiten.
 *
 * Angetippt faehrt das Panel auf ein gutes Drittel -- Name, Note,
 * Entfernung, Merken, Route. "All reviews" schiebt es auf 92 % hoch,
 * wo die Bewertungen stehen. Oben bleibt ein Streifen Karte sichtbar:
 * Er sagt, dass man die Karte nie verlassen hat, und ist zugleich die
 * Flaeche zum Wegtippen.
 *
 * Vorher fuehrte "All reviews" auf eine eigene Seite. Damit verschwand
 * die Karte, wurde beim Zurueckkommen neu aufgebaut -- und genau das
 * las sich wie ein aufspringendes Fenster. Jetzt verschwindet nichts.
 * Nebenbei spart es bei jedem solchen Blick einen Kartenaufruf bei
 * Google.
 *
 * Was NICHT ins Panel wandert: das Schreiben einer Bewertung. Das ist
 * ein Formular mit Sternen, Text, Fotos und Ordnerwahl -- in einer
 * Flaeche, die man beim Tippen versehentlich wegwischt, waere das
 * aergerlich. Lesen im Panel, Schreiben auf einer Seite.
 */
/*
 * Die kleine Hoehe steht in PIXELN, nicht als Anteil des Bildschirms.
 *
 * Mit 34 % war sie auf manchen Geraeten zu niedrig: Die beiden Knoepfe
 * wurden mittendurch abgeschnitten. Ein Anteil raet, wie hoch der
 * Inhalt ist -- dieser Inhalt hat aber eine feste Hoehe (Kopf, Note,
 * Knopfreihe), und die passt in 330 Pixel auf jedem Geraet.
 */
export type SheetTarget =
  | { kind: "google"; place: MapPlace }
  | { kind: "local"; id: string; name: string; lat: number; lng: number };

export function PlaceSheet({
  target,
  onClose,
  myPos,
}: {
  target: SheetTarget | null;
  onClose: () => void;
  myPos: { lat: number; lng: number } | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  /*
   * Ein Panel, zwei Herkuenfte. Ein eigener Pin bringt seine Datenbank-id
   * schon mit -- dann entfaellt das Nachschlagen ueber die Google-Kennung,
   * das fuer von Hand angelegte Orte ohnehin ins Leere liefe.
   */
  const cacheKey = target
    ? target.kind === "local"
      ? `local:${target.id}`
      : `google:${target.place.googlePlaceId}`
    : null;

  const { data } = useQuery({
    queryKey: ["map-place-reviews", cacheKey],
    enabled: !!target,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      const local =
        target!.kind === "local"
          ? { id: target!.id }
          : (
              await supabase
                .from("places")
                .select("id")
                .eq("google_place_id", target!.place.googlePlaceId)
                .maybeSingle()
            ).data;
      if (!local)
        return { localId: null, place: null, reviews: [], isSaved: false, myRating: null };
      const [{ data: reviews }, savedRes, placeRes, mineRes] = await Promise.all([
        // Ohne die eigene Bewertung: dieses Panel ist durchgehend als
        // "from your circle" beschriftet, die eigene Meinung gehoert
        // nicht hinein -- weder in die Liste noch in den Durchschnitt.
        // Die vollstaendige Ansicht ("All reviews") zeigt sie separat.
        supabase
          .from("reviews")
          .select(reviewSelect)
          .eq("place_id", local.id)
          .neq("user_id", me ?? "")
          .order("created_at", { ascending: false }),
        me
          ? supabase
              .from("saved_places")
              .select("place_id")
              .eq("user_id", me)
              .eq("place_id", local.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        // Nur fuer eigene Pins noetig: Kategorie, Stadt und Google-Kennung
        // stehen dort nicht im Marker, kommen also aus der Datenbank.
        target!.kind === "local"
          ? supabase
              .from("places")
              .select("name, city, category, google_place_id")
              .eq("id", local.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        // Die eigene Bewertung getrennt holen. Sie gehoert nicht in den
        // Freundes-Durchschnitt, darf aber auch nicht verschwiegen werden:
        // auf "My Map" zeigt der Pin genau diese Note, und ein Panel, das
        // dazu "keine Bewertungen" meldet, widerspraeche dem Pin.
        me
          ? supabase
              .from("reviews")
              .select("rating")
              .eq("place_id", local.id)
              .eq("user_id", me)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        localId: local.id,
        place: placeRes.data,
        reviews: reviews ?? [],
        isSaved: !!savedRes.data,
        myRating: (mineRes.data as { rating: number } | null)?.rating ?? null,
      };
    },
  });

  /*
   * Was der Kopf des Panels anzeigt. Bei einem eigenen Pin steht der Name
   * sofort zur Verfuegung (aus dem Marker), Kategorie und Stadt kommen
   * nach -- so ist das Panel nie einen Moment lang leer.
   */
  const header = !target
    ? null
    : target.kind === "google"
      ? {
          name: target.place.name,
          subtitle: [target.place.category, target.place.address].filter(Boolean).join(" · "),
          lat: target.place.lat,
          lng: target.place.lng,
          googlePlaceId: target.place.googlePlaceId as string | null,
        }
      : {
          name: data?.place?.name ?? target.name,
          subtitle: [data?.place?.category, data?.place?.city].filter(Boolean).join(" · "),
          lat: target.lat,
          lng: target.lng,
          googlePlaceId: data?.place?.google_place_id ?? null,
        };

  /*
   * Die Oeffnungszeiten standen hier einmal ("Open - until 22:00").
   * Sie sind bewusst wieder entfernt: Google berechnet sie in seiner
   * teuersten Feldgruppe, und sie zwangen den Zwischenspeicher auf
   * kurze Fristen, weil sie im Gegensatz zu Namen und Koordinaten
   * verderben. Fuer eine Ortsvorschau war das ein schlechter Tausch --
   * die Note der Freunde ist der Grund, warum man hier hinschaut.
   *
   * Nebenwirkung, die mehr wert war als die Anzeige: Fuer eigene Pins
   * geht jetzt ueberhaupt keine Anfrage mehr an Google, wenn man die
   * Vorschau oeffnet.
   */
  const distance =
    myPos && header
      ? distanceLabel(metersBetween(myPos, { lat: header.lat, lng: header.lng }))
      : null;

  const reviews = (data?.reviews ?? []) as unknown as ReviewWithRelations[];

  /*
   * Die Fotos des Freundeskreises -- der eigentliche Grund, warum man
   * hier hinschaut.
   *
   * Sie kosten keine eigene Abfrage: Die Bewertungen bringen ihre
   * Bilder bereits mit. Nur die Zugriffslinks muessen geholt werden,
   * weil der Speicher nicht oeffentlich ist.
   */
  const photoPaths = reviews
    .flatMap((r) => (r.review_images ?? []).slice().sort((a, b) => a.position - b.position))
    .map((i) => i.image_url)
    .slice(0, 12);

  const { data: photoUrls } = useQuery({
    queryKey: ["place-sheet-photos", photoPaths.join(",")],
    enabled: photoPaths.length > 0,
    staleTime: 30 * 60_000,
    queryFn: () => signedUrls("review-photos", photoPaths),
  });

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

  /*
   * Die Datenbank-id des Ortes. Ein eigener Pin kennt sie bereits; ein
   * Google-Ort wird bei Bedarf angelegt -- aber erst, wenn der Nutzer
   * wirklich etwas tut (bewerten, merken), nicht schon beim Ansehen.
   */
  async function resolveLocalId() {
    if (!target) return null;
    return target.kind === "local" ? target.id : await ensureLocalPlace(target.place);
  }

  /*
   * Auf eine eigene Flaeche wechseln -- alle Bewertungen lesen oder
   * selbst eine schreiben.
   *
   * ZUERST schliessen, dann nachschlagen und wechseln: Waehrend das
   * Panel offen ist, sperrt es die Klicks dahinter, und bei einem Ort,
   * den es bei uns noch nicht gibt, legt resolveLocalId ihn zuerst an.
   * Stand das davor, blieb das Panel nach dem Tippen einen Moment
   * stehen -- genau das las sich wie ein aufspringendes Fenster.
   */
  async function go(to: "place" | "review") {
    if (!target) return;
    setBusy(true);
    onClose();
    try {
      const id = await resolveLocalId();
      if (!id) return;
      if (to === "place") navigate({ to: "/place/$placeId", params: { placeId: id } });
      else navigate({ to: "/new", search: { placeId: id } });
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not open place"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSave() {
    if (!target) return;
    void tap();
    setBusy(true);
    try {
      const id = await resolveLocalId();
      if (!id) return;
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) return;
      if (data?.isSaved) {
        await supabase.from("saved_places").delete().eq("user_id", me).eq("place_id", id);
      } else {
        await supabase.from("saved_places").insert({ user_id: me, place_id: id });
      }
      queryClient.invalidateQueries({ queryKey: ["map-place-reviews", cacheKey] });
      queryClient.invalidateQueries({ queryKey: ["saved-google-ids"] });
      queryClient.invalidateQueries({ queryKey: ["my-saved-places"] });
      // Die Pins selbst muessen mitziehen: merkt man einen Ort hier, muss
      // sein Lesezeichen sofort auf der Karte erscheinen.
      queryClient.invalidateQueries({ queryKey: ["my-saved-places-map"] });
      queryClient.invalidateQueries({ queryKey: ["saved-in-view"] });
    } catch (e) {
      toast.error(getErrorMessage(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!target} onOpenChange={(open) => !open && onClose()}>
      {/*
        ZURUECK ZUR EINFACHEN VORSCHAU.
        
        Zwischendurch war das hier ein ziehbares Panel mit zwei Hoehen:
        angetippt ein Ausschnitt, hochgezogen die Bewertungen. Die Idee
        war richtig -- so machen es Apple und Google Maps --, die
        Ausfuehrung nicht: Das Panel oeffnete sich auf voller Hoehe statt
        auf dem Ausschnitt, und auf breiten Bildschirmen zog sich alles
        auseinander. Ein Bauteil, das man nicht verlaesslich bekommt,
        ist schlechter als eines, das weniger kann.

        Was aus dem Versuch bleibt und gut war: der Fotostreifen der
        Freunde, die Formular-Kopfzeile beim Bewerten und die weichen
        Seitenuebergaenge. Die Vorschau selbst ist wieder das, was sie
        war -- kurz, ruhig, mit zwei klaren Wegen nach vorn.
      */}
      <SheetContent side="bottom" className="rounded-t-3xl border-0 pb-8">
        {/*
          Auf dem Telefon aendert das nichts; auf einem breiten
          Bildschirm verhindert es, dass Titel und Knoepfe an die
          gegenueberliegenden Raender wandern und die Zeile zerreisst.
        */}
        <div className="mx-auto w-full max-w-md">
          <SheetHeader className="text-left">
            {/*
              pr-8 haelt die Ecke fuer das Schliessen-X frei -- sonst
              liegt der Merken-Knopf teilweise darunter, und beide sind
              schwer zu treffen.
            */}
            <SheetTitle className="flex items-center gap-3 pr-8">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold">{header?.name}</span>
                <span className="turi-meta block truncate text-xs font-normal text-muted-foreground">
                  {header?.subtitle}
                </span>
              </span>

              <button
                type="button"
                onClick={toggleSave}
                disabled={busy}
                aria-label={data?.isSaved ? "Remove from want to go" : "Add to want to go"}
                aria-pressed={!!data?.isSaved}
                className={`turi-tap flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  data?.isSaved
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                <Bookmark size={18} fill={data?.isSaved ? "currentColor" : "none"} />
              </button>

              {header ? (
                <a
                  href={directionsUrl({
                    name: header.name,
                    lat: header.lat,
                    lng: header.lng,
                    googlePlaceId: header.googlePlaceId,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Directions in Google Maps"
                  className="turi-tap flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground"
                >
                  <Navigation size={18} />
                </a>
              ) : null}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            {distance ? (
              <p className="turi-meta text-xs text-muted-foreground">{distance} away</p>
            ) : null}

            {avg !== null ? (
              <div className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
                <span className="font-display text-2xl font-bold">{avg.toFixed(1)}</span>
                <Stars value={avg} size={16} />
                <span className="ml-auto text-xs text-muted-foreground">
                  {reviews.length} from your circle
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-4">
                <Users size={18} className="text-primary" />
                {/*
                  Die eigene Note wird benannt, statt sie zu verschweigen:
                  Auf der eigenen Karte zeigt der Pin genau sie, und ein
                  Panel, das daneben "keine Bewertungen" meldet,
                  widerspraeche dem Pin.
                */}
                <p className="text-xs text-muted-foreground">
                  {data?.myRating != null
                    ? `You rated this ${data.myRating.toFixed(1)}. No friends have reviewed it yet.`
                    : "No reviews from friends for this place yet."}
                </p>
              </div>
            )}

            {/*
              Die Fotos der Freunde -- der eigentliche Grund, warum man
              einen Ort antippt. Sie kosten keine eigene Abfrage: Die
              Bewertungen bringen ihre Bilder mit, es fehlten nur die
              Zugriffslinks.
            */}
            {photoPaths.length > 0 ? (
              <div className="-mx-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max gap-2">
                  {photoPaths.map((path, i) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => go("place")}
                      aria-label="Show all reviews"
                      className="turi-tap size-24 shrink-0 overflow-hidden rounded-2xl bg-muted"
                    >
                      {photoUrls?.[i] ? (
                        <img src={photoUrls[i]!} alt="" className="size-full object-cover" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex gap-2 pt-1">
              <Button
                disabled={busy}
                onClick={() => go("review")}
                className="h-12 flex-1 rounded-2xl"
              >
                <Star size={18} className="mr-1" /> Review
              </Button>
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => go("place")}
                className="h-12 flex-1 rounded-2xl"
              >
                All reviews
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
