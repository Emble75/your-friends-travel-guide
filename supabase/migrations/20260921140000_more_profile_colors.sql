-- Mehr Farben fuer das Band hinter dem Profilbild.
--
-- Bisher waren genau vier erlaubt (blue, grey, black, orange) -- die
-- vier Farben der Oberflaechen-Palette. Die Begruendung damals: Eine
-- offene Farbwahl wuerde deren Geschlossenheit zerstoeren.
--
-- Das gilt weiterhin fuer die OBERFLAECHE: Knoepfe, Leisten und Zeichen
-- muessen aus einer Hand kommen. Das Profilband ist aber keine
-- Oberflaeche, sondern der einzige Platz, an dem das Profil einer Person
-- ihr gehoert -- und vier Moeglichkeiten sind dafuer zu wenig.
--
-- Die sechs neuen sind trotzdem nicht frei gegriffen: Sie liegen auf
-- einem gemeinsamen Helligkeits- und Buntheitsband (siehe --cover-* in
-- styles.css) und bekommen dieselbe Verlaufsbehandlung wie die
-- bisherigen. Die Auswahl bleibt geschlossen -- nur laenger.
--
-- Die Pruefregel steht weiterhin in der DATENBANK und nicht bloss in der
-- Oberflaeche: Sonst umginge sie jeder, der die Anfrage direkt stellt.
--
-- Jede Anweisung einzeln ausfuehren.

-- ---------------------------------------------------------------------
-- SCHRITT 1 -- Die alte Regel loesen.
-- ---------------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_profile_color_check;

-- ---------------------------------------------------------------------
-- SCHRITT 2 -- Die neue Regel setzen.
--
-- Reihenfolge wie in der Oberflaeche (PROFILE_COLORS in
-- src/components/turi/ProfileCover.tsx). Kommt dort eine Farbe dazu,
-- gehoert sie hier mit hinein -- sonst lehnt die Datenbank sie ab, und
-- das Speichern des Profils schlaegt fehl.
-- ---------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_profile_color_check
  check (profile_color in (
    'blue', 'teal', 'green', 'sand', 'orange', 'red', 'pink', 'purple', 'grey', 'black'
  ));

-- ---------------------------------------------------------------------
-- SCHRITT 3 -- Kontrolle: Welche Farben sind im Einsatz?
-- Erwartet: nur Werte aus der Liste oben.
-- ---------------------------------------------------------------------
select profile_color, count(*) from public.profiles group by 1 order by 2 desc;
