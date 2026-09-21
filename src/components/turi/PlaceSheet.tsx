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
const FULL = 0.92;

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
  const [snap, setSnap] = useState<string | number | null>(PEEK);

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

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

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
      setActiveSnapPoint={setSnap}
      // Der Hintergrund darf NICHT zurueckskalieren: Dahinter liegt die
      // Karte, und eine schrumpfende Karte sieht aus wie ein Fehler.
      shouldScaleBackground={false}
    >
      <DrawerContent className="h-[92dvh] rounded-t-3xl border-0 bg-card">
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

        <div className="mx-auto min-h-0 w-full max-w-md flex-1 space-y-3 overflow-y-auto px-6 pb-8">
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
          {reviews.length > 0 ? (
            <div className="space-y-4 pt-1">
              {reviews.map((r) => (
                <ReviewCard key={r.id} review={r} showPlace={false} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-5">
              <Users size={18} className="shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground">
                {data?.myRating != null
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
