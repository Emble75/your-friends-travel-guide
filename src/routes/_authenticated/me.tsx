import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Map as MapIcon, Rows3 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bookmark,
  Camera,
  ChevronRight,
  Folder,
  LogOut,
  Share2,
  Star,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { deleteOwnAccount } from "@/lib/account.functions";
import { EmptyState } from "@/components/turi/EmptyState";
import { PlaceList, type PlaceListItem } from "@/components/turi/PlaceList";
import { PinMap } from "@/components/turi/PinMap";
import { PlaceSheet, type SheetTarget } from "@/components/turi/PlaceSheet";
import { normalizeCategory } from "@/lib/categories";
import { ErrorState } from "@/components/turi/ErrorState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { FollowListSheet } from "@/components/turi/FollowListSheet";
import {
  ProfileCover,
  ProfileColorSwatch,
  PROFILE_COLORS,
  asProfileColor,
  type ProfileColor,
} from "@/components/turi/ProfileCover";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "@/components/turi/ReviewCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { compressImage, getAppUrl, getErrorMessage } from "@/lib/turi";
import { isNative, share, takePhoto } from "@/lib/native";
import { disablePush, enablePush, pushState, pushSupported, type PushState } from "@/lib/push";

export const Route = createFileRoute("/_authenticated/me")({
  /*
   * Feed oder Karte -- in der Adresse, damit ein Abstecher auf eine
   * Ortsseite die Ansicht nicht verwirft (wie bei fremden Profilen).
   */
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search["view"] === "map" ? { view: "map" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "My Profile – Turi" },
      { name: "description", content: "Your Turi profile with all your place reviews." },
      { property: "og:title", content: "My Profile – Turi" },
      { property: "og:description", content: "Your Turi profile with all your place reviews." },
    ],
  }),
  component: MePage,
});

