import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Folder,
  Map as MapIcon,
  Rows3,
  Share2,
  Star,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { getAppUrl, getErrorMessage } from "@/lib/turi";
import { share } from "@/lib/native";
import { AppHeader } from "@/components/turi/AppHeader";
import { EmptyState } from "@/components/turi/EmptyState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { PinMap } from "@/components/turi/PinMap";
import { type PlaceListItem } from "@/components/turi/PlaceList";
import { normalizeCategory } from "@/lib/categories";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "@/components/turi/ReviewCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/folder/$folderId")({
  /*
   * Feed oder Karte steht in der Adresse -- aus demselben Grund wie auf
   * Profilseiten: Tippt man auf der Karte einen Ort an, wird diese Seite
   * abgebaut und beim Zurueckkehren neu erzeugt. Ein Komponentenzustand
   * waere dann weg, und man landete wieder im Feed, obwohl man von der
   * Karte kam.
   */
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search["view"] === "map" ? { view: "map" as const } : {}),
    /*
     * Der Schluessel aus einem Teilen-Link. Wer die Seite damit
     * oeffnet, nimmt die Freigabe an -- siehe den Effekt in der
     * Komponente. Er steht nur einmal in der Adresse und wird danach
     * daraus entfernt.
     */
    ...(typeof search["k"] === "string" ? { k: search["k"] } : {}),
  }),
  head: () => ({
    meta: [{ title: "Folder – Turi" }],
  }),
  component: FolderPage,
});

/** Wo der Reiter-Umschalter kleben bleibt: direkt unter der Kopfzeile. */
const STICKY_TOP = "calc(3.5rem + env(safe-area-inset-top))";

/*
 * Die Hoehe der Karte -- ausgerechnet, nicht geschaetzt.
 *
 * Auf dieser Seite steht mehr ueber der Karte als auf dem eigenen
 * Profil: die klebende Kopfzeile (3.5rem plus sichere Zone) UND der
 * klebende Umschalter (3.75rem mit seinem Streifen). Eine feste Zahl
 * wie "82 % der Bildschirmhoehe" schob die Karte deshalb unten aus dem
 * Bild -- sie verschwand hinter der Navigationsleiste.
 *
 * Jetzt bleibt genau das uebrig, was zwischen beiden Enden frei ist;
 * das halbe rem am Schluss ist Luft, damit die Karte die Leiste nicht
 * beruehrt.
 */
/*
 * Die Vorschau ist bewusst flach.
 *
 * Sie war vorher fast bildschirmhoch -- aus der Zeit, als man in ihr
 * arbeiten musste. Seit ein Tipp die Karte bildschirmfuellend macht, ist
 * das nicht mehr noetig, und die Hoehe hatte einen Preis: Eine flache
 * Flaeche fasst die ganze Welt ohne graue Raender, eine hohe nicht.
 */
const MAP_HEIGHT = "h-[38dvh]";

