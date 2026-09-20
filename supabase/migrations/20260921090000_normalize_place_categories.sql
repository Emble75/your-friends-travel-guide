-- Kategorien vereinheitlichen, damit sich auf der Karte danach filtern laesst.
--
-- AUSGANGSLAGE: In places.category lagen zwei Sorten Werte nebeneinander.
-- Von Hand angelegte Orte trugen einen unserer neun festen Werte
-- ("Cafe", "Restaurant", ...), ueber die Karte angelegte trugen Googles
-- Anzeigetext ("Coffee shop", "Italian restaurant", "Sonstiges" als
-- Rueckfall). Ein Filter "Cafes" haette damit einen Teil der Cafes nicht
-- gefunden.
--
-- Ab jetzt schreibt die App nur noch feste Werte (siehe
-- src/lib/categories.ts) und legt Googles maschinenlesbaren Typ
-- zusaetzlich in google_type ab. Dieses Skript zieht den Altbestand nach.
--
-- JEDE ANWEISUNG EINZELN AUSFUEHREN. Der Supabase-Editor zeigt nur das
-- Ergebnis der letzten -- bei mehreren auf einmal saehe man die Vorschau
-- in Schritt 2 nie.

-- ---------------------------------------------------------------------
-- SCHRITT 1 -- Die neue Spalte anlegen.
--
-- Sie ist rein beschreibend und traegt keine eigenen Rechte: places hat
-- bereits RLS, die Spalte faellt unter dieselben Regeln.
-- ---------------------------------------------------------------------
alter table public.places add column if not exists google_type text;

-- ---------------------------------------------------------------------
-- SCHRITT 2 -- Nur ansehen: was wuerde sich aendern?
--
-- Links der alte Wert, rechts der neue, dahinter die Anzahl. Bitte die
-- Zeile "Other" kurz pruefen: alles, was keiner Regel entsprach, landet
-- dort.
-- ---------------------------------------------------------------------
select
  category as alt,
  case
    when category in
      ('Restaurant','Cafe','Bar','Hotel','Beach','Museum','Landmark','Nature','Other')
      then category
    when lower(category) ~ 'coffee|caf[eé]|bakery|tea house|ice cream|dessert|patisserie'
      then 'Cafe'
    when lower(category) ~ 'restaurant|steak|\ydiner\y|bistro|pizzeria|food court|\ydeli\y'
      then 'Restaurant'
    when lower(category) ~ '\ybars?\y|\ypubs?\y|brewery|night ?club|taproom'
      then 'Bar'
    when lower(category) ~ 'hotel|hostel|motel|lodging|resort|guest house|bed & breakfast'
      then 'Hotel'
    when lower(category) ~ 'beach' then 'Beach'
    when lower(category) ~ 'museum|gallery|aquarium' then 'Museum'
    when lower(category) ~ '\yparks?\y|garden|\yzoo\y|\ytrail|hiking|nature|forest'
      then 'Nature'
    when lower(category) ~ 'attraction|landmark|monument|church|temple|mosque|synagogue'
      then 'Landmark'
    else 'Other'
  end as neu,
  count(*) as anzahl
from public.places
group by 1, 2
order by 3 desc;

-- ---------------------------------------------------------------------
-- SCHRITT 3 -- Umschreiben.
--
-- Dieselbe Zuordnung wie oben, jetzt als Update. Beruehrt nur Zeilen,
-- die sich tatsaechlich aendern.
-- ---------------------------------------------------------------------
update public.places
set category = case
    when lower(category) ~ 'coffee|caf[eé]|bakery|tea house|ice cream|dessert|patisserie'
      then 'Cafe'
    when lower(category) ~ 'restaurant|steak|\ydiner\y|bistro|pizzeria|food court|\ydeli\y'
      then 'Restaurant'
    when lower(category) ~ '\ybars?\y|\ypubs?\y|brewery|night ?club|taproom'
      then 'Bar'
    when lower(category) ~ 'hotel|hostel|motel|lodging|resort|guest house|bed & breakfast'
      then 'Hotel'
    when lower(category) ~ 'beach' then 'Beach'
    when lower(category) ~ 'museum|gallery|aquarium' then 'Museum'
    when lower(category) ~ '\yparks?\y|garden|\yzoo\y|\ytrail|hiking|nature|forest'
      then 'Nature'
    when lower(category) ~ 'attraction|landmark|monument|church|temple|mosque|synagogue'
      then 'Landmark'
    else 'Other'
  end
where category not in
  ('Restaurant','Cafe','Bar','Hotel','Beach','Museum','Landmark','Nature','Other');

-- ---------------------------------------------------------------------
-- SCHRITT 4 -- Kontrolle: was steht jetzt drin?
--
-- Erwartet: ausschliesslich die neun festen Werte.
-- ---------------------------------------------------------------------
select category, count(*) from public.places group by 1 order by 2 desc;
