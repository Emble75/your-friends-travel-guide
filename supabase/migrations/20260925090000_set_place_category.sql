-- Die Art eines Ortes von Hand richtigstellen.
--
-- WARUM: Turi liest die Kategorie aus Googles Ortstyp. Das trifft meistens,
-- aber nicht immer -- eine Weinbar laeuft dort als "Restaurant", eine
-- Roesterei als "Shop". Auf der Karte steht die Art jetzt als Zeichen am
-- Pin, womit ein falscher Wert nicht mehr nur ungenau, sondern sichtbar
-- falsch ist. Wer gerade bewertet, weiss es besser als Google.
--
-- WARUM EINE FUNKTION UND KEINE UPDATE-REGEL: Auf places gibt es
-- absichtlich keine UPDATE-Policy -- sonst koennte jeder Name, Stadt und
-- Koordinaten fremder Orte ueberschreiben. RLS kann aber nicht auf
-- einzelne SPALTEN eingeschraenkt werden. Diese Funktion ist die
-- spaltengenaue Ausnahme: sie aendert ausschliesslich category und sonst
-- nichts.
--
-- BEWUSST OFFEN: Jede angemeldete Person darf die Art jedes Ortes
-- korrigieren, nicht nur die des selbst angelegten. Orte sind geteilte
-- Sachdaten wie der Name eines Cafes -- und wer gerade davorsteht, ist
-- die beste Quelle. Der Schaden einer falschen Angabe ist ein falsches
-- Symbol; der Schaden einer gesperrten Korrektur ist eine Karte, die
-- dauerhaft luegt.
--
-- Jede Anweisung einzeln ausfuehren.

-- ---------------------------------------------------------------------
-- SCHRITT 1 -- Die Funktion. Die Liste der Arten steht hier noch einmal,
-- damit sie sich nicht ueber die Schnittstelle umgehen laesst.
-- ---------------------------------------------------------------------
create or replace function public.set_place_category(p_place_id uuid, p_category text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if p_category not in (
    'Restaurant','Cafe','Bar','Hotel','Beach','Museum','Landmark','Nature','Other'
  ) then
    raise exception 'Unknown category: %', p_category;
  end if;

  update public.places set category = p_category where id = p_place_id;
end;
$$;

-- ---------------------------------------------------------------------
-- SCHRITT 2 -- Rechte entziehen.
-- ---------------------------------------------------------------------
revoke all on function public.set_place_category(uuid, text) from public, anon;

-- ---------------------------------------------------------------------
-- SCHRITT 3 -- Nur fuer Angemeldete.
-- ---------------------------------------------------------------------
grant execute on function public.set_place_category(uuid, text) to authenticated;