function FolderPage() {
  const { folderId } = Route.useParams();
  const search = Route.useSearch();
  const view = "view" in search ? search.view : "feed";
  const shareKey = "k" in search ? search.k : undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [shareOpen, setShareOpen] = useState(false);

  /*
   * Einen Teilen-Link annehmen.
   *
   * Frueher legte der Besitzer die Freigabe direkt an -- der Ordner
   * erschien im Profil des Empfaengers, ohne dass der etwas getan
   * hatte. Bei einem Konto mit vielen Followern waere das ein
   * Briefkasten ohne Schloss gewesen.
   *
   * Jetzt entsteht die Freigabe genau hier: durch das Oeffnen des
   * Links. Der Schluessel verschwindet danach aus der Adresse, damit
   * er nicht in Verlauf, Lesezeichen oder beim naechsten Teilen
   * weiterwandert.
   */
  useEffect(() => {
    if (!shareKey) return;
    let active = true;
    void (async () => {
      const { error } = await supabase.rpc("redeem_folder_link", {
        p_folder_id: folderId,
        p_token: shareKey,
      });
      if (!active) return;
      if (error) toast.error(getErrorMessage(error, "This link is no longer valid"));
      await queryClient.invalidateQueries({ queryKey: ["trip-folder", folderId] });
      navigate({
        to: "/folder/$folderId",
        params: { folderId },
        search: {},
        replace: true,
        resetScroll: false,
      });
    })();
    return () => {
      active = false;
    };
  }, [shareKey, folderId, navigate, queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ["trip-folder", folderId],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      const [{ data: folder, error }, { data: reviews }] = await Promise.all([
        supabase.from("trip_folders").select("id, name, owner_id").eq("id", folderId).maybeSingle(),
        supabase
          .from("reviews")
          .select(reviewSelect)
          .eq("trip_folder_id", folderId)
          .order("created_at", { ascending: false }),
      ]);
      if (error) throw error;
      return {
        folder,
        isOwn: folder?.owner_id === me,
        reviews: (reviews ?? []) as unknown as ReviewWithRelations[],
      };
    },
  });

  /*
   * ENTFERNT: das automatische Scrollen zur Karte beim Umschalten.
   *
   * Es sollte den Weg abkuerzen, war in der Hand aber ein Ruck: Man
   * tippt oben auf einen Reiter und die Seite springt weg. Seit der
   * Kopf kuerzer ist, liegt die Karte ohnehin fast im Bild -- und wer
   * nach unten will, scrollt lieber selbst, als geschoben zu werden.
   */

  async function deleteFolder() {
    const { error } = await supabase.from("trip_folders").delete().eq("id", folderId);
    if (error) {
      toast.error(getErrorMessage(error, "Could not delete"));
      return;
    }
    toast.success("Folder deleted");
    queryClient.invalidateQueries();
    navigate({ to: "/me" });
  }

  if (isLoading) {
    return (
      <>
        <AppHeader title="Folder" showBack fallbackTo="/me" />
        <div className="app-shell py-4">
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      </>
    );
  }

  if (!data?.folder) {
    return (
      <>
        <AppHeader title="Folder" showBack fallbackTo="/me" />
        <div className="app-shell py-4">
          <EmptyState
            icon={Folder}
            title="Folder not found"
            text="Either it no longer exists, or it hasn't been shared with you."
          />
        </div>
      </>
    );
  }

  const { folder, isOwn, reviews } = data;

  /*
   * Die Orte des Ordners fuer die Karte.
   *
   * Bewusst OHNE eigene Abfrage: Die Bewertungen sind bereits geladen
   * und tragen ihren Ort mitsamt Koordinaten. Ein Ordner ist eine Reise
   * -- als Liste sieht man, was man geschrieben hat, als Karte sieht
   * man die Reise selbst. Das war bisher der fehlende halbe Teil.
   *
   * Mehrere Bewertungen zum selben Ort ergeben einen Pin mit dem
   * Durchschnitt; Orte ohne Koordinaten (von Hand angelegt) koennen
   * nicht auf die Karte und werden unten benannt.
   */
  const mapPlaces: PlaceListItem[] = (() => {
    const byId = new Map<string, NonNullable<(typeof reviews)[number]["places"]>>();
    const sums = new Map<string, { total: number; count: number }>();
    for (const r of reviews) {
      const p = r.places;
      if (!p) continue;
      byId.set(p.id, p);
      const entry = sums.get(p.id) ?? { total: 0, count: 0 };
      entry.total += r.rating;
      entry.count += 1;
      sums.set(p.id, entry);
    }
    return Array.from(byId.entries()).map(([id, place]) => ({
      id,
      name: place.name,
      city: place.city,
      category: normalizeCategory(place.category),
      lat: place.lat,
      lng: place.lng,
      rating: sums.get(id)!.total / sums.get(id)!.count,
      // Siehe Profilkarte: "1 friend" waere hier ueberall dasselbe.
      friends: 0,
      saved: false,
    }));
  })();

  const placedCount = mapPlaces.filter((p) => p.lat != null && p.lng != null).length;

  return (
    <>
      <AppHeader title={folder.name} showBack fallbackTo="/me" />
      <div className="app-shell space-y-4 py-4">
        {isOwn ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 rounded-2xl"
              onClick={() => setShareOpen(true)}
            >
              <Share2 size={16} className="mr-2" /> Share
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" className="rounded-2xl">
                  <Trash2 size={16} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete folder?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The reviews themselves stay intact but lose their folder assignment and are no
                    longer shared.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={deleteFolder}
                    className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}

        {reviews.length === 0 ? (
          <EmptyState
            icon={Star}
            title="Still empty"
            text="Reviews from this folder will appear here."
          />
        ) : (
          <>
            {/* Derselbe Umschalter wie auf Profilseiten -- gleiche Geste,
                gleiches Aussehen, gleiche Stelle. */}
            {/*
            resetScroll: false und viewTransition: false -- ein
            Reiterwechsel ist KEIN Seitenwechsel. Ohne beides sprang die
            Seite bei jedem Umschalten nach oben und blendete dabei ueber,
            als wuerde sie neu geladen: Wer ein Stueck gescrollt hatte, um
            die Karte anzusehen, stand danach wieder ganz oben.
            */}
            {/*
                      KLEBT OBEN, solange die Karte sichtbar ist.

                      Beim Umschalten auf "Map" scrollt die Seite zur Karte -- der
                      Umschalter waere damit nach oben aus dem Bild gewandert, und
                      der Weg zurueck zum Feed haette ein Zurueckscrollen verlangt.
                      Jetzt bleibt er stehen.

                      Die Randabstaende (-mx-4 px-4) ziehen den milchigen Streifen
                      ueber die volle Breite: Ohne sie schiebt sich der Inhalt in den
                      16 Pixel Seitenrand daran vorbei.
                    */}
            <div
              className="sticky z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur"
              style={{ top: STICKY_TOP }}
            >
              {/* Reiter als Text mit Unterstrich -- wie in den Profilen. */}
              <div className="flex gap-5 border-b border-border">
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/folder/$folderId",
                      params: { folderId },
                      search: {},
                      replace: true,
                      resetScroll: false,
                      viewTransition: false,
                    })
                  }
                  className={`-mb-px border-b-2 px-1 pb-2.5 text-[0.95rem] font-semibold transition-colors ${
                    view === "feed"
                      ? "border-brand text-foreground"
                      : "border-transparent text-muted-foreground"
                  }`}
                >
                  <Rows3 size={15} /> Feed
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/folder/$folderId",
                      params: { folderId },
                      search: { view: "map" },
                      replace: true,
                      resetScroll: false,
                      viewTransition: false,
                    })
                  }
                  className={`-mb-px border-b-2 px-1 pb-2.5 text-[0.95rem] font-semibold transition-colors ${
                    view === "map"
                      ? "border-brand text-foreground"
                      : "border-transparent text-muted-foreground"
                  }`}
                >
                  <MapIcon size={15} /> Map
                </button>
              </div>
            </div>

            {view === "map" ? (
              placedCount === 0 ? (
                <EmptyState
                  icon={MapIcon}
                  title="Nothing to show on the map"
                  text="These reviews are for places without a saved location, so they can't be placed on the map."
                />
              ) : (
                <div
                  /*
                    Der Abstand entspricht genau der Hoehe der klebenden
                    Kopfzeile (AppHeader: 3.5rem plus die sichere Zone
                    oben). Ohne ihn scrollt die Karte bis an den
                    Bildschirmrand -- und verschwindet damit zur Haelfte
                    unter der Kopfzeile, samt ihrer oberen Ecken und dem
                    Suchfeld. Das eigene Profil hat keine solche
                    Kopfzeile und braucht den Abstand deshalb nicht.
                  */
                  className="scroll-mt-[calc(7rem+env(safe-area-inset-top))]"
                >
                  <PinMap
                    pins={mapPlaces}
                    heading={folder.name}
                    mapKey={`folder:${folderId}`}
                    className={MAP_HEIGHT}
                    onlyUserId={folder.owner_id}
                  />
                </div>
              )
            ) : (
              reviews.map((r) => <ReviewCard key={r.id} review={r} />)
            )}
          </>
        )}
      </div>

      {isOwn ? (
        <ShareDialog folderId={folderId} open={shareOpen} onOpenChange={setShareOpen} />
      ) : null}
    </>
  );
}

