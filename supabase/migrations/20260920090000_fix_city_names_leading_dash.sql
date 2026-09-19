-- Nachbesserung zu 20260903135443_fix_city_names.sql.
--
-- WARUM ES EINE ZWEITE FASSUNG BRAUCHT:
--
-- Das erste Skript verlangte, dass der Stadtname mit einer ZIFFER
-- beginnt (^[0-9]...). Das passt auf die rohe Google-Adresse
-- ("1200-161 Lisboa"), aber NICHT auf den Wert, der tatsaechlich in der
-- Datenbank steht. Denn dort liegt bereits das Ergebnis des alten,
-- fehlerhaften Codes: der hatte die fuehrenden Ziffern schon entfernt
-- und den Bindestrich stehen lassen -- "-161 Lisboa".
--
-- Das erste Skript lief deshalb fehlerfrei durch, meldete Erfolg und
-- ruehrte genau die betroffenen Zeilen nicht an.
--
-- Korrigiert ist nur die erste Zeichenklasse: [0-9] -> [0-9-], also
-- "beginnt mit Ziffer ODER Bindestrich". Geprueft gegen:
--   "-161 Lisboa"      -> "Lisboa"
--   "-001 Warszawa"    -> "Warszawa"
--   "1200-161 Lisboa"  -> "Lisboa"   (wie bisher)
--   "10115 Berlin"     -> "Berlin"   (wie bisher)
--   "1012 AB Amsterdam"-> "Amsterdam" (wie bisher)
--   "Lisboa", "Koeln"  -> unveraendert
--
-- Wie beim ersten Skript: jede Anweisung steht fuer sich und wird
-- EINZELN ausgefuehrt. Der Supabase-Editor zeigt nur das Ergebnis der
-- letzten Anweisung -- bei mehreren auf einmal saehe man die
-- Vorschau nie.

-- ---------------------------------------------------------------------
-- SCHRITT 1 -- Nur ansehen: was wuerde sich jetzt aendern?
-- ---------------------------------------------------------------------
select
  city as alt,
  nullif(btrim(regexp_replace(regexp_replace(city, '^[0-9-][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), '') as neu,
  count(*) as anzahl
from public.places
where city is distinct from
      nullif(btrim(regexp_replace(regexp_replace(city, '^[0-9-][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), '')
group by 1, 2
order by 3 desc;

-- ---------------------------------------------------------------------
-- SCHRITT 2 -- Korrigieren.
--
-- Zeilen, bei denen der bereinigte Name mit einem bestehenden Ort
-- kollidieren wuerde (eindeutiger Index ueber lower(name), lower(city)),
-- werden UEBERSPRUNGEN statt das ganze Update scheitern zu lassen.
-- ---------------------------------------------------------------------
update public.places p
set city = nullif(btrim(regexp_replace(regexp_replace(p.city, '^[0-9-][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), '')
where p.city is distinct from
      nullif(btrim(regexp_replace(regexp_replace(p.city, '^[0-9-][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), '')
  and nullif(btrim(regexp_replace(regexp_replace(p.city, '^[0-9-][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), '') is not null
  and not exists (
    select 1 from public.places q
    where lower(q.name) = lower(p.name)
      and lower(q.city) = lower(nullif(btrim(regexp_replace(regexp_replace(p.city, '^[0-9-][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), ''))
      and q.id <> p.id
  );
