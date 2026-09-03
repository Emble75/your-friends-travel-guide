import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";

export type FollowStatus = "pending" | "accepted" | undefined;

export type MyNetwork = {
  me: string;
  followStatusById: Map<string, "pending" | "accepted">;
  blockedIds: Set<string>;
};

export const MY_NETWORK_KEY = ["my-network"] as const;

/**
 * Der eigene Netzwerk-Status (wem folge ich, wen habe ich blockiert).
 *
 * Das ist ausschliesslich der STARTWERT fuer die Buttons und der Filter
 * fuer Suchergebnisse -- nicht der laufende Zustand. Sobald jemand einen
 * Follow-Button drueckt, besitzt dieser Button seinen Zustand selbst
 * (siehe FollowButton). Genau daran ist die fruehere Version gescheitert:
 * ein Refetch dieser Query hat einen gerade bestaetigten Klick wieder
 * ueberschrieben.
 */
export function useMyNetwork() {
  return useQuery<MyNetwork>({
    queryKey: MY_NETWORK_KEY,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id ?? "";
      const [{ data: follows }, { data: blocksMade }, { data: blocksReceived }] = await Promise.all(
        [
          supabase.from("follows").select("following_id, status").eq("follower_id", me),
          supabase.from("blocks").select("blocked_id").eq("blocker_id", me),
          supabase.from("blocks").select("blocker_id").eq("blocked_id", me),
        ],
      );
      return {
        me,
        followStatusById: new Map(
          (follows ?? []).map((f) => [f.following_id, f.status as "pending" | "accepted"]),
        ),
        blockedIds: new Set([
          ...(blocksMade ?? []).map((b) => b.blocked_id),
          ...(blocksReceived ?? []).map((b) => b.blocker_id),
        ]),
      };
    },
    staleTime: 30_000,
  });
}