/*
 * Teilen geht nur noch ueber einen Link.
 *
 * Vorher suchte man hier Leute aus seinem Netzwerk aus, und der Ordner
 * landete sofort in deren Profil -- ohne Zutun und ohne Nachfrage. Bei
 * zwanzig Freunden ist das bequem; bei einem Konto mit vielen
 * Followern waere es ein Briefkasten ohne Schloss gewesen, in den
 * jeder ungefragt Ordner legen kann.
 *
 * Jetzt bekommt man einen Link und entscheidet selbst, wem man ihn
 * gibt. Die Freigabe entsteht erst, wenn der Empfaenger ihn oeffnet.
 * Was dieses Fenster zusaetzlich zeigt: wer dadurch schon Zugriff hat
 * -- und den kann man einzeln wieder entziehen.
 */
function ShareDialog({
  folderId,
  open,
  onOpenChange,
}: {
  folderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: token } = useQuery({
    queryKey: ["folder-share-token", folderId],
    enabled: open,
    // Der Schluessel ist auf Spaltenebene gesperrt und kommt nur ueber
    // diese Funktion -- und nur, wenn der Ordner einem gehoert.
    queryFn: async () => {
      const { data, error } = await supabase.rpc("folder_share_token", {
        p_folder_id: folderId,
      });
      if (error) throw error;
      return data as string | null;
    },
  });

  const { data: people } = useQuery({
    queryKey: ["folder-shared-with", folderId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("trip_folder_shares")
        .select(
          "shared_with_id, profiles:profiles!trip_folder_shares_shared_with_id_fkey(username, display_name, avatar_url)",
        )
        .eq("folder_id", folderId);
      return (data ?? []).map((row) => {
        const p = row.profiles as unknown as {
          username: string;
          display_name: string | null;
          avatar_url: string | null;
        } | null;
        return {
          id: row.shared_with_id,
          username: p?.username ?? "",
          displayName: p?.display_name ?? null,
          avatar: p?.avatar_url ?? null,
        };
      });
    },
  });

  const link = token ? `${getAppUrl()}/folder/${folderId}?k=${token}` : null;

  async function sendLink() {
    if (!link) return;
    const result = await share({ title: "Turi trip", url: link });
    if (result === "copied") toast.success("Link copied");
  }

  async function revoke(personId: string) {
    setBusy(true);
    const { error } = await supabase
      .from("trip_folder_shares")
      .delete()
      .eq("folder_id", folderId)
      .eq("shared_with_id", personId);
    setBusy(false);
    if (error) {
      toast.error(getErrorMessage(error, "Could not remove"));
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["folder-shared-with", folderId] });
  }

  async function newLink() {
    setBusy(true);
    const { error } = await supabase.rpc("rotate_folder_link", { p_folder_id: folderId });
    setBusy(false);
    if (error) {
      toast.error(getErrorMessage(error, "Could not create a new link"));
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["folder-share-token", folderId] });
    toast.success("New link created — the old one no longer works");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Share folder</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Anyone with this link can see the folder. They only get access once they open it.
        </p>

        <Button disabled={!link} className="h-12 rounded-2xl" onClick={sendLink}>
          <ExternalLink size={16} className="mr-2" />
          {link ? "Send link" : "Preparing link…"}
        </Button>

        {(people ?? []).length > 0 ? (
          <div className="space-y-1">
            <h3 className="turi-eyebrow">Has access</h3>
            <div className="max-h-[38vh] space-y-1 overflow-y-auto">
              {(people ?? []).map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-2xl p-2">
                  <UserAvatar avatarPath={p.avatar} name={p.displayName ?? p.username} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {p.displayName || p.username}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{p.username}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    className="rounded-full"
                    onClick={() => void revoke(p.id)}
                  >
                    <UserMinus size={14} />
                    <span className="ml-1">Remove</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/*
          Ein neuer Link macht alle alten ungueltig. Steht bewusst
          unten und ruhig: Man braucht ihn selten, aber wenn ein Link
          irgendwo gelandet ist, wo er nicht hingehoert, ist er der
          einzige Weg zurueck.
        */}
        <button
          type="button"
          disabled={busy}
          onClick={() => void newLink()}
          className="text-center text-xs text-muted-foreground underline underline-offset-2"
        >
          Create a new link and disable the old one
        </button>
      </DialogContent>
    </Dialog>
  );
}
