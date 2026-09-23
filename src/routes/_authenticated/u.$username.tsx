import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Flag,
  Lock,
  Map as MapIcon,
  Rows3,
  ShieldOff,
  Star,
  UserCheck,
  UserPlus,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { getErrorMessage } from "@/lib/turi";
import type { FollowStatus } from "@/hooks/use-follow";
import { AppHeader } from "@/components/turi/AppHeader";
import { FollowButton } from "@/components/turi/FollowButton";
import { EmptyState } from "@/components/turi/EmptyState";
import { ErrorState } from "@/components/turi/ErrorState";
import { UserAvatar } from "@/components/turi/UserAvatar";
import { ReportDialog } from "@/components/turi/ReportDialog";
import { FollowListSheet } from "@/components/turi/FollowListSheet";
import { PinMap } from "@/components/turi/PinMap";
import { type PlaceListItem } from "@/components/turi/PlaceList";
import { normalizeCategory } from "@/lib/categories";
import { ProfileCover, asProfileColor } from "@/components/turi/ProfileCover";
import { ReviewCard, reviewSelect, type ReviewWithRelations } from "@/components/turi/ReviewCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/_authenticated/u/$username")({
  /*
   * Feed oder Karte steht in der Adresse, nicht im Komponentenzustand.
   *
   * WARUM: Tippt man auf der Karte einen Ort an, wird diese Seite
   * abgebaut und beim Zurueckkehren neu erzeugt -- ein blosser
   * useState-Wert ist dann weg, und man landete wieder im Feed,
   * obwohl man von der Karte kam. In der Adresse ueberlebt die
   * Ansicht den Sprung, den Zurueck-Knopf und auch das Neuladen.
   *
   * "feed" wird bewusst NICHT geschrieben: Es ist der Normalfall, und
   * ein ?view=feed an jedem Profil-Link waere nur Rauschen.
   */
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search["view"] === "map" ? { view: "map" as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Profile – Turi" },
      { name: "description", content: "This person's reviews and places on Turi." },
      { property: "og:title", content: "Profile – Turi" },
      { property: "og:description", content: "This person's reviews and places on Turi." },
    ],
  }),
  component: ProfilePage,
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

