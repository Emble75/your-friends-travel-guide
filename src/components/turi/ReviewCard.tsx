import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  ImagePlus,
  MapPin,
  MoreVertical,
  Navigation,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Stars, StarPicker } from "./Stars";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "./PlaceList";
import { normalizeCategory } from "@/lib/categories";
import {
  FolderPicker,
  folderChoiceFor,
  resolveFolderChoice,
  type FolderChoice,
} from "./FolderPicker";
import { UserAvatar } from "./UserAvatar";
import { ReportDialog } from "./ReportDialog";
import { supabase } from "@/integrations/supabase/app-client";
import { compressImage, directionsUrl, getErrorMessage, signedUrls, timeAgo } from "@/lib/turi";
import { isNative, tap, takePhoto } from "@/lib/native";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export type ReviewWithRelations = {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
  user_id: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
  places: {
    id: string;
    name: string;
    city: string;
    category: string;
    lat: number | null;
    lng: number | null;
    google_place_id: string | null;
  } | null;
  review_images: { id: string; image_url: string; position: number }[];
  trip_folder_id: string | null;
};

type ExistingImage = { id: string; image_url: string; position: number };

export function ReviewCard({
  review,
  showPlace = true,
}: {
  review: ReviewWithRelations;
  showPlace?: boolean;
}) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editRating, setEditRating] = useState(review.rating);
  const [editText, setEditText] = useState(review.text ?? "");
  const [editExistingImages, setEditExistingImages] = useState<ExistingImage[]>([]);
  const [editNewFiles, setEditNewFiles] = useState<File[]>([]);
  const [editFolder, setEditFolder] = useState<FolderChoice>(
    folderChoiceFor(review.trip_folder_id),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: me } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: 5 * 60_000,
  });
  const isOwn = me === review.user_id;

  /*
   * Gegen null abgesichert: Fehlt die Bildbeziehung in der Antwort --
   * etwa weil die Abfrage sie nicht mitgeholt hat --, stuerzte hier das
   * Rendern ab. Und da diese Karte im Feed wie auf der Ortsseite steht,
   * riss ein einziger solcher Datensatz die ganze Seite mit sich
   * ("This page couldn't be loaded"), statt nur ohne Fotos zu erscheinen.
   */
  const sortedImages = (review.review_images ?? []).slice().sort((a, b) => a.position - b.position);
  const paths = sortedImages.map((i) => i.image_url);

  const { data: urls } = useQuery({
    queryKey: ["review-images", review.id, paths.join(",")],
    queryFn: () => signedUrls("review-photos", paths),
    enabled: paths.length > 0,
  });

  const urlByImageId = new Map(sortedImages.map((img, i) => [img.id, urls?.[i] ?? null]));
  const editNewPreviews = editNewFiles.map((f) => URL.createObjectURL(f));
  const totalEditPhotos = editExistingImages.length + editNewFiles.length;

  const profile = review.profiles;
  const place = review.places;

  /*
   * Die eigene Merkliste -- EINE Abfrage fuer alle Karten.
   *
   * Der Feed zeigt viele Karten gleichzeitig. Wuerde jede ihren eigenen
   * Merk-Zustand laden, waeren das ebenso viele Anfragen fuer dieselbe
   * Information. Unter einem gemeinsamen Schluessel holt React Query sie
   * genau einmal; jede Karte liest daraus nur ihren Ort heraus.
   */
  const { data: savedIds } = useQuery({
    queryKey: ["my-saved-place-ids"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return new Set<string>();
      const { data } = await supabase.from("saved_places").select("place_id").eq("user_id", uid);
      return new Set((data ?? []).map((r) => r.place_id));
    },
  });
  const isSaved = !!place && !!savedIds?.has(place.id);

  async function toggleSave() {
    if (!place) return;
    void tap();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const { error } = isSaved
      ? await supabase.from("saved_places").delete().eq("user_id", uid).eq("place_id", place.id)
      : await supabase.from("saved_places").insert({ user_id: uid, place_id: place.id });
    if (error) {
      toast.error(getErrorMessage(error, "Action failed"));
      return;
    }
    // Die Listen, die denselben Zustand zeigen, muessen mitziehen.
    queryClient.invalidateQueries({ queryKey: ["my-saved-place-ids"] });
    queryClient.invalidateQueries({ queryKey: ["my-saved-places"] });
    queryClient.invalidateQueries({ queryKey: ["my-saved-places-map"] });
    queryClient.invalidateQueries({ queryKey: ["saved-in-view"] });
  }

  function openEdit() {
    setEditRating(review.rating);
    setEditText(review.text ?? "");
    setEditExistingImages(sortedImages);
    setEditNewFiles([]);
    setEditFolder(folderChoiceFor(review.trip_folder_id));
    setEditOpen(true);
  }

  async function onAddEditPhotoNative() {
    const maxNew = Math.max(0, 3 - editExistingImages.length);
    if (maxNew <= 0) return;
    const file = await takePhoto("prompt");
    if (file) setEditNewFiles((prev) => [...prev, file].slice(0, maxNew));
  }

  function onPickEditFiles(list: FileList | null) {
    if (!list) return;
    const maxNew = Math.max(0, 3 - editExistingImages.length);
    setEditNewFiles((prev) => [...prev, ...Array.from(list)].slice(0, maxNew));
  }

  async function saveEdit() {
    if (editRating < 1) {
      toast.error("Please give a star rating");
      return;
    }
    if (!me) return;
    setSaving(true);
    try {
      // Der Ordner wird hier mitgeschrieben -- bisher liess er sich nur
      // im Moment des Schreibens vergeben. Ein neuer Name legt den
      // Ordner an (resolveFolderChoice), ein gleichnamiger wird
      // wiederverwendet.
      const folderId = await resolveFolderChoice(editFolder, me);
      const { error } = await supabase
        .from("reviews")
        .update({ rating: editRating, text: editText.trim() || null, trip_folder_id: folderId })
        .eq("id", review.id);
      if (error) throw error;

      // Entfernte Fotos aufraeumen (Storage + DB-Zeile)
      const removedImages = sortedImages.filter(
        (img) => !editExistingImages.some((e) => e.id === img.id),
      );
      if (removedImages.length > 0) {
        await supabase.storage.from("review-photos").remove(removedImages.map((i) => i.image_url));
        const { error: delErr } = await supabase
          .from("review_images")
          .delete()
          .in(
            "id",
            removedImages.map((i) => i.id),
          );
        if (delErr) throw delErr;
      }

      // Neue Fotos hochladen
      if (editNewFiles.length > 0) {
        const startPosition = editExistingImages.length;
        for (let i = 0; i < editNewFiles.length; i++) {
          const compressed = await compressImage(editNewFiles[i]!, {
            maxDimension: 1600,
            quality: 0.8,
          });
          const ext = compressed.name.split(".").pop() ?? "jpg";
          const path = `${me}/${review.id}-edit-${Date.now()}-${i}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("review-photos")
            .upload(path, compressed, { upsert: true });
          if (upErr) throw upErr;
          const { error: imgErr } = await supabase
            .from("review_images")
            .insert({ review_id: review.id, image_url: path, position: startPosition + i });
          if (imgErr) throw imgErr;
        }
      }

      toast.success("Review updated");
      setEditOpen(false);
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteReview() {
    setDeleting(true);
    try {
      if (paths.length > 0) {
        // Best-effort: eigene Fotos dieser Bewertung im Storage entfernen.
        await supabase.storage.from("review-photos").remove(paths);
      }
      const { error } = await supabase.from("reviews").delete().eq("id", review.id);
      if (error) throw error;
      toast.success("Review deleted");
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not delete"));
    } finally {
      setDeleting(false);
    }
  }

  /*
   * Art des Ortes als Symbol -- dasselbe Zeichen, das auf der Karte am
   * Pin steht. So muss man es nur einmal lernen.
   */
  const category = normalizeCategory(place?.category);
  const CategoryIcon = CATEGORY_ICONS[category];
  const categoryWord = CATEGORY_LABELS[category].replace(/s$/, "");

  /*
   * Bearbeiten/Loeschen beziehungsweise Melden -- einmal beschrieben,
   * zweimal gesetzt: mit Foto oben rechts darauf, ohne Foto in der
   * Kopfzeile. Als Variable statt doppeltem Markup, damit die beiden
   * Fassungen nicht auseinanderlaufen koennen.
   */
  const actions = isOwn ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="turi-tap turi-hit flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label="More options"
        >
          <MoreVertical size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-2xl">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            openEdit();
          }}
        >
          <Pencil size={16} className="mr-2" />
          Edit
        </DropdownMenuItem>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
              <Trash2 size={16} className="mr-2" />
              Delete
            </DropdownMenuItem>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete review?</AlertDialogTitle>
              <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteReview}
                disabled={deleting}
                className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <ReportDialog reviewId={review.id} />
  );

  /*
   * overflow-hidden ist hier kein Detail, sondern die Bedingung dafuer,
   * dass das Bild ueberhaupt einen Rand bekommt: Ein randloses Foto in
   * einer Karte mit runden Ecken ragt sonst ueber genau diese Ecken
   * hinaus, und die Karte sieht aus, als waere sie kaputt. Mit der
   * Beschneidung wird die Kante der Karte zur Kante des Bildes.
   *
   * Das Foto steht OBEN, nicht unter dem Text. Es ist das Erste, was man
   * sieht und was einen anhalten laesst -- der Text erklaert danach,
   * warum.
   */
  return (
    <article className="turi-card turi-enter overflow-hidden">
      {/*
        Mit Foto liegen Person und Note AUF dem Bild, nicht darueber.
        Das spart eine ganze Zeile, bevor der Ortsname kommt -- und es
        ist die Anordnung, die beim Entwurf abgestimmt wurde. Ohne Foto
        gibt es nichts zum Darauflegen, dort bleibt die Zeile oben.
      */}
      {paths.length > 0 ? (
        <div className="relative">
          <PhotoStrip urls={urls ?? paths.map(() => null)} placeName={place?.name ?? "place"} />

          {/* Verlauf nur oben: er traegt Name und Zeit, sonst nichts. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-foreground/55 to-transparent" />

          <div className="absolute inset-x-3 top-3 flex items-center gap-2.5">
            <Link to="/u/$username" params={{ username: profile?.username ?? "" }}>
              <UserAvatar
                avatarPath={profile?.avatar_url}
                name={profile?.display_name ?? profile?.username}
                className="size-9 border-2 border-card/90"
              />
            </Link>
            <Link
              to="/u/$username"
              params={{ username: profile?.username ?? "" }}
              className="min-w-0 flex-1 truncate text-sm font-semibold text-background drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]"
            >
              {profile?.display_name || profile?.username} · {timeAgo(review.created_at)}
            </Link>
          </div>

          {/*
            Der Stempel sitzt auf der Kante und ist leicht gedreht --
            das eine Zeichen, das Turi ueberall wiederholt. Gerade
            ausgerichtet saehe er aus wie ein Etikett, schief wie
            etwas, das jemand daraufgedrueckt hat.
          */}
          <div className="absolute right-2 top-3 text-background drop-shadow-[0_1px_8px_rgba(0,0,0,0.6)]">
            {actions}
          </div>

          <span className="font-display absolute -bottom-4 right-4 flex size-12 -rotate-6 items-center justify-center rounded-2xl bg-map-pin text-lg font-semibold tracking-tight text-background shadow-card">
            {review.rating.toFixed(1)}
          </span>
        </div>
      ) : null}

      {/*
        Mit Foto etwas mehr Luft oben: Der Stempel haengt ueber die
        Bildkante herunter und braucht die Stelle, an der sonst sofort
        der Ortsname beginnt. Nicht mehr als noetig -- mit den kleineren
        Ueberschriften stand sonst eine Luecke zwischen Bild und Name,
        die wie ein Fehler aussah.
      */}
      <div className={`p-4 ${paths.length > 0 ? "pt-7" : ""}`}>
        <div className={`flex items-center gap-3 ${paths.length > 0 ? "hidden" : ""}`}>
          <Link to="/u/$username" params={{ username: profile?.username ?? "" }}>
            <UserAvatar
              avatarPath={profile?.avatar_url}
              name={profile?.display_name ?? profile?.username}
            />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              to="/u/$username"
              params={{ username: profile?.username ?? "" }}
              className="block truncate text-sm font-semibold"
            >
              {profile?.display_name || profile?.username}
            </Link>
            <p className="turi-meta truncate text-xs text-muted-foreground">
              @{profile?.username} · {timeAgo(review.created_at)}
            </p>
          </div>
          {/*
          Die Note als Stempel, nicht als Sternenreihe.

          Fuenf Sterne sind fuenf Formen, die man zaehlen muss, um eine
          Zahl zu bekommen -- und sie wiederholen sich in jeder Karte.
          Eine Ziffer in der Serife liest man sofort, und sie ist das
          Zeichen, das Turi ueberall benutzt: auf den Pins, im Panel,
          hier.
        */}
          <span className="font-display shrink-0 rounded-xl bg-map-pin px-2.5 py-1.5 text-base font-semibold leading-none tracking-tight text-background">
            {review.rating.toFixed(1)}
          </span>
          {paths.length > 0 ? null : actions}
        </div>

        {showPlace && place ? (
          /*
          Ortszeile mit den beiden Nebenhandlungen daneben -- dieselben
          runden Symbolknoepfe wie auf der Ortsseite und im Kartenpanel.
          Vorher fuehrte von hier nur ein Weg zur Ortsseite; merken oder
          sich hinfuehren lassen ging erst einen Schritt spaeter.
        */
          <div className="mt-3">
            {/*
            Der Ortsname ist die Ueberschrift der Karte, nicht ein Chip
            darin. Vorher stand er klein in einer grauen Pille -- damit
            sah jede Bewertung aus wie ein Datensatz. In der Serife und
            in dieser Groesse ist er das, was er ist: ein Name.
          */}
            <Link
              to="/place/$placeId"
              params={{ placeId: place.id }}
              className="font-display block text-[1.4rem] font-semibold leading-[1.12] tracking-[-0.02em] text-foreground"
            >
              {place.name}
            </Link>

            <div className="mt-2 flex items-center gap-2">
              <CategoryIcon size={16} className="shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {[categoryWord, place.city].filter(Boolean).join(" in ")}
              </span>

              <button
                type="button"
                onClick={toggleSave}
                aria-label={isSaved ? "Remove from want to go" : "Add to want to go"}
                aria-pressed={isSaved}
                className={`turi-tap flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isSaved
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                <Bookmark size={15} fill={isSaved ? "currentColor" : "none"} />
              </button>

              <a
                href={directionsUrl({
                  name: place.name,
                  city: place.city,
                  lat: place.lat,
                  lng: place.lng,
                  googlePlaceId: place.google_place_id,
                })}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Directions in Google Maps"
                className="turi-tap flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground"
              >
                <Navigation size={15} />
              </a>
            </div>
          </div>
        ) : null}

        {/*
        Der Text ist ein Zitat, kein Datenfeld -- also in der Serife und
        in Anfuehrungszeichen. Es ist das, was eine Person tatsaechlich
        gesagt hat, und der einzige Grund, warum man einer Empfehlung
        glaubt.
      */}
        {review.text ? (
          <p className="font-display mt-3 whitespace-pre-wrap text-[1.05rem] leading-[1.42] text-foreground">
            “{review.text}”
          </p>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>Edit review</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-2">
            <StarPicker value={editRating} onChange={setEditRating} />
          </div>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="How was it?"
            rows={5}
            className="rounded-2xl"
          />

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Photos (max. 3)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {editExistingImages.map((img) => (
                <div
                  key={img.id}
                  className="relative aspect-square overflow-hidden rounded-2xl bg-muted"
                >
                  {urlByImageId.get(img.id) ? (
                    <img
                      src={urlByImageId.get(img.id)!}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setEditExistingImages((prev) => prev.filter((p) => p.id !== img.id))
                    }
                    aria-label="Remove photo"
                    className="turi-hit absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {editNewFiles.map((_, i) => (
                <div
                  key={i}
                  className="relative aspect-square overflow-hidden rounded-2xl bg-muted"
                >
                  <img src={editNewPreviews[i]} alt="" className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setEditNewFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Remove photo"
                    className="turi-hit absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {totalEditPhotos < 3 ? (
                isNative() ? (
                  <button
                    type="button"
                    onClick={onAddEditPhotoNative}
                    className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-muted-foreground"
                  >
                    <ImagePlus size={22} />
                    <span className="text-2xs">Add</span>
                  </button>
                ) : (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-muted-foreground">
                    <ImagePlus size={22} />
                    <span className="text-2xs">Add</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => onPickEditFiles(e.target.files)}
                    />
                  </label>
                )
              ) : null}
            </div>
          </div>

          {/*
            Der Ordner steht bewusst hier unten, nach Note, Text und
            Fotos: Er ist Ordnung, nicht Inhalt. Wichtig ist, dass es ihn
            ueberhaupt gibt -- nach der Reise will man seine acht
            Lissabon-Bewertungen zusammenfassen, und bisher ging das nur
            im Moment des Schreibens.
          */}
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Folder</p>
            <FolderPicker value={editFolder} onChange={setEditFolder} />
          </div>

          <DialogFooter>
            <Button onClick={saveEdit} disabled={saving} className="w-full rounded-2xl">
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

export const reviewSelect =
  "id, rating, text, created_at, user_id, trip_folder_id, profiles:profiles!reviews_user_id_fkey(username, display_name, avatar_url), places(id, name, city, category, lat, lng, google_place_id), review_images(id, image_url, position)";

/*
 * Die Fotos einer Bewertung -- eines nach dem anderen, zum Wischen.
 *
 * Vorher war es eine Komposition: ein Bild gross, zwei nebeneinander,
 * drei als Mosaik. Das sah aufgeraeumt aus, hatte aber zwei Nachteile,
 * die beim Benutzen auffallen. Erstens sieht man von jedem einzelnen
 * Bild nur einen Ausschnitt -- gerade bei Essen ist das der falsche
 * Teil. Zweitens kennt jeder die andere Geste: ein Bild, wischen, das
 * naechste. Eine Kollage muss man erst lesen.
 *
 * TECHNIK: Kein Karussell-Baustein, sondern waagerechtes Scrollen mit
 * Einrastpunkten (snap). Das ist das, was das Betriebssystem ohnehin
 * kann -- es fuehlt sich auf dem Telefon richtig an, braucht keine
 * zusaetzliche Bibliothek und funktioniert auch, wenn JavaScript
 * gerade beschaeftigt ist.
 *
 * Das Seitenverhaeltnis ist fest (4:3): Ohne das wuerde die Karte bei
 * jedem Wischen die Hoehe wechseln, und der Feed darunter huepfte mit.
 */
function PhotoStrip({ urls, placeName }: { urls: (string | null)[]; placeName: string }) {
  const [index, setIndex] = useState(0);

  /*
   * Quadratisch und randlos -- wie man es von Instagram kennt.
   *
   * Vorher: 4:3 und innerhalb des Karten-Innenabstands. Beides machte
   * das Bild klein, und klein ist bei einer Reise-App das Falscheste:
   * Das Foto IST die Empfehlung. Das Quadrat gibt jedem Motiv gleich
   * viel Flaeche -- hochkant wie quer.
   *
   * Keine eigenen Raender und keine eigene Rundung: Die Karte umgibt
   * das Bild und beschneidet es (overflow-hidden dort), deshalb ist die
   * Kante der Karte die Kante des Bildes.
   */
  return (
    <div>
      <div
        onScroll={(e) => {
          const el = e.currentTarget;
          // Aus der Scrollposition die Bildnummer ableiten -- genauer als
          // ein Zaehler, der beim schnellen Wischen hinterherhinkt.
          const next = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
          if (next !== index) setIndex(next);
        }}
        className="flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {urls.map((url, i) => (
          <div key={i} className="aspect-square w-full shrink-0 snap-center bg-muted">
            {url ? (
              <img
                src={url}
                alt={`Photo ${i + 1} of ${placeName}`}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            ) : null}
          </div>
        ))}
      </div>

      {/* Punkte nur, wenn es etwas zu wischen gibt. */}
      {urls.length > 1 ? (
        <div className="flex justify-center gap-1.5 py-2.5">
          {urls.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`size-1.5 rounded-full transition-colors ${
                i === index ? "bg-foreground" : "bg-border"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
