-- Das Profil eines OEFFENTLICHEN Kontos zeigt seine Bewertungen.
--
-- DAS PROBLEM, DAS DAMIT VERSCHWINDET:
--
-- Der Vorschlags-Reiter im Feed zeigt Beitraege von Leuten, denen man
-- nicht folgt (siehe suggested_feed). Tippt man dort auf den Namen,
-- stand auf dem Profil bisher "No posts yet" -- die Seite fragt die
-- reviews-Tabelle direkt ab, und dort gilt weiterhin die strenge Regel
-- is_visible_author: sichtbar nur mit angenommener Folge-Beziehung.
--
-- Die Oberflaeche wollte es laengst anders: canSeeReviews ist fuer
-- oeffentliche Konten bereits true. Es fehlten nur die Daten.
--
-- WARUM NICHT EINFACH DIE RLS-REGEL LOCKERN:
--
-- Weil das ueberall gelten wuerde. Oeffentliche Konten erschienen dann
-- sofort auf der Discover-Karte, in den Durchschnitten unter "From your
-- circle" und auf jeder Ortsseite. Genau das unterscheidet Turi von
-- Google Maps -- man sieht nur den eigenen Kreis. Diese Migration
-- aendert deshalb KEINE RLS-Regel, so wie suggested_feed es auch nicht
-- getan hat.
--
-- Stattdessen wieder eine eng geschnittene Funktion: sie gibt die
-- Bewertungen EINER Person heraus, und nur dann, wenn diese Person ihr
-- Konto oeffentlich gestellt hat.
--
-- WER NICHTS BEKOMMT:
--   * Nicht angemeldete Besucher
--   * Wer die Person blockiert hat oder von ihr blockiert wurde
--   * Jeder, der ein privates Konto abfragt (leeres Ergebnis)
--
-- Jede Anweisung einzeln ausfuehren.

-- ---------------------------------------------------------------------
-- SCHRITT 1 -- Die Funktion.
-- ---------------------------------------------------------------------
create or replace function public.public_profile_reviews(p_user_id uuid)
returns setof jsonb
language sql
security definer
stable
set search_path = public
as $$
  with viewer as (
    select auth.uid() as id
  )
  select jsonb_build_object(
    'id', r.id,
    'rating', r.rating,
    'text', r.text,
    'created_at', r.created_at,
    'user_id', r.user_id,
    'trip_folder_id', r.trip_folder_id,
    'profiles', jsonb_build_object(
      'username', pr.username,
      'display_name', pr.display_name,
      'avatar_url', pr.avatar_url
    ),
    'places', jsonb_build_object(
      'id', pl.id,
      'name', pl.name,
      'city', pl.city,
      'category', pl.category,
      'lat', pl.lat,
      'lng', pl.lng,
      'google_place_id', pl.google_place_id
    ),
    'review_images', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object('id', ri.id, 'image_url', ri.image_url, 'position', ri.position)
                 order by ri.position
               )
        from public.review_images ri
        where ri.review_id = r.id
      ),
      '[]'::jsonb
    )
  )
  from public.reviews r
  join public.profiles pr on pr.id = r.user_id
  join public.places pl on pl.id = r.place_id
  cross join viewer v
  where v.id is not null
    and r.user_id = p_user_id
    and pr.is_private = false
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = v.id and b.blocked_id = r.user_id)
         or (b.blocker_id = r.user_id and b.blocked_id = v.id)
    )
  order by r.created_at desc;
$$;

-- ---------------------------------------------------------------------
-- SCHRITT 2 -- Rechte entziehen.
-- ---------------------------------------------------------------------
revoke all on function public.public_profile_reviews(uuid) from public, anon;

-- ---------------------------------------------------------------------
-- SCHRITT 3 -- Nur fuer Angemeldete.
-- ---------------------------------------------------------------------
grant execute on function public.public_profile_reviews(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- SCHRITT 4 -- Probe. Setze eine echte Nutzer-Kennung ein, zum Beispiel
-- die von test5. Erwartet: eine Liste, oder nichts bei einem privaten
-- Konto. Wichtig ist, dass keine Fehlermeldung kommt.
-- ---------------------------------------------------------------------
-- select jsonb_pretty(s) from public.public_profile_reviews('HIER-DIE-UUID') s;
