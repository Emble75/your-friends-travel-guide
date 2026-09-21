import { useState } from "react";
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
 * Die kleine Hoehe -- zwei Werte, je nachdem ob es Fotos gibt.
 *
 * 300 Pixel waren zu knapp: Der "Review"-Knopf stand nur zur Haelfte
 * im Bild. Eine Handlungsaufforderung, die man anschneidet, sieht aus
 * wie ein Fehler.
 *
 * Mit Fotos ist die Hoehe so gewaehlt, dass der Knopf VOLLSTAENDIG
 * steht und der Fotostreifen darunter zu etwa zwei Dritteln
 * hereinragt. Dieses Anschneiden ist Absicht und das Gegenteil des
 * Fehlers oben: Es sagt "hier geht es weiter", ohne ein Wort zu
 * brauchen.
 */
const PEEK_BARE = "330px";
const PEEK_PHOTOS = "410px";
const FULL = 0.92;

/*
 * Die Vorschau zu einem Ort -- das Panel, das von unten hereinfaehrt.
 *
 * Sie stand lange nur in der Hauptkarte. Auf den Karten von Profilen
 * und Ordnern fuehrte ein Tipp auf einen Pin dagegen sofort auf die
 * vollstaendige Ortsseite -- also weg von der Karte, mit Neuaufbau beim
 * Zurueckkommen. Auf einer Karte will man aber meist nur kurz
 * nachsehen ("was ist das, wie ist es bewertet, hat es offen?") und
 * dann den naechsten Pin antippen. Genau dafuer ist diese Vorschau da,
 * und deshalb steht sie jetzt an einer Stelle fuer alle Karten.
 */

