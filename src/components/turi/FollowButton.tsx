import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { getErrorMessage } from "@/lib/turi";
import { tap } from "@/lib/native";
import { Button } from "@/components/ui/button";
import type { FollowStatus } from "@/hooks/use-follow";

/**
 * Folgen/Entfolgen -- der einzige Ort in der App, an dem sich ein
 * Follow-Zustand aendert.
 *
 * Grundregel: Der Button besitzt seinen Zustand selbst. `initialStatus`
 * ist nur der Startwert, solange noch niemand geklickt hat. Nach einem
 * bestaetigten Klick wird der Startwert bewusst ignoriert -- sonst kann
 * ein spaeter eintreffender Refetch den Button wieder zurueckdrehen
 * (das war der Fehler: Meldung "Unfollowed", Button trotzdem wieder
 * auf "Following").
 *
 * Zweite Grundregel: Ein Klick wird NIE stillschweigend verworfen. Die
 * eigene Nutzer-ID wird direkt bei der Aktion geholt, nicht aus einem
 * Cache, der beim ersten Klick noch leer sein koennte (das war die
 * Ursache fuer "funktioniert erst beim zweiten Klick").
 */
export function FollowButton({
  userId,
  isPrivate,
  initialStatus,
  size = "sm",
  className = "rounded-full",
  privateLabel = "Request",
  onChanged,
}: {
  userId: string;
  isPrivate: boolean;
  initialStatus: FollowStatus;
  size?: "default" | "sm";
  className?: string;
  privateLabel?: string;
  onChanged?: (status: FollowStatus) => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FollowStatus>(initialStatus);
  const [busy, setBusy] = useState(false);

  // Startwert nachziehen, solange der Button noch nicht selbst geklickt
  // wurde (z. B. wenn der Netzwerk-Status erst nach dem ersten Rendern
  // eintrifft). Nach einem Klick bleibt der eigene Zustand massgeblich.
  const [touched, setTouched] = useState(false);
  const [seenInitial, setSeenInitial] = useState(initialStatus);
  const [seenUserId, setSeenUserId] = useState(userId);
  if (userId !== seenUserId) {
    setSeenUserId(userId);
    setSeenInitial(initialStatus);
    setStatus(initialStatus);
    setTouched(false);
  } else if (initialStatus !== seenInitial) {
    setSeenInitial(initialStatus);
    if (!touched) setStatus(initialStatus);
  }

  function commit(next: FollowStatus) {
    setTouched(true);
    setStatus(next);
    onChanged?.(next);
    // Ein Follow aendert app-weit, was sichtbar ist (Feed, Karte,
    // Profile, Zaehler) -- alles gegen die DB neu validieren.
    queryClient.invalidateQueries();
  }

  async function handleClick() {
    if (busy) return;
    void tap();
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me || me === userId) return;

      if (status) {
        const { data: deleted, error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", me)
          .eq("following_id", userId)
          .select();
        if (error) {
          toast.error(getErrorMessage(error, "Action failed"));
          return;
        }
        if (!deleted || deleted.length === 0) {
          // Kein Fehler, aber auch keine Zeile geloescht -- ein
          // Berechtigungsproblem, nicht als Erfolg darstellen.
          toast.error("Could not unfollow. Please try again.");
          return;
        }
        commit(undefined);
        toast.success(status === "accepted" ? "Unfollowed" : "Request withdrawn");
      } else {
        const { data: inserted, error } = await supabase
          .from("follows")
          .insert({ follower_id: me, following_id: userId })
          .select("status");
        // 23505 = Unique-Violation: es gab die Zeile schon, der Follow
        // steht also bereits -- kein echter Fehler.
        if (error && (error as { code?: string }).code !== "23505") {
          toast.error(getErrorMessage(error, "Action failed"));
          return;
        }
        // Der DB-Trigger entscheidet ueber pending/accepted; nur wenn er
        // uns nichts zurueckgibt, auf is_private zurueckfallen.
        const next =
          (inserted?.[0]?.status as FollowStatus) ?? (isPrivate ? "pending" : "accepted");
        commit(next);
        toast.success(next === "pending" ? "Requested" : "Following");
      }
    } finally {
      setBusy(false);
    }
  }

  const iconSize = size === "sm" ? 16 : 18;

  return (
    <Button
      size={size}
      variant={status ? "secondary" : "default"}
      className={className}
      disabled={busy}
      onClick={handleClick}
    >
      {status === "accepted" ? (
        <UserCheck size={iconSize} />
      ) : status === "pending" ? (
        <Clock size={iconSize} />
      ) : (
        <UserPlus size={iconSize} />
      )}
      <span className="ml-1">
        {status === "accepted"
          ? "Following"
          : status === "pending"
            ? "Requested"
            : isPrivate
              ? privateLabel
              : "Follow"}
      </span>
    </Button>
  );
}
