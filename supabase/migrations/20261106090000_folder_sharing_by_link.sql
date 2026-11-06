-- Ordner werden nur noch ueber einen Link geteilt.
--
-- DAS PROBLEM: Bisher suchte der Besitzer Leute aus seinem Netzwerk aus
-- und legte damit direkt eine Freigabe an. Der Ordner tauchte beim
-- Empfaenger im Profil auf, ohne dass dieser etwas getan hatte oder
-- gefragt wurde.
--
-- Bei zwanzig Freunden ist das bequem. Bei einem Konto, dem tausend
-- Leute folgen, ist es ein Briefkasten ohne Schloss: Jeder Follower
-- koennte ungefragt Ordner in ein fremdes Profil legen. Das ist genau
-- die Mechanik, an der Empfehlungs-Apps zu Spam-Schleudern werden, und
-- sie laesst sich hinterher kaum zurueckdrehen.
--
-- DIE LOESUNG: Der Besitzer erzeugt einen Link. Wer ihn oeffnet, nimmt
-- die Freigabe damit selbst an. Niemand kann mehr etwas in ein fremdes
-- Profil schieben -- die Freigabe entsteht erst durch eine Handlung des
-- Empfaengers.
--
-- DER SCHLUESSEL IM LINK: Die Ordner-Kennung allein genuegt bewusst
-- NICHT. Wer einmal Zugriff hatte, kennt sie -- ohne eigenen Schluessel
-- koennte er sich nach dem Entfernen jederzeit selbst wieder
-- hinzufuegen. Der Schluessel laesst sich erneuern (neue Zufallszahl),
-- womit alle alten Links auf einen Schlag ungueltig werden.
--
-- Jede Anweisung einzeln ausfuehren.

-- ---------------------------------------------------------------------
-- SCHRITT 1 -- Der Schluessel am Ordner. Fuer bestehende Ordner wird er
-- automatisch erzeugt.
-- ---------------------------------------------------------------------
alter table public.trip_folders
  add column if not exists share_token uuid not null default gen_random_uuid();

-- ---------------------------------------------------------------------
-- SCHRITT 1b -- Den Schluessel vor allen ausser dem Besitzer verbergen.
--
-- RLS entscheidet ueber ZEILEN, nicht ueber Spalten: Wer den Ordner
-- sehen darf (also jeder, mit dem er geteilt ist), saehe sonst auch den
-- Schluessel -- und koennte sich nach dem Entfernen jederzeit selbst
-- wieder hinzufuegen. Spaltenrechte koennen genau das.
-- ---------------------------------------------------------------------
revoke select (share_token) on public.trip_folders from authenticated;

-- ---------------------------------------------------------------------
-- SCHRITT 1c -- Der Besitzer holt seinen Schluessel ueber diese
-- Funktion. Sie gibt ihn nur heraus, wenn der Ordner einem gehoert.
-- ---------------------------------------------------------------------
create or replace function public.folder_share_token(p_folder_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select share_token
  from public.trip_folders
  where id = p_folder_id and owner_id = auth.uid();
$$;

revoke all on function public.folder_share_token(uuid) from public, anon;
grant execute on function public.folder_share_token(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- SCHRITT 2 -- Einen Link einloesen.
--
-- Laeuft als SECURITY DEFINER, weil der Empfaenger sich selbst eine
-- Freigabe anlegt -- etwas, das die Regeln der Tabelle sonst (zu Recht)
-- nur dem Besitzer erlauben. Die Funktion prueft dafuer den Schluessel.
-- ---------------------------------------------------------------------
create or replace function public.redeem_folder_link(p_folder_id uuid, p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  select owner_id into v_owner
  from public.trip_folders
  where id = p_folder_id and share_token = p_token;

  -- Falscher oder veralteter Schluessel: nichts tun, nichts verraten.
  if v_owner is null then
    return false;
  end if;

  -- Der Besitzer braucht keine Freigabe fuer den eigenen Ordner.
  if v_owner = auth.uid() then
    return true;
  end if;

  insert into public.trip_folder_shares (folder_id, shared_with_id)
  values (p_folder_id, auth.uid())
  on conflict do nothing;

  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- SCHRITT 3 -- Rechte entziehen.
-- ---------------------------------------------------------------------
revoke all on function public.redeem_folder_link(uuid, uuid) from public, anon;

-- ---------------------------------------------------------------------
-- SCHRITT 4 -- Nur fuer Angemeldete.
-- ---------------------------------------------------------------------
grant execute on function public.redeem_folder_link(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- SCHRITT 5 -- Den Schluessel erneuern (macht alle alten Links
-- ungueltig). Nur der Besitzer darf das.
-- ---------------------------------------------------------------------
create or replace function public.rotate_folder_link(p_folder_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  update public.trip_folders
  set share_token = gen_random_uuid()
  where id = p_folder_id and owner_id = auth.uid()
  returning share_token into v_token;

  if v_token is null then
    raise exception 'Not your folder';
  end if;

  return v_token;
end;
$$;

revoke all on function public.rotate_folder_link(uuid) from public, anon;
grant execute on function public.rotate_folder_link(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- SCHRITT 6 -- Probe. Erwartet: deine Ordner, jeder mit einem Schluessel.
-- ---------------------------------------------------------------------
select id, name, share_token from public.trip_folders limit 5;
