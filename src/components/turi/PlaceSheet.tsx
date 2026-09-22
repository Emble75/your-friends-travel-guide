import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronUp, Navigation, Star, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import type { MapPlace } from "@/lib/maps.server";
import { ensureLocalPlace } from "@/lib/place-sync";
import { directionsUrl, getErrorMessage } from "@/lib/turi";
import { distanceLabel, metersBetween } from "@/lib/geo";
import { tap } from "@/lib/native";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
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
/*
 * Die beiden Hoehen des Panels.
 *
 * Sie sind FEST. Eine Zeit lang haing die kleine Hoehe davon ab, ob es
 * Fotos gab -- und genau daran ist die erste Fassung gescheitert: Der
 * gesetzte Wert passte dann nicht mehr zu den erlaubten, und das Panel
 * sprang auf die groesste Hoehe. Beide Werte muessen immer in der
 * Liste stehen, sonst faellt das Bauteil zurueck.
 *
 * 460 Pixel sind so gewaehlt, dass Kopf, Note und der "Review"-Knopf
 * VOLLSTAENDIG stehen und die erste Bewertung darunter etwa zur
 * Haelfte hereinragt. Das Anschneiden ist die ganze Erklaerung: Man
 * sieht, dass da noch etwas ist, und zieht.
 */
const PEEK = "460px";
/*
 * 96 statt 92 Prozent: Bei zwei Bewertungen mit Fotos reichte die
 * Hoehe nicht, die zweite Karte blieb angeschnitten. Die vier Prozent
 * sind auf einem Telefon rund dreissig Pixel -- genug, damit die
 * letzte Karte vollstaendig steht.
 */
const FULL = 0.96;

export type SheetTarget =
  | { kind: "google"; place: MapPlace }
  | { kind: "local"; id: string; name: string; lat: number; lng: number };

