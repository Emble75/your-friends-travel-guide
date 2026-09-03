-- Bereits gespeicherte Stadtnamen nachziehen.
--
-- Die Herleitung aus der Google-Adresse entfernte die Postleitzahl nur in
-- der Form `\d{4,5}` gefolgt von einem Leerzeichen. Das trifft die
-- deutsche Form ("10115 Berlin"), scheitert aber an jeder mehrteiligen:
--   "1200-161 Lisboa"   ->  "-161 Lisboa"
--   "00-001 Warszawa"   ->  "-001 Warszawa"
--   "1012 AB Amsterdam" ->  "AB Amsterdam"
-- Der Code ist korrigiert (cityFromAddress in src/lib/place-sync.ts),
-- greift aber nur fuer NEU angelegte Orte -- dieses Skript zieht die
-- bestehenden Zeilen nach.
--
-- BEWUSST OHNE Hilfssicht und ohne gemischte Abfragen: eine erste Fassung
-- legte eine View an und enthielt mehrere SELECTs hintereinander. Der
-- Supabase-SQL-Editor zeigt aber nur das Ergebnis der letzten Anweisung,
-- und das Anlegen einer View im public-Schema ist dort zusaetzlich
-- heikel. Jeder Schritt steht deshalb fuer sich und wird einzeln
-- ausgefuehrt.
--
-- Der Ausdruck wiederholt sich dadurch; das ist der Preis dafuer, dass
-- jede Anweisung allein lauffaehig ist. Er bildet dieselbe Bereinigung
-- nach wie der Code: fuehrende Zahlengruppe samt Bindestrichen und
-- Leerzeichen weg, danach ein evtl. folgendes Buchstabenpaar
-- (Niederlande: "1012 AB Amsterdam").

-- ---------------------------------------------------------------------
-- SCHRITT 1 -- Nur ansehen: was wuerde sich aendern?
-- ---------------------------------------------------------------------
select
  city as alt,
  nullif(btrim(regexp_replace(regexp_replace(city, '^[0-9][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), '') as neu,
  count(*) as anzahl
from public.places
where city is distinct from
      nullif(btrim(regexp_replace(regexp_replace(city, '^[0-9][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), '')
group by 1, 2
order by 3 desc;

-- ---------------------------------------------------------------------
-- SCHRITT 2 -- Zusammenstoesse pruefen.
--
-- Auf places liegt ein eindeutiger Index ueber (lower(name),
-- lower(city)). Gaebe es denselben Ort schon mit korrekt geschriebener
-- Stadt, wuerde Schritt 3 daran scheitern. Ist das Ergebnis leer, ist
-- Schritt 3 gefahrlos.
-- ---------------------------------------------------------------------
select p.id, p.name, p.city
from public.places p
join public.places q
  on lower(q.name) = lower(p.name)
 and lower(q.city) = lower(nullif(btrim(regexp_replace(regexp_replace(p.city, '^[0-9][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), ''))
 and q.id <> p.id;

-- ---------------------------------------------------------------------
-- SCHRITT 3 -- Korrigieren.
--
-- Zeilen aus Schritt 2 werden UEBERSPRUNGEN, statt das ganze Update
-- scheitern zu lassen. Sie muessten von Hand zusammengefuehrt werden
-- (Bewertungen umhaengen, Dublette loeschen) -- das gehoert nicht in ein
-- automatisches Skript.
-- ---------------------------------------------------------------------
update public.places p
set city = nullif(btrim(regexp_replace(regexp_replace(p.city, '^[0-9][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), '')
where p.city is distinct from
      nullif(btrim(regexp_replace(regexp_replace(p.city, '^[0-9][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), '')
  and nullif(btrim(regexp_replace(regexp_replace(p.city, '^[0-9][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), '') is not null
  and not exists (
    select 1 from public.places q
    where lower(q.name) = lower(p.name)
      and lower(q.city) = lower(nullif(btrim(regexp_replace(regexp_replace(p.city, '^[0-9][0-9[:space:]-]*', ''), '^[A-Z]{1,2}[[:space:]]+', '')), ''))
      and q.id <> p.id
  );

-- ---------------------------------------------------------------------
-- SCHRITT 4 -- Der deutsche Rueckfallwert in einer englischen Oberflaeche.
-- ---------------------------------------------------------------------
update public.places set city = 'Unknown' where city = 'Unbekannt';
