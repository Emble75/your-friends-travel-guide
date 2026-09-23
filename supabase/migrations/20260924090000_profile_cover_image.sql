-- Ein Bild als Titelbild des Profils.
--
-- Bisher war das Band hinter dem Profilbild eine von zehn Farben. Eine
-- Farbe sagt nichts ueber jemanden, der Orte empfiehlt -- ein Foto aus
-- Lissabon schon. Die Spalte haelt den Pfad im Storage-Eimer "avatars",
-- genau wie avatar_url; ein eigener Eimer waere eine zweite Stelle mit
-- eigenen Regeln, ohne dass sich etwas daran unterscheidet.
--
-- profile_color bleibt stehen. Sie wird von der Oberflaeche nicht mehr
-- gelesen, aber ein Loeschen waere eine einbahnige Aenderung an echten
-- Daten fuer null Gewinn -- die Spalte kostet nichts.
--
-- Jede Anweisung einzeln ausfuehren.

-- ---------------------------------------------------------------------
-- SCHRITT 1 -- Die Spalte. Leer heisst: kein Bild, das helle Blau greift.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists cover_url text;

-- ---------------------------------------------------------------------
-- SCHRITT 2 -- Probe. Erwartet: die Spalte taucht auf, ueberall leer.
-- ---------------------------------------------------------------------
select id, username, cover_url from public.profiles limit 5;