function ProfilePage() {
  const { username } = Route.useParams();
  const { view = "feed" } = Route.useSearch();
  const mapAnchorRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [followListOpen, setFollowListOpen] = useState<"followers" | "following" | null>(null);
  // Nach einem Klick gilt der vom Button bestaetigte Status, sonst der
  // aus der Profil-Query geladene.
  const [clickedStatus, setClickedStatus] = useState<{ value: FollowStatus } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["profile", username],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id ?? "";
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, is_private, profile_color")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      if (!profile) return null;

      const [
        { data: follow },
        { count: followers },
        { count: following },
        { data: reviews },
        { data: block },
      ] = await Promise.all([
        supabase
          .from("follows")
          .select("status")
          .eq("follower_id", me)
          .eq("following_id", profile.id)
          .maybeSingle(),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", profile.id)
          .eq("status", "accepted"),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", profile.id)
          .eq("status", "accepted"),
        /*
         * Zwei Wege zu denselben Zeilen -- je nachdem, was die
         * RLS-Regeln durchlassen.
         *
         * Folgt man der Person, liefert die normale Abfrage alles. Folgt
         * man nicht, greift is_visible_author und sie kommt leer zurueck
         * -- auf dem Profil stand dann "No posts yet", obwohl derselbe
         * Beitrag im Vorschlags-Reiter des Feeds sichtbar war.
         *
         * Fuer oeffentliche Konten gibt es deshalb public_profile_reviews:
         * eng geschnitten, genau wie suggested_feed, damit die allgemeine
         * Sichtbarkeitsregel unangetastet bleibt. Sonst stuenden fremde
         * Bewertungen ploetzlich auch auf der Discover-Karte und in den
         * Durchschnitten.
         */
        profile.is_private || profile.id === me
          ? supabase
              .from("reviews")
              .select(reviewSelect)
              .eq("user_id", profile.id)
              .order("created_at", { ascending: false })
          : supabase
              .rpc("public_profile_reviews", { p_user_id: profile.id })
              .then((res) => ({ ...res, data: (res.data ?? []) as unknown[] })),
        supabase
          .from("blocks")
          .select("blocked_id")
          .eq("blocker_id", me)
          .eq("blocked_id", profile.id)
          .maybeSingle(),
      ]);

      return {
        profile,
        isMe: profile.id === me,
        followStatus: follow?.status as "pending" | "accepted" | undefined,
        isBlocked: !!block,
        followers: followers ?? 0,
        following: following ?? 0,
        reviews: (reviews ?? []) as unknown as ReviewWithRelations[],
      };
    },
  });

  async function toggleBlock() {
    if (!data) return;
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) return;

    if (data.isBlocked) {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", me)
        .eq("blocked_id", data.profile.id);
      if (error) toast.error(getErrorMessage(error, "Action failed"));
      else {
        toast.success(`@${data.profile.username} unblocked`);
        queryClient.invalidateQueries();
      }
      return;
    }

    const { error } = await supabase
      .from("blocks")
      .insert({ blocker_id: me, blocked_id: data.profile.id });
    if (error) {
      toast.error(getErrorMessage(error, "Action failed"));
      return;
    }
    // Gegenseitige Follows aufheben, damit die Inhalte auch wirklich verschwinden.
    await supabase
      .from("follows")
      .delete()
      .or(
        `and(follower_id.eq.${me},following_id.eq.${data.profile.id}),and(follower_id.eq.${data.profile.id},following_id.eq.${me})`,
      );
    toast.success(`@${data.profile.username} blocked`);
    queryClient.invalidateQueries();
  }

  const followStatus = clickedStatus ? clickedStatus.value : data?.followStatus;

  const canSeeReviews = data
    ? !data.profile.is_private || followStatus === "accepted" || data.isMe
    : false;

  /*
   * Die Kartenpunkte kommen aus denselben Bewertungen, die oben ohnehin
   * geladen wurden -- keine zweite Abfrage.
   *
   * Vorher stand hier eine eigene Abfrage auf reviews. Sie hatte
   * denselben blinden Fleck wie die Liste: Bei jemandem, dem man nicht
   * folgt, liess die RLS-Regel nichts durch, und die Karte eines
   * oeffentlichen Kontos blieb leer. Ueber die geladenen Zeilen zu gehen
   * loest das nebenbei mit und spart einen Weg zum Server.
   */
  const mapPlaces: PlaceListItem[] = useMemo(() => {
    type Row = {
      id: string;
      name: string;
      city: string | null;
      category: string;
      lat: number | null;
      lng: number | null;
    };
    const byId = new Map<string, Row>();
    const sums = new Map<string, { total: number; count: number }>();
    for (const r of data?.reviews ?? []) {
      const place = (r as { places?: Row | null }).places ?? null;
      if (!place) continue;
      byId.set(place.id, place);
      const entry = sums.get(place.id) ?? { total: 0, count: 0 };
      entry.total += r.rating;
      entry.count += 1;
      sums.set(place.id, entry);
    }
    return Array.from(byId.entries()).map(([id, place]) => ({
      id,
      name: place.name,
      city: place.city,
      category: normalizeCategory(place.category),
      lat: place.lat,
      lng: place.lng,
      rating: sums.get(id)!.total / sums.get(id)!.count,
      /*
       * Bewusst 0: Die Zeile unter dem Namen wuerde sonst "1 friend"
       * sagen. Auf der Karte EINER Person ist das keine Information,
       * sondern Rauschen -- es sind ihre Orte, die Zahl waere ueberall
       * dieselbe.
       */
      friends: 0,
      saved: false,
    }));
  }, [data?.reviews]);

  // Die Karte wartet auf dieselbe Abfrage wie der Rest der Seite.
  const mapLoading = isLoading;

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
    // mapLoading gehoert in die Abhaengigkeiten: Beim ersten Umschalten
    // laufen Wechsel und Ladevorgang auseinander -- ohne dies bliebe es
    // beim Platzhalter stehen.
  }, [view, mapLoading]);

  if (isLoading) {
    return (
      <>
        <AppHeader title="Profile" showBack fallbackTo="/feed" />
        <div className="app-shell py-4">
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <AppHeader title="Profile" showBack fallbackTo="/feed" />
        <div className="app-shell py-4">
          <ErrorState text="We couldn't load this profile." onRetry={() => refetch()} />
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AppHeader title="Profile" showBack fallbackTo="/feed" />
        <div className="app-shell py-4">
          <EmptyState
            icon={UserPlus}
            title="Profile not found"
            text={`@${username} doesn't exist.`}
          />
        </div>
      </>
    );
  }

  const { profile, reviews } = data;

  return (
    <>
      <AppHeader title={`@${profile.username}`} showBack fallbackTo="/feed" />
      <div className="app-shell space-y-4 py-4">
        <section className="turi-card overflow-hidden">
          {/* Dasselbe Farbband wie im eigenen Profil -- die vom Gegenueber
              gewaehlte Farbe. */}
          <ProfileCover color={asProfileColor(profile.profile_color)} />
          <div className="flex items-end gap-4 px-5">
            <UserAvatar
              avatarPath={profile.avatar_url}
              name={profile.display_name ?? profile.username}
              className="-mt-10 size-20 shrink-0 ring-4 ring-card"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold">
                {profile.display_name || profile.username}
              </h1>
              <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
            </div>
            {!data.isMe ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="turi-tap flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
                    aria-label="More options"
                  >
                    <MoreVertical size={18} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl">
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setReportOpen(true);
                    }}
                  >
                    <Flag size={16} className="mr-2" />
                    Report
                  </DropdownMenuItem>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        onSelect={(e) => e.preventDefault()}
                        className="text-destructive"
                      >
                        <ShieldOff size={16} className="mr-2" />
                        {data.isBlocked ? "Entblockieren" : "Blockieren"}
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-3xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {data.isBlocked
                            ? `Unblock @${profile.username}?`
                            : `Block @${profile.username}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {data.isBlocked
                            ? "You'll be able to see and follow each other again afterward."
                            : "You won't be able to see each other's reviews or follow each other anymore."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={toggleBlock} className="rounded-2xl">
                          {data.isBlocked ? "Entblockieren" : "Blockieren"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <div className="px-5 pb-5">
            {!data.isMe ? (
              <ReportDialog
                reportedUserId={profile.id}
                trigger={null}
                open={reportOpen}
                onOpenChange={setReportOpen}
              />
            ) : null}
            {profile.bio ? <p className="mt-3 text-sm text-foreground/90">{profile.bio}</p> : null}
            <div className="mt-4 flex gap-5 text-sm">
              <span>
                <strong>{reviews.length}</strong>{" "}
                <span className="text-muted-foreground">Reviews</span>
              </span>
              <button
                type="button"
                onClick={() => setFollowListOpen("followers")}
                className="text-left"
              >
                <strong>{data.followers}</strong>{" "}
                <span className="text-muted-foreground">Followers</span>
              </button>
              <button
                type="button"
                onClick={() => setFollowListOpen("following")}
                className="text-left"
              >
                <strong>{data.following}</strong>{" "}
                <span className="text-muted-foreground">Following</span>
              </button>
            </div>
            {!data.isMe ? (
              <FollowButton
                userId={profile.id}
                isPrivate={profile.is_private}
                initialStatus={data.followStatus}
                size="default"
                className="mt-4 h-11 w-full rounded-2xl"
                privateLabel="Send request"
                onChanged={(value) => setClickedStatus({ value })}
              />
            ) : null}
          </div>
        </section>

        {profile.is_private && followStatus !== "accepted" && !data.isMe ? (
          <EmptyState
            icon={Lock}
            title="Private account"
            text={
              followStatus === "pending"
                ? "Your request is waiting for approval."
                : `Follow @${profile.username} to see reviews.`
            }
          />
        ) : (
          <>
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
                      to: "/u/$username",
                      params: { username },
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
                      to: "/u/$username",
                      params: { username },
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
              /*
                Die Markierung sitzt auf DIESER Huelle, nicht auf der
                Karte selbst.

                Vorher trug sie die Karte -- und die gibt es beim ersten
                Umschalten noch nicht: Solange die Orte laden, steht hier
                ein Platzhalter. Das Scrollen fand also nichts, wohin es
                haette springen koennen, und passierte erst beim zweiten
                Mal, wenn die Daten schon im Speicher lagen.
              */
              <div ref={mapAnchorRef} className="scroll-mt-[calc(7rem+env(safe-area-inset-top))]">
                {mapLoading ? (
                  <Skeleton className={`${MAP_HEIGHT} rounded-3xl`} />
                ) : // Orte ohne gespeicherte Position koennen nicht auf die
                // Karte. Gezaehlt wird deshalb, was tatsaechlich dort
                // landen kann -- sonst stuende hier eine leere Karte ohne
                // jede Erklaerung.
                (mapPlaces ?? []).filter((p) => p.lat != null && p.lng != null).length === 0 ? (
                  /*
                  Ohne diesen Zweig stand hier eine leere Weltkarte: die
                  Karte laedt, zoomt aber auf nichts, und man raet, ob die
                  Person keine Orte hat oder etwas kaputt ist. Beide Faelle
                  werden jetzt benannt -- der zweite tritt auf, wenn ein Ort
                  von Hand angelegt wurde und keine Position hat.
                */
                  <EmptyState
                    icon={MapIcon}
                    title={reviews.length > 0 ? "Nothing to show on the map" : "No places yet"}
                    text={
                      reviews.length > 0
                        ? "These reviews are for places without a saved location, so they can't be placed on the map."
                        : "Reviewed places will appear here."
                    }
                  />
                ) : (
                  <PinMap
                    pins={mapPlaces}
                    mapKey={`profile:${profile.id}`}
                    heading={`${profile.display_name || profile.username}'s places`}
                    className={MAP_HEIGHT}
                    onlyUserId={profile.id}
                  />
                )}
              </div>
            ) : reviews.length > 0 ? (
              reviews.map((r) => <ReviewCard key={r.id} review={r} />)
            ) : (
              <EmptyState
                icon={Star}
                title="No reviews yet"
                text="All reviewed places will appear here."
              />
            )}
          </>
        )}
      </div>

      <FollowListSheet
        userId={profile.id}
        type={followListOpen ?? "followers"}
        open={followListOpen !== null}
        onOpenChange={(open) => !open && setFollowListOpen(null)}
      />
    </>
  );
}
