-- Bereits gespeicherte Stadtnamen nachziehen.
--
-- Die Herleitung aus der Google-Adresse entfernte die Postleitzahl nur in
-- der Form `\d{4,5}` gefolgt von einem Leerzeichen. Das trifft die
-- deutsche Form ("10115 Berlin"), scheitert aber an jeder mehrteiligen:
--   "1200-161 Lisboa"  ->  "-161 Lisboa"
--   "00-001 Warszawa"  ->  "-001 Warszawa"
--   "1012 AB Amsterdam" -> "AB Amsterdam"
-- Der Code ist korrigiert, greift aber nur fuer NEU angelegte Orte --
-- dieses Skript zieht die bestehenden Zeilen nach.
--
-- Es bildet dieselbe Bereinigung nach wie cityFromAddress() in
-- src/lib/place-sync.ts: fuehrende Zahlengruppe samt Bindestrichen weg,
-- danach ein evtl. folgendes Buchstabenpaar.

-- Hilfsausdruck als Sicht, damit die Logik nur einmal dasteht.
CREATE OR REPLACE VIEW public._city_fix AS
SELECT
  id,
  name,
  city AS old_city,
  NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(city, '^[0-9][0-9[:space:]-]*', ''),
        '^[A-Z]{1,2}[[:space:]]+', ''
      )
    ),
    ''
  ) AS new_city
FROM public.places;

-- ---------------------------------------------------------------------
-- SCHRITT 1 -- Nur ansehen: was wuerde sich aendern?
-- ---------------------------------------------------------------------
SELECT old_city, new_city, count(*) AS betroffen
FROM public._city_fix
WHERE new_city IS DISTINCT FROM old_city
GROUP BY old_city, new_city
ORDER BY betroffen DESC;

-- ---------------------------------------------------------------------
-- SCHRITT 2 -- Zusammenstoesse pruefen.
--
-- Auf places liegt ein eindeutiger Index ueber (lower(name),
-- lower(city)). Gaebe es denselben Ort schon einmal mit korrekt
-- geschriebener Stadt, wuerde das Update daran scheitern. Diese Abfrage
-- listet solche Faelle -- ist sie leer, ist Schritt 3 gefahrlos.
-- ---------------------------------------------------------------------
SELECT f.id, f.name, f.old_city, f.new_city
FROM public._city_fix f
JOIN public.places p
  ON lower(p.name) = lower(f.name)
 AND lower(p.city) = lower(f.new_city)
 AND p.id <> f.id
WHERE f.new_city IS DISTINCT FROM f.old_city;

-- ---------------------------------------------------------------------
-- SCHRITT 3 -- Korrigieren.
--
-- Zeilen mit Zusammenstoss werden bewusst UEBERSPRUNGEN, statt das ganze
-- Update scheitern zu lassen. Sie muessten von Hand zusammengefuehrt
-- werden (Bewertungen umhaengen, Dublette loeschen) -- das gehoert nicht
-- in ein automatisches Skript.
-- ---------------------------------------------------------------------
UPDATE public.places p
SET city = f.new_city
FROM public._city_fix f
WHERE p.id = f.id
  AND f.new_city IS DISTINCT FROM f.old_city
  AND NOT EXISTS (
    SELECT 1 FROM public.places q
    WHERE lower(q.name) = lower(f.name)
      AND lower(q.city) = lower(f.new_city)
      AND q.id <> f.id
  );

-- Der deutsche Rueckfallwert in einer englischen Oberflaeche.
UPDATE public.places SET city = 'Unknown' WHERE city = 'Unbekannt';

DROP VIEW public._city_fix;
