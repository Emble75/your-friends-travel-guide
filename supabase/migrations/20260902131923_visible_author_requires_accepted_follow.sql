-- SICHERHEITSFIX: is_visible_author() hat den Follow-Status nie geprueft.
--
-- Die Funktion ist die zentrale Sichtbarkeitslogik hinter praktisch allen
-- RLS-Policies (reviews, review_images, ...). Sie fragt bisher nur, OB eine
-- Zeile in follows existiert:
--
--   EXISTS (SELECT 1 FROM follows f
--           WHERE f.follower_id = auth.uid() AND f.following_id = _author)
--
-- Die Spalte follows.status (pending|accepted) kam erst spaeter dazu, die
-- Funktion wurde dabei nicht mitgezogen. Folge: Sobald jemand einem
-- PRIVATEN Konto eine Follow-Anfrage schickt, entsteht sofort eine
-- follows-Zeile mit status='pending' -- und damit Lesezugriff auf dessen
-- Bewertungen, noch bevor die Anfrage angenommen wurde. Die Oberflaeche
-- verbirgt die Inhalte zwar (canSeeReviews in u.$username.tsx), aber die
-- Daten waren ueber die API abrufbar. Genau davor soll ein privates Konto
-- schuetzen.
--
-- Fix: Nur angenommene Follows zaehlen. Die Blocks-Pruefung bleibt
-- unveraendert.

CREATE OR REPLACE FUNCTION public.is_visible_author(_author UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = _author)
       OR (b.blocker_id = _author AND b.blocked_id = auth.uid())
  ) AND (
    _author = auth.uid() OR EXISTS (
      SELECT 1 FROM public.follows f
      WHERE f.follower_id = auth.uid()
        AND f.following_id = _author
        AND f.status = 'accepted'
    )
  );
$$;
REVOKE ALL ON FUNCTION public.is_visible_author(uuid) FROM PUBLIC, anon, authenticated;
