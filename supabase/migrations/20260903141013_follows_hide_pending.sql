-- Offene Follow-Anfragen vor Dritten verbergen.
--
-- Die Leseregel auf follows lautet bisher USING (true): jeder eingeloggte
-- Nutzer kann die gesamte Tabelle abfragen. Fuer angenommene Follows ist
-- das richtig -- Follower-Zahlen und -Listen sind in der App ohnehin
-- sichtbar, und die Suche braucht den eigenen Status zu jeder Person.
--
-- Fuer OFFENE Anfragen ist es das nicht. Dass jemand ein privates Konto
-- angefragt hat und noch auf Antwort wartet, ist eine private Information
-- zwischen den beiden Beteiligten. Bisher konnte sie jeder auslesen.
--
-- Neue Regel: angenommene Follows bleiben fuer alle lesbar, offene nur
-- fuer die anfragende und die angefragte Person.
--
-- Vertraeglich mit der App: die Profilseite zaehlt Follower ausdruecklich
-- mit .eq("status","accepted"), die Suche liest nur eigene Zeilen
-- (follower_id = ich), und die Anfragenliste im eigenen Profil liest nur
-- Zeilen mit following_id = ich. Alle drei Faelle sind abgedeckt.

DROP POLICY IF EXISTS "follows_select" ON public.follows;

CREATE POLICY "follows_select"
  ON public.follows
  FOR SELECT
  TO authenticated
  USING (
    status = 'accepted'
    OR auth.uid() = follower_id
    OR auth.uid() = following_id
  );