/*
 * Woher der Ort im unteren Panel stammt.
 *
 * "google": ein Symbol aus Googles eigener Karte oder ein Suchtreffer --
 * der Ort existiert bei uns vielleicht noch gar nicht und wird erst beim
 * Bewerten oder Merken angelegt (ensureLocalPlace).
 *
 * "local": einer unserer eigenen Pins. Der Ort steht bereits in unserer
 * Datenbank, seine id ist bekannt. Wichtig: ueber die Google-Kennung
 * darf hier NICHT nachgeschlagen werden -- von Hand angelegte Orte
 * ("Can't find it?") haben keine, und genau die wuerden sonst wieder
 * durchs Raster fallen.
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
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState<number | string | null>(PEEK_BARE);
  /*
   * "view" zeigt den Ort, "review" das Formular -- im SELBEN Panel.
   *
   * Ein zweites Panel darueber waere die naheliegende Loesung gewesen,
   * fuehrt aber zu uebereinandergestapelten Flaechen, die man einzeln
   * wegwischen muss. Der Wechsel des Inhalts fuehlt sich an wie das
   * Hochziehen: Es bleibt dieselbe Flaeche, sie zeigt nur etwas
   * anderes.
   */
  const [mode, setMode] = useState<"view" | "review">("view");
  const [localId, setLocalId] = useState<string | null>(null);
  const expanded = snap === FULL;

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

  const peek = photoPaths.length > 0 ? PEEK_PHOTOS : PEEK_BARE;
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

  function close() {
    setSnap(PEEK_BARE);
    setMode("view");
    onClose();
  }

  /*
   * Ins Formular wechseln -- ohne die Karte zu verlassen.
   *
   * Der Ort muss dafuer in unserer Datenbank stehen. Bei einem
   * Google-Symbol ist er das noch nicht; er wird hier angelegt, waehrend
   * das Panel schon hochfaehrt.
   */
  async function startReview() {
    if (!target) return;
    setBusy(true);
    setSnap(FULL);
    try {
      const id = await resolveLocalId();
      if (!id) return;
      setLocalId(id);
      setMode("review");
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not open place"));
      setSnap(PEEK_BARE);
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
      onOpenChange={(open) => !open && close()}
      snapPoints={[peek, FULL]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      // Der Hintergrund soll NICHT zurueckskalieren: Dahinter liegt die
      // Karte, und eine schrumpfende Karte sieht aus wie ein Fehler.
      shouldScaleBackground={false}
    >
      <DrawerContent className="h-[92dvh] rounded-t-3xl border-0 bg-card">
        {/*
          Kopf neu gefasst: Name und Adresse tragen die Zeile, die beiden
          Nebenhandlungen sitzen als runde Symbolknoepfe rechts daneben.
          Vorher waren beide breite Balken untereinander -- "Take me there"
          bekam damit dasselbe Gewicht wie das Bewerten, obwohl es aus der
          App HERAUS fuehrt. Das gehoert nicht in die erste Reihe.
        */}
        <DrawerHeader className="shrink-0 text-left">
          {/*
            pr-8 haelt die Ecke fuer das Schliessen-X frei. Ohne das
            ueberlappten beide: das X sitzt 16px vom Rand, der Inhalt
            beginnt bei 24px -- der Merken-Knopf lag damit teilweise
            darunter, und beide waren schwer zu treffen.
          */}
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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-8">
          {/*
            Die beiden praktischen Fragen zuerst: Hat es offen, und wie
            weit ist es? Sie entscheiden, ob man ueberhaupt weiterliest --
            eine 4,8 nuetzt nichts, wenn der Laden seit zwei Stunden zu
            ist. Fehlt eine der Angaben (kein Standort erlaubt, keine
            Zeiten hinterlegt), faellt sie still weg.
          */}
          {distance ? (
            <p className="turi-meta text-xs text-muted-foreground">{distance} away</p>
          ) : null}

          {/*
            In der kleinen Hoehe NUR der Durchschnitt. Angerissene
            Bewertungskarten waeren beides halb: zu wenig zum Lesen, zu
            viel fuer einen Blick. Die ganzen stehen eine Hoehe weiter
            oben.
          */}
          {avg !== null ? (
            <button
              type="button"
              onClick={() => !expanded && setSnap(FULL)}
              className="turi-tap flex w-full items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-left"
            >
              <span className="font-display text-2xl font-bold">{avg.toFixed(1)}</span>
              <Stars value={avg} size={16} />
              <span className="ml-auto text-xs text-muted-foreground">
                {reviews.length} from your circle
              </span>
              {!expanded ? (
                <ChevronUp size={16} className="shrink-0 text-muted-foreground" />
              ) : null}
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-4">
              <Users size={18} className="text-primary" />
              {/*
                Die eigene Note wird hier benannt, statt sie zu verschweigen:
                auf "My Map" zeigt der Pin genau sie, und ein Panel, das
                daneben "keine Bewertungen" meldet, widerspraeche dem Pin.
              */}
              <p className="text-xs text-muted-foreground">
                {data?.myRating != null
                  ? `You rated this ${data.myRating.toFixed(1)}. No friends have reviewed it yet.`
                  : "No reviews from friends for this place yet."}
              </p>
            </div>
          )}

          {/*
            Nur noch EIN Knopf. Vorher standen hier zwei, und der zweite
            wechselte beim Hochziehen die Aufschrift -- das war Unruhe
            fuer eine Handlung, die man ohnehin ueber die Notenflaeche
            oder den Ziehgriff erreicht. Die Bewertungen holt man sich
            durch Hochziehen, nicht durch einen Knopf.
          */}
          <div className="flex gap-2 pt-1">
            <Button disabled={busy} onClick={startReview} className="h-12 flex-1 rounded-2xl">
              <Star size={18} className="mr-1" /> Review
            </Button>
          </div>

          {/*
            Der Fotostreifen steht UNTER dem Knopf, nicht darueber: Die
            Handlung soll vollstaendig im Bild stehen, die Fotos duerfen
            angeschnitten sein. Ein Tipp darauf faehrt das Panel hoch,
            wo die Bilder in ihren Bewertungen stehen.
          */}
          {photoPaths.length > 0 && !expanded ? (
            <div className="-mx-4 overflow-x-auto px-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max gap-2">
                {photoPaths.map((path, i) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setSnap(FULL)}
                    aria-label="Show all reviews"
                    className="turi-tap size-28 shrink-0 overflow-hidden rounded-2xl bg-muted"
                  >
                    {photoUrls?.[i] ? (
                      <img src={photoUrls[i]!} alt="" className="size-full object-cover" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/*
            Die Bewertungen werden erst geladen und gezeichnet, wenn das
            Panel oben steht -- in der kleinen Hoehe waeren es Fotos, die
            niemand sieht.
          */}
          {expanded ? (
            <div className="space-y-4 pt-2">
              <h2 className="turi-eyebrow px-1">From your circle</h2>
              {reviews.map((r) => (
                <ReviewCard key={r.id} review={r} showPlace={false} />
              ))}
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
