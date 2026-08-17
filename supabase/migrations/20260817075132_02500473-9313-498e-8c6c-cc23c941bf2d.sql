ALTER TABLE public.places
  ADD COLUMN google_place_id TEXT,
  ADD COLUMN address TEXT,
  ADD COLUMN lat DOUBLE PRECISION,
  ADD COLUMN lng DOUBLE PRECISION;
CREATE UNIQUE INDEX places_google_place_id_uniq ON public.places (google_place_id) WHERE google_place_id IS NOT NULL;