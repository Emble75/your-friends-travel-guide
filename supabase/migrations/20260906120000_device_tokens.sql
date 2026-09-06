-- Geraete-Adressen fuer Push-Nachrichten.
--
-- Apple vergibt jedem installierten Exemplar der App eine Adresse
-- ("device token"), an die Nachrichten geschickt werden. Wir muessen sie
-- speichern, um jemanden ueberhaupt erreichen zu koennen.
--
-- WARUM DIE ZUGRIFFSREGELN HIER STRENGER SIND ALS SONST:
-- Diese Tabelle beantwortet die Frage "auf welchen Geraeten ist diese
-- Person erreichbar, und wann war sie zuletzt aktiv". Das geht
-- niemanden ausser der Person selbst etwas an -- auch Follower nicht.
-- Anders als bei Bewertungen oder Profilen gibt es hier deshalb KEINE
-- Lesefreigabe fuer andere. Der Versand selbst laeuft ueber den
-- Service-Role-Schluessel auf dem Server, der die Regeln umgeht; die
-- App selbst braucht nie fremde Adressen zu sehen.

CREATE TABLE IF NOT EXISTS public.device_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  platform    text NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios', 'android', 'web')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- Der Schluessel ist die Adresse selbst, nicht ein Zaehler: dieselbe
-- Adresse darf nur einmal existieren.
--
-- Wechselt ein Geraet den Besitzer, kann die App das NICHT allein
-- aufloesen: die neue Person darf die fremde Zeile weder aendern noch
-- loeschen -- genau das sollen die Regeln ja verhindern. Der uebliche
-- Weg beim Abmelden ist deshalb, die eigene Zeile zu loeschen. Bleibt
-- eine Zeile doch verwaist (App geloescht, ohne sich abzumelden),
-- raeumt sie der Versand auf: Apple meldet unzustellbare Adressen
-- ausdruecklich zurueck, und der Server loescht sie dann.
--
-- Der Fehlerfall ist damit "die neue Person bekommt vorerst keine
-- Nachrichten" -- nicht "sie bekommt fremde".

CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON public.device_tokens (user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_tokens_select_own" ON public.device_tokens;
CREATE POLICY "device_tokens_select_own"
  ON public.device_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_insert_own" ON public.device_tokens;
CREATE POLICY "device_tokens_insert_own"
  ON public.device_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_update_own" ON public.device_tokens;
CREATE POLICY "device_tokens_update_own"
  ON public.device_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens_delete_own" ON public.device_tokens;
CREATE POLICY "device_tokens_delete_own"
  ON public.device_tokens FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
