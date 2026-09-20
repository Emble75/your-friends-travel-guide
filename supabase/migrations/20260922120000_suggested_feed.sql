-- Der zweite Feed-Reiter: Vorschlaege von Leuten, denen man nicht folgt.
--
-- WAS SICH DAMIT AENDERT, UND WAS AUSDRUECKLICH NICHT:
--
-- Bisher galt in der ganzen App eine einzige Regel: Bewertungen sieht
-- nur, wer der Person folgt (is_visible_author). Ein Vorschlags-Feed
-- widerspricht dem naturgemaess -- er zeigt Fremde.
--
-- Diese Migration aendert is_visible_author NICHT und ruehrt auch keine
-- RLS-Regel an. Das ist wichtig: Wuerde man die allgemeine Regel
-- aufweichen, wuerden oeffentliche Konten SOFORT UEBERALL sichtbar --
-- auf der Discover-Karte, auf jeder Ortsseite unter "From your circle",
-- in jedem Durchschnitt. Genau das, was Turi von Google Maps
-- unterscheidet, waere damit weg.
--
-- Stattdessen gibt es EINE Funktion, die genau die Daten fuer diesen
-- einen Reiter herausgibt. Sie laeuft als SECURITY DEFINER, umgeht die
-- Regeln also bewusst -- aber nur in dieser Form, nur fuer oeffentliche
-- Konten, und nur fuer angemeldete Nutzer.
--
-- WER NICHT ERSCHEINT:
--   * private Konten (vollstaendig unsichtbar, wie bisher)
--   * man selbst
--   * Leute, denen man bereits folgt (die stehen im ersten Reiter)
--   * Blockierte und Blockierende, in beide Richtungen
--
-- ZUR SORTIERUNG: Zuerst in der Naehe, dann nach Aktualitaet. Eine
-- Gewichtung nach "Beliebtheit" waere bei einer App ohne nennenswerte
-- Nutzerzahlen Rauschen, das wie eine Rangliste aussieht -- das kommt,
-- wenn es echte Zahlen zu gewichten gibt. Findet sich in der Naehe
-- nichts, wird ohne Umkreis gesucht, statt eine leere Seite zu zeigen.
--
-- DATENSCHUTZ: Dass oeffentliche Konten oeffentlich sind, muss in der
-- Datenschutzerklaerung stehen, bevor das live geht.
--
-- Jede Anweisung einzeln ausfuehren.

-- ---------------------------------------------------------------------
-- SCHRITT 1 -- Die Funktion.
-- ---------------------------------------------------------------------
create or replace function public.suggested_feed(
  p_limit integer default 20,
  p_before timestamptz default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km double precision default 150
)
returns setof jsonb
language sql
security definer
stable
set search_path = public
as $$
  with viewer as (
    select auth.uid() as id
  ),
  candidates as (
    select
      r.id, r.rating, r.text, r.created_at, r.user_id,
      pr.username, pr.display_name, pr.avatar_url,
      pl.id as place_id, pl.name as place_name, pl.city, pl.category,
      pl.lat, pl.lng, pl.google_place_id
    from public.reviews r
    join public.profiles pr on pr.id = r.user_id
    join public.places pl on pl.id = r.place_id
    cross join viewer v
    where v.id is not null
      and pr.is_private = false
      and r.user_id <> v.id
      and not exists (
        select 1 from public.follows f
        where f.follower_id = v.id and f.following_id = r.user_id
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = v.id and b.blocked_id = r.user_id)
           or (b.blocker_id = r.user_id and b.blocked_id = v.id)
      )
      and (p_before is null or r.created_at < p_before)
  ),
  -- Umkreis als Rechteck statt als Kreis: Fuer "ist das hier in der
  -- Gegend" genau genug, und es kommt ohne Geo-Erweiterung aus. Der
  -- Laengengrad wird mit dem Breitengrad enger, daher der Kosinus.
  near as (
    select * from candidates c
    where p_lat is not null
      and c.lat is not null and c.lng is not null
      and c.lat between p_lat - p_radius_km / 111.0
                    and p_lat + p_radius_km / 111.0
      and c.lng between p_lng - p_radius_km / (111.0 * greatest(cos(radians(p_lat)), 0.01))
                    and p_lng + p_radius_km / (111.0 * greatest(cos(radians(p_lat)), 0.01))
  ),
  picked as (
    select * from near
    union all
    select * from candidates where not exists (select 1 from near)
  )
  select jsonb_build_object(
    'id', p.id,
    'rating', p.rating,
    'text', p.text,
    'created_at', p.created_at,
    'user_id', p.user_id,
    'trip_folder_id', null,
    'profiles', jsonb_build_object(
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url
    ),
    'places', jsonb_build_object(
      'id', p.place_id,
      'name', p.place_name,
      'city', p.city,
      'category', p.category,
      'lat', p.lat,
      'lng', p.lng,
      'google_place_id', p.google_place_id
    ),
    'review_images', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object('id', ri.id, 'image_url', ri.image_url, 'position', ri.position)
                 order by ri.position
               )
        from public.review_images ri
        where ri.review_id = p.id
      ),
      '[]'::jsonb
    )
  )
  from picked p
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------------
-- SCHRITT 2 -- Rechte entziehen.
-- ---------------------------------------------------------------------
revoke all on function public.suggested_feed(integer, timestamptz, double precision, double precision, double precision) from public, anon;

-- ---------------------------------------------------------------------
-- SCHRITT 3 -- Nur fuer Angemeldete. Nicht fuer anon: Die Funktion gibt
-- fremde Inhalte heraus, das soll niemand ohne Konto abgreifen koennen.
-- ---------------------------------------------------------------------
grant execute on function public.suggested_feed(integer, timestamptz, double precision, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------
-- SCHRITT 4 -- Probe. Erwartet: eine Liste (oder nichts, falls es noch
-- keine oeffentlichen Konten ausser dir gibt). Wichtig ist, dass keine
-- Fehlermeldung kommt.
-- ---------------------------------------------------------------------
select jsonb_pretty(s) from public.suggested_feed(3) s;
