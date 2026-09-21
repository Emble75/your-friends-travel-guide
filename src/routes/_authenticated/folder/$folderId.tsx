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
const MAP_HEIGHT = "h-[calc(100dvh-7.25rem-env(safe-area-inset-top)-var(--bottom-nav-h)-0.5rem)]";

function FolderPage() {
  const { folderId } = Route.useParams();
  const { view = "feed" } = Route.useSearch();
  const mapAnchorRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [shareOpen, setShareOpen] = useState(false);

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
   * Beim Wechsel auf "Map" zur Karte scrollen.
   *
   * Die Karte steht unter der Profilkarte; ohne dies sah man nach dem
   * Umschalten weiter das Profil und musste erst von Hand nach unten
   * schieben, um das zu sehen, wofuer man gerade umgeschaltet hat.
   */
  useEffect(() => {
    if (view !== "map") return;
    const id = window.setTimeout(
      () => mapAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      // Kurz warten: Die Karte wird erst nach diesem Durchlauf
      // gezeichnet, vorher gaebe es nichts, wohin gescrollt werden
      // koennte.
      60,
    );
    return () => window.clearTimeout(id);
  }, [view]);

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
              <div className="flex gap-1 rounded-2xl bg-secondary p-1">
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
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors ${
                    view === "feed" ? "bg-card shadow-card" : "text-muted-foreground"
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
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors ${
                    view === "map" ? "bg-card shadow-card" : "text-muted-foreground"
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
                  ref={mapAnchorRef}
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
  const [term, setTerm] = useState("");

  const { data: candidates } = useQuery({
    queryKey: ["folder-share-candidates", folderId],
    enabled: open,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user!.id;
      // Kandidaten: das eigene Netzwerk (wem ich folge + wer mir folgt),
      // damit man nicht zufaellig Fremde suchen kann.
      const [{ data: iFollow }, { data: followMe }, { data: shares }] = await Promise.all([
        supabase
          .from("follows")
          .select("profiles!follows_following_id_fkey(id, username, display_name, avatar_url)")
          .eq("follower_id", me)
          .eq("status", "accepted"),
        supabase
          .from("follows")
          .select("profiles!follows_follower_id_fkey(id, username, display_name, avatar_url)")
          .eq("following_id", me)
          .eq("status", "accepted"),
        supabase.from("trip_folder_shares").select("shared_with_id").eq("folder_id", folderId),
      ]);
      type Person = {
        id: string;
        username: string;
        display_name: string | null;
        avatar_url: string | null;
      };
      const byId = new Map<string, Person>();
      for (const row of [...(iFollow ?? []), ...(followMe ?? [])]) {
        const p = row.profiles as unknown as Person;
        if (p) byId.set(p.id, p);
      }
      const sharedIds = new Set((shares ?? []).map((s) => s.shared_with_id));
      return Array.from(byId.values()).map((p) => ({ ...p, shared: sharedIds.has(p.id) }));
    },
  });

  const t = term.trim().toLowerCase();
  const data = (candidates ?? []).filter(
    (p) => !t || p.username.toLowerCase().includes(t) || p.display_name?.toLowerCase().includes(t),
  );

  async function toggleShare(personId: string, shared: boolean) {
    const { error } = shared
      ? await supabase
          .from("trip_folder_shares")
          .delete()
          .eq("folder_id", folderId)
          .eq("shared_with_id", personId)
      : await supabase
          .from("trip_folder_shares")
          .insert({ folder_id: folderId, shared_with_id: personId });
    if (error) {
      toast.error(getErrorMessage(error, "Action failed"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["folder-share-candidates", folderId] });
  }

  async function sendLink() {
    const result = await share({
      title: "Turi trip",
      url: `${getAppUrl()}/folder/${folderId}`,
    });
    if (result === "copied") toast.success("Link copied");
  }

  const hasSharedWithAnyone = (data ?? []).some((p) => p.shared);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Share folder</DialogTitle>
        </DialogHeader>
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search for a person"
          className="h-11 rounded-2xl"
        />
        <div className="max-h-[45vh] space-y-1 overflow-y-auto">
          {(data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No one found in your network.
            </p>
          ) : (
            (data ?? []).map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl p-2">
                <UserAvatar avatarPath={p.avatar_url} name={p.display_name ?? p.username} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {p.display_name || p.username}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{p.username}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={p.shared ? "secondary" : "default"}
                  className="rounded-full"
                  onClick={() => toggleShare(p.id, p.shared)}
                >
                  {p.shared ? <UserMinus size={14} /> : <UserPlus size={14} />}
                  <span className="ml-1">{p.shared ? "Remove" : "Share"}</span>
                </Button>
              </div>
            ))
          )}
        </div>

        {hasSharedWithAnyone ? (
          <Button variant="secondary" className="rounded-2xl" onClick={sendLink}>
            <ExternalLink size={16} className="mr-2" /> Send link
          </Button>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            Share with at least one person above to unlock a sendable link.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