type PendingRequest = {
  followerId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/*
 * Die Hoehe der Karte auf Profil- und Ordnerseiten.
 *
 * Vorher 62 % der Bildschirmhoehe -- zu wenig: Man sah einen Ausschnitt
 * wie durch ein Fenster, und bei mehr als einer Handvoll Pins musste man
 * staendig schieben. Eine Karte braucht Flaeche, um als Karte zu wirken.
 *
 * 82 % lassen oben gerade noch einen Rest der Profilkarte stehen, damit
 * erkennbar bleibt, WESSEN Karte man ansieht; scrollt man ein Stueck,
 * fuellt sie praktisch den Bildschirm.
 */
const MAP_HEIGHT = "h-[82dvh]";

function MePage() {
  const navigate = useNavigate();
  const { view = "feed" } = Route.useSearch();
  const queryClient = useQueryClient();
  const deleteAccountFn = useServerFn(deleteOwnAccount);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [followListOpen, setFollowListOpen] = useState<"followers" | "following" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());
  // Welche Sammlung gerade aufgeklappt ist (Ordner oder Wunschliste).
  const [collection, setCollection] = useState<"folders" | "saved" | null>(null);
  /*
   * Ein Ort aus der Wunschliste oeffnet dieselbe Vorschau wie auf der
   * Karte -- Note, Entfernung, die Bewertungen der Freunde, "Review".
   * Vorher sprang man von hier direkt auf die Ortsseite, waehrend
   * ueberall sonst das Panel erscheint. Zwei Antworten auf dieselbe
   * Geste sind eine Stolperstelle.
   */
  const [selectedPlace, setSelectedPlace] = useState<SheetTarget | null>(null);
  const [profileColor, setProfileColor] = useState<ProfileColor>("blue");
  // Sprungziel fuer die Zahl "Reviews" -- auf einem vollen Profil liegt die
  // Bewertungsliste sonst weit unterhalb aller Sammlungen.
  const reviewsRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user!.id;
      const [
        { data: profile },
        { count: followers },
        { count: following },
        { data: reviews },
        { data: pending },
        { data: folders },
        { data: sharedFolders },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, bio, is_private, profile_color")
          .eq("id", me)
          .maybeSingle(),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", me)
          .eq("status", "accepted"),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", me)
          .eq("status", "accepted"),
        supabase
          .from("reviews")
          .select(reviewSelect)
          .eq("user_id", me)
          .order("created_at", { ascending: false }),
        supabase
          .from("follows")
          .select(
            "follower_id, profiles!follows_follower_id_fkey(username, display_name, avatar_url)",
          )
          .eq("following_id", me)
          .eq("status", "pending"),
        supabase.from("trip_folders").select("id, name").eq("owner_id", me).order("name"),
        supabase
          .from("trip_folder_shares")
          .select(
            "trip_folders(id, name, owner_id, profiles:profiles!trip_folders_owner_id_fkey(username))",
          )
          .eq("shared_with_id", me),
      ]);
      const pendingRequests: PendingRequest[] = (pending ?? []).map((p) => {
        const requester = p.profiles as unknown as {
          username: string;
          display_name: string | null;
          avatar_url: string | null;
        };
        return {
          followerId: p.follower_id,
          username: requester.username,
          displayName: requester.display_name,
          avatarUrl: requester.avatar_url,
        };
      });
      type SharedFolder = { id: string; name: string; profiles: { username: string } | null };
      const sharedWithMe: SharedFolder[] = (sharedFolders ?? [])
        .map((f) => f.trip_folders as unknown as SharedFolder)
        .filter(Boolean);
      return {
        profile,
        folders: folders ?? [],
        sharedWithMe,
        followers: followers ?? 0,
        following: following ?? 0,
        reviews: (reviews ?? []) as unknown as ReviewWithRelations[],
        pendingRequests,
      };
    },
  });

  /*
   * Die Wunschliste -- mit den Noten aus dem Freundeskreis.
   *
   * Vorher war sie eine blosse Aufzaehlung aus Lesezeichen und Stadt,
   * in der Reihenfolge des Merkens. Bei vierzig Eintraegen ist das ein
   * Friedhof: Man merkt sich Orte ueber Monate und will danach genau
   * zwei Dinge wissen -- was davon ist das Beste, und was ist von hier
   * aus in der Naehe. Beides braucht Daten, die die Liste bisher nicht
   * geholt hat: Koordinaten und die Bewertungen der anderen.
   */
  const { data: savedPlaces } = useQuery({
    queryKey: ["my-saved-places"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user!.id;
      const { data, error } = await supabase
        .from("saved_places")
        .select("place_id, places(id, name, city, category, lat, lng)")
        .eq("user_id", me)
        .order("created_at", { ascending: false });
      if (error) throw error;
      type Place = {
        id: string;
        name: string;
        city: string;
        category: string;
        lat: number | null;
        lng: number | null;
      };
      const places = (data ?? []).map((s) => s.places as unknown as Place).filter(Boolean);

      // Die Noten in EINER Abfrage fuer alle gemerkten Orte. Die eigene
      // bleibt aussen vor -- die Wunschliste soll zeigen, was ANDERE
      // davon halten. RLS liefert ohnehin nur den sichtbaren Kreis.
      const sums = new Map<string, { total: number; count: number }>();
      if (places.length > 0) {
        const { data: rows } = await supabase
          .from("reviews")
          .select("place_id, rating")
          .in(
            "place_id",
            places.map((p) => p.id),
          )
          .neq("user_id", me);
        for (const r of rows ?? []) {
          const entry = sums.get(r.place_id) ?? { total: 0, count: 0 };
          entry.total += r.rating;
          entry.count += 1;
          sums.set(r.place_id, entry);
        }
      }

      return places.map((p): PlaceListItem => {
        const sum = sums.get(p.id);
        return {
          id: p.id,
          name: p.name,
          city: p.city,
          category: normalizeCategory(p.category),
          lat: p.lat,
          lng: p.lng,
          friends: sum?.count ?? 0,
          saved: true,
          ...(sum ? { rating: sum.total / sum.count } : {}),
        };
      });
    },
  });

  async function respondToRequest(followerId: string, accept: boolean) {
    // Verhindert doppeltes Antworten bei schnellem Doppelklick, waehrend
    // die Anfrage noch unterwegs ist.
    if (respondingIds.has(followerId)) return;
    setRespondingIds((prev) => new Set(prev).add(followerId));

    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user!.id;
    const { data: affected, error } = accept
      ? await supabase
          .from("follows")
          .update({ status: "accepted" })
          .eq("follower_id", followerId)
          .eq("following_id", me)
          .select()
      : await supabase
          .from("follows")
          .delete()
          .eq("follower_id", followerId)
          .eq("following_id", me)
          .select();

    setRespondingIds((prev) => {
      const next = new Set(prev);
      next.delete(followerId);
      return next;
    });

    if (error) {
      toast.error(getErrorMessage(error, "Action failed"));
      return;
    }
    if (!affected || affected.length === 0) {
      // Kein Fehler, aber auch keine Zeile betroffen -- Berechtigungsproblem,
      // nicht als Erfolg werten.
      toast.error("Could not update the request. Please try again.");
      queryClient.invalidateQueries({ queryKey: ["me"] });
      return;
    }

    toast.success(accept ? "Request accepted" : "Request declined");
    // Optimistisch aus der Liste entfernen, statt auf den vollen Refetch zu warten.
    queryClient.setQueryData(
      ["me"],
      (old: { pendingRequests: PendingRequest[] } | undefined) =>
        old && {
          ...old,
          pendingRequests: old.pendingRequests.filter((r) => r.followerId !== followerId),
        },
    );
    queryClient.invalidateQueries();
  }

  async function uploadAvatar(rawFile: File) {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user!.id;
    const file = await compressImage(rawFile, { maxDimension: 512, quality: 0.85 });
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${me}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      toast.error(getErrorMessage(error, "Upload failed"));
      return;
    }
    const { error: pErr } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", me);
    if (pErr) {
      toast.error(getErrorMessage(pErr, "Could not save"));
      return;
    }
    toast.success("Profile photo updated");
    queryClient.invalidateQueries();
  }

  async function saveProfile() {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        is_private: isPrivate,
        profile_color: profileColor,
      })
      .eq("id", auth.user!.id);
    if (error) {
      toast.error(getErrorMessage(error, "Could not save"));
      return;
    }
    setEditing(false);
    toast.success("Profile saved");
    queryClient.invalidateQueries();
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await deleteAccountFn();
      await supabase.auth.signOut();
      queryClient.clear();
      toast.success("Account deleted");
      navigate({ to: "/auth" });
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not delete account"));
      setDeleting(false);
    }
  }

  // Ohne diese Verzweigung bliebe der Screen bei einem Ladefehler dauerhaft
  // im Skeleton haengen -- data waere nie gesetzt, isLoading nie wieder true.
  if (isError) {
    return (
      <>
        <div className="app-shell app-top pb-4">
          <ErrorState text="We couldn't load your profile." onRetry={() => refetch()} />
        </div>
      </>
    );
  }

  if (isLoading || !data?.profile) {
    return (
      <>
        <div className="app-shell app-top space-y-4 pb-4">
          <Skeleton className="h-40 rounded-3xl" />
          <Skeleton className="h-24 rounded-3xl" />
        </div>
      </>
    );
  }

  const { profile, reviews, pendingRequests, folders, sharedWithMe } = data;

  /*
   * Die eigene Karte: bewertete Orte UND die Wunschliste.
   *
   * Keine eigene Abfrage -- beides ist bereits geladen. Die Note am Pin
   * ist bewusst die EIGENE (nicht die des Freundeskreises, wie in der
   * Wunschliste darunter): Es ist die eigene Karte, sie zeigt, was man
   * selbst vergeben hat. Ein Ort, der gemerkt und noch nicht bewertet
   * ist, traegt das Lesezeichen -- genau wie auf der Hauptkarte.
   */
  const myMapPlaces: PlaceListItem[] = (() => {
    const byId = new Map<string, PlaceListItem>();
    const sums = new Map<string, { total: number; count: number }>();
    for (const r of reviews) {
      const p = r.places;
      if (!p) continue;
      const entry = sums.get(p.id) ?? { total: 0, count: 0 };
      entry.total += r.rating;
      entry.count += 1;
      sums.set(p.id, entry);
      byId.set(p.id, {
        id: p.id,
        name: p.name,
        city: p.city,
        category: normalizeCategory(p.category),
        lat: p.lat,
        lng: p.lng,
        rating: entry.total / entry.count,
        // Auf der eigenen Karte waere "1 friend" ueberall dasselbe.
        friends: 0,
        saved: false,
      });
    }
    for (const saved of savedPlaces ?? []) {
      const existing = byId.get(saved.id);
      if (existing) {
        byId.set(saved.id, { ...existing, saved: true });
      } else {
        // Gemerkt, aber noch nicht bewertet: ohne Note, mit Lesezeichen.
        // rating wird WEGGELASSEN statt auf undefined gesetzt -- die
        // strikte Typpruefung unterscheidet beides.
        const { rating: _friendsRating, ...rest } = saved;
        byId.set(saved.id, { ...rest, friends: 0, saved: true });
      }
    }
    return Array.from(byId.values());
  })();

  return (
    <>
      <div className="app-shell app-top space-y-4 pb-4">
        <section className="turi-card overflow-hidden">
          {/* Farbband: waehlbar in der Bearbeiten-Ansicht. Waehrend des
              Bearbeitens zeigt es sofort die angetippte Farbe, damit man
              die Wirkung sieht, bevor man speichert. */}
          <ProfileCover color={editing ? profileColor : asProfileColor(profile.profile_color)} />
          <div className="flex items-end gap-4 px-5">
            <label
              /* -mt-10 zieht das Bild in das Band hinein; der weisse Ring
                 trennt es sauber von der Farbe dahinter. */
              className="relative -mt-10 shrink-0 cursor-pointer"
              onClick={async (e) => {
                if (!isNative()) return;
                e.preventDefault();
                const file = await takePhoto("prompt");
                if (file) void uploadAvatar(file);
              }}
            >
              <UserAvatar
                avatarPath={profile.avatar_url}
                name={profile.display_name ?? profile.username}
                className="size-20 ring-4 ring-card"
              />
              <span className="turi-hit absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                <Camera size={14} />
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
              />
            </label>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">
                {profile.display_name || profile.username}
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                @{profile.username}
                {profile.is_private ? " · Private" : ""}
              </p>
            </div>
          </div>
          <div className="px-5 pb-5">
            {profile.bio && !editing ? (
              <p className="mt-3 text-sm text-foreground/90">{profile.bio}</p>
            ) : null}

            {/*
            Vorher drei inline stehende Zahlen, von denen zwei anklickbar
            waren und eine nicht -- optisch nicht zu unterscheiden. Jetzt ein
            klar abgegrenzter Block mit Trennlinien, in dem alle drei
            gleich funktionieren.
          */}
            <div className="mt-4 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-2xl bg-secondary/70">
              <button
                type="button"
                onClick={() => reviewsRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="turi-tap flex flex-col items-center py-2.5"
              >
                <strong className="font-display text-base leading-tight">{reviews.length}</strong>
                <span className="text-xs text-muted-foreground">Reviews</span>
              </button>
              <button
                type="button"
                onClick={() => setFollowListOpen("followers")}
                className="turi-tap flex flex-col items-center py-2.5"
              >
                <strong className="font-display text-base leading-tight">{data.followers}</strong>
                <span className="text-xs text-muted-foreground">Followers</span>
              </button>
              <button
                type="button"
                onClick={() => setFollowListOpen("following")}
                className="turi-tap flex flex-col items-center py-2.5"
              >
                <strong className="font-display text-base leading-tight">{data.following}</strong>
                <span className="text-xs text-muted-foreground">Following</span>
              </button>
            </div>

            {editing ? (
              <div className="mt-4 space-y-3">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name"
                  className="h-12 rounded-2xl"
                />
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Short bio"
                  rows={3}
                  className="rounded-2xl"
                />
                <div className="rounded-2xl border border-border p-3">
                  <Label className="text-sm font-medium">Profile colour</Label>
                  <p className="text-xs text-muted-foreground">
                    The band behind your photo. Pick what suits your picture.
                  </p>
                  {/* Zehn Punkte passen nicht mehr in eine Zeile --
                      umbrechen statt schrumpfen, sonst wird die
                      Trefferflaeche zu klein. */}
                  <div className="mt-3 flex flex-wrap gap-3">
                    {PROFILE_COLORS.map((c) => (
                      <ProfileColorSwatch
                        key={c}
                        color={c}
                        selected={profileColor === c}
                        onSelect={setProfileColor}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-border p-3">
                  <div>
                    <Label htmlFor="is-private" className="text-sm font-medium">
                      Private account
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      New followers must be approved first.
                    </p>
                  </div>
                  <Switch id="is-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveProfile} className="flex-1 rounded-2xl">
                    Save
                  </Button>
                  <Button
                    variant="secondary"
                    className="rounded-2xl"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  className="h-11 flex-1 rounded-2xl"
                  onClick={() => {
                    setDisplayName(profile.display_name ?? "");
                    setBio(profile.bio ?? "");
                    setIsPrivate(profile.is_private);
                    setProfileColor(asProfileColor(profile.profile_color));
                    setEditing(true);
                  }}
                >
                  Edit profile
                </Button>
                <Button
                  variant="secondary"
                  aria-label="Share my map"
                  className="h-11 w-11 shrink-0 rounded-2xl"
                  onClick={async () => {
                    const result = await share({
                      title: `${profile.display_name || profile.username} on Turi`,
                      text: "My map — the places I'd actually send you to.",
                      url: `${getAppUrl()}/u/${profile.username}`,
                    });
                    if (result === "copied") toast.success("Link copied");
                  }}
                >
                  <Share2 size={18} />
                </Button>
              </div>
            )}
          </div>
        </section>

        {pendingRequests.length > 0 ? (
          <section className="turi-card p-5">
            <h2 className="turi-eyebrow">Follow requests ({pendingRequests.length})</h2>
            <ul className="mt-3 space-y-3">
              {pendingRequests.map((r) => (
                <li key={r.followerId} className="flex items-center gap-3">
                  <UserAvatar avatarPath={r.avatarUrl} name={r.displayName ?? r.username} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {r.displayName || r.username}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{r.username}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    className="rounded-full"
                    aria-label="Accept"
                    disabled={respondingIds.has(r.followerId)}
                    onClick={() => respondToRequest(r.followerId, true)}
                  >
                    <UserCheck size={16} />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="rounded-full"
                    aria-label="Decline"
                    disabled={respondingIds.has(r.followerId)}
                    onClick={() => respondToRequest(r.followerId, false)}
                  >
                    <UserX size={16} />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/*
          Feed oder Karte -- derselbe Umschalter wie auf fremden
          Profilen.

          Die eigene Karte lag frueher auf der Kartenseite hinter einem
          Schalter "Discover | My Map". Das war inkonsistent: Die Karte
          jeder anderen Person liegt in ihrem Profil, nur die eigene
          woanders. Und der Schalter kostete auf JEDEM Kartenbildschirm
          Platz fuer etwas, das selten gebraucht wird.
        */}
        {/*
        resetScroll: false und viewTransition: false -- ein
        Reiterwechsel ist KEIN Seitenwechsel. Ohne beides sprang die
        Seite bei jedem Umschalten nach oben und blendete dabei ueber,
        als wuerde sie neu geladen: Wer ein Stueck gescrollt hatte, um
        die Karte anzusehen, stand danach wieder ganz oben.
        */}
        <div className="flex gap-1 rounded-2xl bg-secondary p-1">
          <button
            type="button"
            onClick={() =>
              navigate({
                to: "/me",
                search: {},
                replace: true,
                resetScroll: false,
                viewTransition: false,
              })
            }
            aria-pressed={view === "feed"}
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
                to: "/me",
                search: { view: "map" },
                replace: true,
                resetScroll: false,
                viewTransition: false,
              })
            }
            aria-pressed={view === "map"}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors ${
              view === "map" ? "bg-card shadow-card" : "text-muted-foreground"
            }`}
          >
            <MapIcon size={15} /> Map
          </button>
        </div>

        {/*
          Sammlungen hinter Knoepfen statt als ausgebreitete Chip-Wolken.
          Ausgelegt nahmen sie dem Profil die Ordnung -- zwei umbrechende
          Bereiche uebereinander, bevor ueberhaupt eine Bewertung kam.
          Der Inhalt bleibt einen Fingertipp entfernt.
        */}
        {/*
          Sammlungen als weisse Karten-Knoepfe statt grauer Sekundaer-Buttons:
          Grau auf Grau sah aus wie deaktiviert. Die Karten heben sich vom
          Seitenhintergrund ab, der Chevron zeigt "hier geht es weiter".
        */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="turi-card turi-tap flex items-center gap-3 p-4 text-left transition-colors hover:border-foreground/15"
            onClick={() => setCollection("folders")}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <Folder size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">Folders</span>
              <span className="turi-meta block text-xs text-muted-foreground">
                {folders.length + sharedWithMe.length}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
          </button>
          <button
            type="button"
            className="turi-card turi-tap flex items-center gap-3 p-4 text-left transition-colors hover:border-foreground/15"
            onClick={() => setCollection("saved")}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <Bookmark size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">Want to go</span>
              <span className="turi-meta block text-xs text-muted-foreground">
                {savedPlaces?.length ?? 0}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
          </button>
        </div>

        <div ref={reviewsRef} className="scroll-mt-20 space-y-4">
          {view === "map" ? (
            myMapPlaces.filter((p) => p.lat != null && p.lng != null).length === 0 ? (
              <EmptyState
                icon={MapIcon}
                title={reviews.length > 0 ? "Nothing to show on the map" : "No places yet"}
                text={
                  reviews.length > 0
                    ? "These reviews are for places without a saved location, so they can't be placed on the map."
                    : "Places you review or save will appear here."
                }
              />
            ) : (
              <PinMap pins={myMapPlaces} heading="Your places" mapKey="me" className={MAP_HEIGHT} />
            )
          ) : (
            <>
              {/* Bisher standen die Bewertungen voellig unbeschriftet unter
                  den Sammlungen -- man sah nicht, wo die Listen enden und
                  die eigenen Bewertungen anfangen. */}
              {reviews.length > 0 ? (
                <h2 className="turi-eyebrow">Your reviews ({reviews.length})</h2>
              ) : null}
              {reviews.length > 0 ? (
                reviews.map((r) => <ReviewCard key={r.id} review={r} />)
              ) : (
                <EmptyState
                  icon={Star}
                  title="No reviews yet"
                  text="Review your first place — your friends will see it right away."
                  action={
                    <Button asChild className="rounded-2xl">
                      <Link to="/new">Review a place</Link>
                    </Button>
                  }
                />
              )}
            </>
          )}
        </div>

        {/*
          Kontoverwaltung ans Ende, optisch ruhig. Vorher war das Loeschen
          eine dauerhaft sichtbare, rot umrandete Karte auf gleicher Stufe
          wie "Ordner" -- eine unwiderrufliche Aktion sollte auffindbar
          sein, aber nicht staendig um Aufmerksamkeit buhlen. Der Abmelden-
          Knopf steht hier zusaetzlich, weil er im Kopfbereich nur als
          Symbol ohne Beschriftung existiert.
        */}
        <section className="turi-card p-5">
          <h2 className="turi-eyebrow">Account</h2>

          <PushSetting />

          <Button
            variant="secondary"
            className="mt-3 h-11 w-full justify-start rounded-2xl"
            onClick={async () => {
              await supabase.auth.signOut();
              queryClient.clear();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut size={16} className="mr-2" /> Sign out
          </Button>

          {/*
            Datenschutz und Nutzungsbedingungen waren aus der
            angemeldeten App heraus ueberhaupt nicht erreichbar -- sie
            standen einzig neben dem Zustimmungshaken der Registrierung
            und verschwanden damit nach dem ersten Tag fuer immer. Hier
            sucht man sie, und Apple erwartet sie an dieser Stelle.
          */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Link to="/legal/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            <Link to="/legal/terms" className="underline underline-offset-2">
              Terms of Service
            </Link>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Deleting your account permanently removes all your reviews, photos, and follows. This
            can't be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="mt-2 h-11 w-full justify-start rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={16} className="mr-2" /> Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-3xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Really delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  All your reviews, photos, followers, and requests will be permanently deleted.
                  This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteAccount}
                  disabled={deleting}
                  className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Deleting…" : "Permanently delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </div>

      <Sheet open={collection !== null} onOpenChange={(open) => !open && setCollection(null)}>
        <SheetContent side="bottom" className="max-h-[75vh] rounded-t-3xl border-0 pb-8">
          <SheetHeader className="text-left">
            <SheetTitle>{collection === "folders" ? "Folders" : "Want to go"}</SheetTitle>
          </SheetHeader>
          <div
            className={
              collection === "saved" && (savedPlaces ?? []).length > 0
                ? "mt-2 flex max-h-[58vh] min-h-0 flex-col overflow-hidden"
                : "mt-2 max-h-[55vh] space-y-1 overflow-y-auto px-1"
            }
          >
            {collection === "folders" ? (
              folders.length + sharedWithMe.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No folders yet. You can group reviews into a folder while writing one.
                </p>
              ) : (
                <>
                  {folders.map((f) => (
                    <Link
                      key={f.id}
                      to="/folder/$folderId"
                      params={{ folderId: f.id }}
                      onClick={() => setCollection(null)}
                      className="turi-tap flex items-center gap-3 rounded-2xl p-3 hover:bg-secondary"
                    >
                      <Folder size={16} className="shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{f.name}</span>
                    </Link>
                  ))}
                  {sharedWithMe.map((f) => (
                    <Link
                      key={f.id}
                      to="/folder/$folderId"
                      params={{ folderId: f.id }}
                      onClick={() => setCollection(null)}
                      className="turi-tap flex items-center gap-3 rounded-2xl p-3 hover:bg-secondary"
                    >
                      <Folder size={16} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
                      <span className="turi-meta shrink-0 text-xs text-muted-foreground">
                        from @{f.profiles?.username}
                      </span>
                    </Link>
                  ))}
                </>
              )
            ) : (savedPlaces ?? []).length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Nothing saved yet. Tap the bookmark on a place to keep it here.
              </p>
            ) : (
              /*
                Dieselbe Darstellung wie die Liste auf der Karte:
                sortierbar nach Note oder Entfernung. Es ist dieselbe
                Frage -- "welcher dieser Orte ist jetzt der richtige?" --
                und sie wurde hier bisher anders beantwortet als dort.
              */
              <>
                {/*
                  Der Hinweis steht hier und nicht auf der Karte: Wer die
                  Liste oeffnet, sucht seine gemerkten Orte -- dass sie
                  auch auf der Karte liegen, ist genau in diesem Moment
                  eine neue Information. Auf der Karte selbst waere es
                  eine Erklaerung fuer etwas, das man dort schon sieht.
                */}
                <p className="turi-meta flex items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
                  <Bookmark size={13} className="shrink-0 text-map-accent" fill="currentColor" />
                  You&apos;ll find these marked on your map, too.
                </p>
                <PlaceList
                  items={savedPlaces ?? []}
                  showCity
                  summary={`${savedPlaces!.length} ${savedPlaces!.length === 1 ? "place" : "places"}`}
                  onPick={(item) => {
                    // Erst die Liste schliessen, dann die Vorschau
                    // oeffnen -- zwei uebereinanderliegende Flaechen
                    // muesste man einzeln wegwischen.
                    setCollection(null);
                    if (item.lat != null && item.lng != null) {
                      setSelectedPlace({
                        kind: "local",
                        id: item.id,
                        name: item.name,
                        lat: item.lat,
                        lng: item.lng,
                      });
                    } else {
                      // Ohne Koordinaten haette die Vorschau keine
                      // Entfernung und keinen Routen-Knopf -- dann
                      // lieber gleich die ganze Ortsseite.
                      navigate({ to: "/place/$placeId", params: { placeId: item.id } });
                    }
                  }}
                />
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <PlaceSheet target={selectedPlace} onClose={() => setSelectedPlace(null)} myPos={null} />

      <FollowListSheet
        userId={profile.id}
        type={followListOpen ?? "followers"}
        open={followListOpen !== null}
        onOpenChange={(open) => !open && setFollowListOpen(null)}
      />
    </>
  );
}

/*
 * Schalter fuer Push-Nachrichten.
 *
 * Bewusst ein sichtbarer Schalter im Profil statt einer Abfrage beim
 * ersten Start: iOS fragt nur EIN EINZIGES Mal: wer dort aus Reflex
 * ablehnt, kann es in der App nie wieder aktivieren, sondern nur noch
 * ueber die Systemeinstellungen. Ein Schalter, den man bewusst umlegt,
 * wird viel eher erlaubt -- und er bleibt auffindbar.
 *
 * Im Browser erscheint er gar nicht: dort gibt es kein Push, und ein
 * Schalter, der nichts tut, ist schlimmer als keiner.
 */
function PushSetting() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void pushState().then((s) => active && setState(s));
    return () => {
      active = false;
    };
  }, []);

  if (!pushSupported() || state === null || state === "unsupported") return null;

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      if (on) {
        const next = await enablePush();
        setState(next);
        if (next === "denied") {
          toast.error("Notifications are off in iOS Settings for Turi.");
        }
      } else {
        await disablePush();
        setState("prompt");
      }
    } finally {
      setBusy(false);
    }
  }

  const on = state === "granted";

  return (
    <div className="mt-3 flex items-center justify-between rounded-2xl border border-border p-3">
      <div className="min-w-0 pr-3">
        <Label htmlFor="push" className="text-sm font-medium">
          Notifications
        </Label>
        <p className="text-xs text-muted-foreground">
          {state === "denied"
            ? "Turned off in iOS Settings. Turn them back on there."
            : "New followers, accepted requests, and reviews of places you saved."}
        </p>
      </div>
      <Switch
        id="push"
        checked={on}
        disabled={busy || state === "denied"}
        onCheckedChange={toggle}
      />
    </div>
  );
}
