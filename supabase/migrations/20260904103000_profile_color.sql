-- Farbe des Profil-Hintergrunds, frei waehlbar pro Person.
--
-- Hintergrund: Das Profil war bisher eine schlichte weisse Karte. Ein
-- farbiges Band hinter dem Profilbild gibt jedem Konto ein eigenes
-- Gesicht -- und die Wahl der Farbe erlaubt es, das Band auf das eigene
-- Bild abzustimmen, statt allen dieselbe Markenfarbe aufzuzwingen.
--
-- Bewusst KEINE freie Farbeingabe: erlaubt sind nur die vier Farben der
-- Turi-Palette. Eine offene Auswahl wuerde die App binnen weniger
-- Profile in ein Farbchaos verwandeln, und genau die Geschlossenheit der
-- Palette ist der Punkt. Die Pruefregel unten setzt das in der Datenbank
-- durch, nicht bloss in der Oberflaeche -- sonst umginge sie jeder, der
-- die Anfrage direkt stellt.
--
-- Standard ist 'blue': das ist die Markenfarbe, und ohne Standard saehen
-- alle bestehenden Profile weiterhin gleich aus.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_color text NOT NULL DEFAULT 'blue';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_color_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profile_color_check
  CHECK (profile_color IN ('blue', 'grey', 'black', 'orange'));

-- Keine weiteren Rechte noetig: der bestehende GRANT auf public.profiles
-- gilt tabellenweit und schliesst neue Spalten ein, und die Regel
-- profiles_update_own (auth.uid() = id) begrenzt das Schreiben bereits
-- auf die eigene Zeile.
