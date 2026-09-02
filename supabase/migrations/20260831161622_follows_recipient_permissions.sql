-- Fix: the recipient of a follow (following_id) could not accept/decline
-- follow requests or remove followers.
--
-- public.follows only ever granted INSERT/DELETE to the follower
-- (auth.uid() = follower_id). Three app features need the *other* party
-- (following_id) to change the row instead:
--   1. Accept a follow request (UPDATE status -> 'accepted'): there was no
--      UPDATE grant on the table at all, so this always failed outright
--      with "permission denied for table follows".
--   2. Decline a follow request (DELETE): silently blocked by RLS (0 rows
--      affected, no error), so the app showed a false "declined" success
--      toast while the request stayed pending forever.
--   3. Remove a follower (DELETE): same silent no-op as above.

-- 1) Let the recipient flip a pending request to accepted. Column-level
-- grant restricts this to the `status` column only, so a malicious update
-- can't repoint follower_id/following_id even if the RLS check were ever
-- loosened.
GRANT UPDATE (status) ON public.follows TO authenticated;

DROP POLICY IF EXISTS "follows_update_status_by_recipient" ON public.follows;
CREATE POLICY "follows_update_status_by_recipient"
  ON public.follows
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = following_id)
  WITH CHECK (auth.uid() = following_id AND status = 'accepted');

-- 2) Let the recipient delete the row too (decline request / remove
-- follower), alongside the existing follower-driven delete (unfollow).
DROP POLICY IF EXISTS "follows_delete_by_recipient" ON public.follows;
CREATE POLICY "follows_delete_by_recipient"
  ON public.follows
  FOR DELETE
  TO authenticated
  USING (auth.uid() = following_id);
