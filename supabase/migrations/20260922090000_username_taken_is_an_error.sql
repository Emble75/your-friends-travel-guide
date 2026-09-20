-- Ein vergebener Benutzername ist ein Fehler, keine stille Umbenennung.
--
-- AUSGANGSLAGE: Der Trigger handle_new_user() haengte bei Kollision
-- einfach eine Zahl an -- aus "tom" wurde "tom1". Wer sich anmeldete,
-- bekam hinterher eine Mitteilung, dass er jetzt anders heisst. Das ist
-- genau die Sorte Entscheidung, die niemand fuer einen treffen soll: Der
-- Name steht im Profil, in geteilten Links und in der Personensuche.
--
-- Nebenbei wurden PUNKTE stillschweigend entfernt ('[^a-z0-9_]'), obwohl
-- das Anmeldeformular sie ausdruecklich erlaubt -- aus "tom.smith" wurde
-- kommentarlos "tomsmith".
--
-- AB JETZT:
--   * Wunschname vergeben  -> die Anmeldung schlaegt fehl, das Formular
--                             sagt es VORHER (siehe username_available)
--   * Punkte               -> bleiben erhalten
--   * KEIN Wunschname      -> wie bisher ein freier Name aus der
--                             E-Mail-Adresse. Dieser Zweig ist fuer
--                             Anmeldewege ohne Namensfeld gedacht; dort
--                             gibt es keine Eingabe, die man ablehnen
--                             koennte.
--
-- Jede Anweisung einzeln ausfuehren.

-- ---------------------------------------------------------------------
-- SCHRITT 1 -- Die Pruefung fuer das Formular.
--
-- SECURITY DEFINER, weil sie schon VOR der Anmeldung gebraucht wird --
-- zu diesem Zeitpunkt darf der Aufrufer die Profiltabelle noch gar nicht
-- lesen. Sie gibt deshalb auch nur ja/nein zurueck, nie Daten.
--
-- Bewusst in Kauf genommen: Damit laesst sich abfragen, ob es einen
-- bestimmten Namen gibt. Das tut jedes Anmeldeformular mit Namenspruefung,
-- und Benutzernamen sind in Turi ohnehin oeffentlich (Personensuche).
-- ---------------------------------------------------------------------
create or replace function public.username_available(name text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles p where p.username = lower(btrim(name))
  );
$$;

-- ---------------------------------------------------------------------
-- SCHRITT 2 -- Rechte: niemand ausser den beiden Rollen der App.
-- ---------------------------------------------------------------------
revoke all on function public.username_available(text) from public;

-- ---------------------------------------------------------------------
-- SCHRITT 3 -- Ausfuehren erlauben (anon = noch nicht angemeldet).
-- ---------------------------------------------------------------------
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- SCHRITT 4 -- Der neue Trigger.
--
-- Die Ausnahme rollt die gesamte Anmeldung zurueck: Es entsteht KEIN
-- halbes Konto ohne Profil. Der eindeutige Index auf profiles.username
-- faengt zusaetzlich den seltenen Fall ab, dass zwei Anmeldungen mit
-- demselben Namen in derselben Sekunde ankommen.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text;
  base text;
  candidate text;
  n int := 0;
begin
  requested := nullif(
    lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '[^a-z0-9._]', '', 'g')),
    ''
  );

  if requested is not null then
    if exists (select 1 from public.profiles p where p.username = requested) then
      raise exception 'username_taken'
        using errcode = '23505', hint = 'Choose a different username.';
    end if;
    insert into public.profiles (id, username, display_name)
    values (new.id, requested, coalesce(new.raw_user_meta_data->>'display_name', requested));
    return new;
  end if;

  base := lower(regexp_replace(coalesce(split_part(new.email, '@', 1), 'turi'), '[^a-z0-9._]', '', 'g'));
  if base = '' then base := 'turi'; end if;
  candidate := base;
  while exists (select 1 from public.profiles p where p.username = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  insert into public.profiles (id, username, display_name)
  values (new.id, candidate, coalesce(new.raw_user_meta_data->>'display_name', candidate));
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- SCHRITT 5 -- Probe: beide Antworten sollten kommen.
-- Erwartet: false fuer einen vorhandenen Namen, true fuer Unsinn.
-- ---------------------------------------------------------------------
select
  (select username from public.profiles limit 1) as vorhandener_name,
  public.username_available((select username from public.profiles limit 1)) as sollte_false_sein,
  public.username_available('zzz_gibt_es_sicher_nicht_9182') as sollte_true_sein;