export function PlaceSheet({
  target,
  onClose,
  myPos,
  onlyUserId = null,
}: {
  target: SheetTarget | null;
  onClose: () => void;
  myPos: { lat: number; lng: number } | null;
  /*
   * Auf der Karte EINER Person zeigt das Panel nur deren Bewertung.
   *
   * Ohne das widersprach sich die Ansicht: Der Pin trug die Note dieser
   * Person (die Abfrage der Karte filtert auf ihre user_id), das Panel
   * darunter listete aber alles, was der eigene Kreis zu dem Ort
   * geschrieben hat -- inklusive der eigenen Bewertung. Auf "seiner"
   * Karte gehoert seine Bewertung, sonst nichts.
   *
   * Auf der Discover-Karte bleibt es leer: Dort ist die Sammlung der
   * Meinungen genau der Zweck.
   */
  onlyUserId?: string | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState<string | number | null>(PEEK);
  // Gleicher Schluessel wie in ReviewCard -- der Wert wird geteilt.
  // Ob das Panel hochgezogen ist -- entscheidet ueber Ziehsperre und
  // Schliessverhalten.
  const expanded = snap === FULL;

  const { data: me } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: 5 * 60_000,
  });

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
    queryKey: ["map-place-reviews", cacheKey, onlyUserId],
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
        /*
         * ALLE Bewertungen, auch die eigene.
         *
         * Frueher war die eigene ausgeschlossen, mit der Begruendung:
         * Der Kern der App ist, was ANDERE denken. Das stimmt fuer den
         * Durchschnitt -- aber nicht fuer die Liste. Auf der eigenen
         * Karte steht der Pin ja genau fuer die eigene Bewertung, und
         * das Panel meldete dazu "keine Bewertungen" und zeigte weder
         * Text noch Fotos.
         *
         * Getrennt wird jetzt erst bei der Anzeige: eigene oben, die des
         * Kreises darunter, und der Durchschnitt zaehlt weiterhin nur
         * den Kreis.
         */
        (() => {
          const q = supabase.from("reviews").select(reviewSelect).eq("place_id", local.id);
          return (onlyUserId ? q.eq("user_id", onlyUserId) : q).order("created_at", {
            ascending: false,
          });
        })(),
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

  const allReviews = (data?.reviews ?? []) as unknown as ReviewWithRelations[];
  /*
   * Auf einer Personenkarte gibt es nichts aufzuteilen -- es ist ohnehin
   * nur eine Person. Die Trennung "eigene oben, Kreis darunter" gilt nur
   * auf der Discover-Karte, wo beides zusammenkommt.
   */
  const solo = !!onlyUserId;
  const myReview = solo ? null : (allReviews.find((r) => r.user_id === me) ?? null);
  // Der Durchschnitt zaehlt auf der Discover-Karte NUR den Kreis: Die
  // eigene Note wuerde die Empfehlung der anderen verfaelschen.
  const reviews = solo ? allReviews : allReviews.filter((r) => r.user_id !== me);

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

  /*
   * Wessen Note im Kasten steht. Auf einer Personenkarte ist das ihr
   * Name -- "3 from your circle" waere dort schlicht falsch.
   */
  const soloAuthor = solo
    ? (allReviews[0]?.profiles?.display_name ?? allReviews[0]?.profiles?.username ?? null)
    : null;
  const ratingNote = solo
    ? onlyUserId === me
      ? "your rating"
      : soloAuthor
        ? `${soloAuthor}'s rating`
        : "their rating"
    : `${reviews.length} from your circle`;

  /*
   * Die Datenbank-id des Ortes. Ein eigener Pin kennt sie bereits; ein
   * Google-Ort wird bei Bedarf angelegt -- aber erst, wenn der Nutzer
   * wirklich etwas tut (bewerten, merken), nicht schon beim Ansehen.
   */
  /*
   * Jeder neue Ort beginnt klein. Ohne das bliebe das Panel
   * hochgefahren, wenn man es bei einem Ort hochgezogen, geschlossen
   * und den naechsten angetippt hat.
   */
  useEffect(() => {
    if (target) setSnap(PEEK);
  }, [cacheKey, target]);

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
    <Drawer
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      snapPoints={[PEEK, FULL]}
      activeSnapPoint={snap}
      /*
       * Ein Wisch nach unten schliesst -- auch aus der vollen Hoehe.
       *
       * Standardmaessig faehrt das Panel erst eine Stufe herunter und
       * erst der zweite Wisch schliesst es. Zwei Bewegungen fuer "weg
       * damit" sind eine zu viel; wer den Ort wieder klein sehen will,
       * tippt den Pin erneut an.
       *
       * Der Griff greift nur bei ZIEHEN: Beim Oeffnen setzen wir die
       * kleine Hoehe selbst (siehe Effekt oben), nicht ueber diesen Weg.
       */
      setActiveSnapPoint={(next) => {
        if (snap === FULL && next === PEEK) {
          onClose();
          return;
        }
        setSnap(next);
      }}
      // Der Hintergrund darf NICHT zurueckskalieren: Dahinter liegt die
      // Karte, und eine schrumpfende Karte sieht aus wie ein Fehler.
      shouldScaleBackground={false}
    >
      {/*
        svh statt dvh -- und das ist auf dem Telefon der Unterschied
        zwischen "laesst sich wegschieben" und "haengt".

        dvh ist die AKTUELLE Hoehe des sichtbaren Bereichs. In Safari
        wandert die: Beim Oeffnen der Seite ist die Adressleiste noch
        gross, bei der ersten Wischbewegung klappt sie zusammen, und die
        Hoehe waechst -- mitten in der Geste. Das Panel rechnet seine
        Rastpunkte aber aus der Hoehe beim Oeffnen. Aendert sie sich
        waehrend des Ziehens, landet die Bewegung woanders als der
        Finger, und der Wisch verpufft.

        svh ist die KLEINSTE Hoehe (Adressleiste ausgeklappt) und aendert
        sich nie. Die Rechnung bleibt damit ueber die ganze Geste gueltig.
      */}
      <DrawerContent className="h-[96svh] rounded-t-3xl border-0 bg-card">
        {/*
          Auf dem Telefon aendert die Breitenbegrenzung nichts; auf einem
          breiten Bildschirm verhindert sie, dass Titel und Knoepfe an
          die gegenueberliegenden Raender wandern.
        */}
        <DrawerHeader className="mx-auto w-full max-w-md shrink-0 px-6 pb-2 text-left">
          <DrawerTitle className="flex items-center gap-3">
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
          </DrawerTitle>
        </DrawerHeader>

        {/*
          overscroll-contain: Ohne das zieht eine Wischbewegung, die am
          Ende der Liste ankommt, gleich das ganze Panel mit nach unten --
          das Scrollen fuehlte sich dadurch unberechenbar an.

          Der Fussabstand rechnet die sichere Zone unten mit, sonst steckt
          die letzte Bewertung halb hinter dem Rand des Telefons.
        */}
        <div
          /*
           * Ziehsperre NUR im hochgefahrenen Zustand.
           *
           * Oben gibt es etwas zu scrollen, und dort war die Grenze
           * zwischen "scrollen" und "schliessen" das Problem: Wer nach
           * oben wischte und am Listenanfang ankam, zog mit derselben
           * Bewegung das Panel herunter.
           *
           * In der kleinen Hoehe gibt es nichts zu scrollen -- dort
           * MUSS die Flaeche ziehbar bleiben, sonst bekommt man das
           * Panel nicht mehr weg. Genau das war nach der ersten Fassung
           * der Fall: Die Sperre galt immer, und der Inhalt bedeckte
           * fast die ganze kleine Hoehe.
           */
          {...(expanded ? { "data-vaul-no-drag": "" } : {})}
          /*
           * Gescrollt wird NUR im hochgefahrenen Zustand.
           *
           * Vorher stand hier immer overflow-y-auto. In der kleinen
           * Hoehe ragt die erste Bewertung absichtlich herein -- die
           * Flaeche war also scrollbar, und Scrollen und Ziehen
           * stritten sich um dieselbe Wischbewegung: Wer ein Stueck
           * gescrollt hatte, schob mit dem naechsten Wisch nur wieder
           * nach oben statt das Panel wegzuschieben. Erst der zweite
           * oder dritte Versuch traf. Genau das war gemeint, als hier
           * stand "in der kleinen Hoehe gibt es nichts zu scrollen" --
           * nur stand es als Kommentar da und nicht im Code.
           *
           * Der Anschnitt bleibt: Er sagt weiterhin "hier ist mehr",
           * und der Weg dorthin ist das Hochziehen.
           */
          className={`mx-auto min-h-0 w-full max-w-md flex-1 space-y-3 overscroll-contain px-6 ${
            expanded ? "overflow-y-auto" : "overflow-hidden"
          }`}
          style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}
        >
          {distance ? (
            <p className="turi-meta text-xs text-muted-foreground">{distance} away</p>
          ) : null}

          {avg !== null ? (
            <div className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
              <span className="font-display text-2xl font-bold">{avg.toFixed(1)}</span>
              <Stars value={avg} size={16} />
              <span className="ml-auto text-xs text-muted-foreground">{ratingNote}</span>
            </div>
          ) : null}

          {/*
            Die Handlung steht UEBER den Bewertungen: Sie soll
            vollstaendig im Bild stehen, waehrend die Bewertungen
            angeschnitten sein duerfen.
          */}
          <Button disabled={busy} onClick={() => go("review")} className="h-12 w-full rounded-2xl">
            <Star size={18} className="mr-1" /> Review
          </Button>

          {/*
            Die Bewertungen selbst -- dieselben Karten wie im Feed, nur
            ohne den Ortsnamen, der ja oben steht. Frueher lagen sie
            hinter einem Knopf auf einer eigenen Seite; jetzt sind sie
            hier, und der angeschnittene erste Eintrag sagt, dass man
            ziehen kann.
          */}
          {myReview || reviews.length > 0 ? (
            <div className="space-y-4 pt-1">
              {myReview ? (
                <>
                  <h2 className="turi-eyebrow px-1">Your review</h2>
                  <ReviewCard review={myReview} showPlace={false} />
                </>
              ) : null}
              {reviews.length > 0 ? (
                <>
                  {myReview ? <h2 className="turi-eyebrow px-1">From your circle</h2> : null}
                  {reviews.map((r) => (
                    <ReviewCard key={r.id} review={r} showPlace={false} />
                  ))}
                </>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-5">
              <Users size={18} className="shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground">
                {solo
                  ? "No review to show for this place."
                  : data?.myRating != null
                    ? `You rated this ${data.myRating.toFixed(1)}. No friends have reviewed it yet.`
                    : "No reviews from friends yet — be the first."}
              </p>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
