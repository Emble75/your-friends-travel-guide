// Typ-Erweiterung fuer das extern verwaltete Supabase-Projekt.
// types.ts wird automatisch generiert und kennt einige Tabellen/Spalten des
// externen Projekts nicht (trip_folders, trip_folder_shares, saved_places,
// follows.status, profiles.is_private). Hier werden sie ergaenzt, ohne die
// generierte Datei zu veraendern.
import type { Database as GeneratedDatabase, Json } from "./types";

type GenPublic = GeneratedDatabase["public"];
type GenTables = GenPublic["Tables"];

type WithColumns<T extends { Row: unknown; Insert: unknown; Update: unknown }, R, I, U> = Omit<
  T,
  "Row" | "Insert" | "Update"
> & {
  Row: T["Row"] & R;
  Insert: T["Insert"] & I;
  Update: T["Update"] & U;
};

type TripFolderRow = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
};

type TripFolderShareRow = {
  folder_id: string;
  shared_with_id: string;
  created_at: string;
};

type SavedPlaceRow = {
  user_id: string;
  place_id: string;
  created_at: string;
};

type DeviceTokenRow = {
  token: string;
  user_id: string;
  platform: string;
  created_at: string;
  last_seen_at: string;
};

export type AppDatabase = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GenPublic, "Tables" | "Functions"> & {
    // username_available: darf schon VOR der Anmeldung aufgerufen werden
    // (SECURITY DEFINER, gibt nur ja/nein zurueck). Siehe die Migration
    // 20260922090000_username_taken_is_an_error.sql.
    Functions: GenPublic["Functions"] & {
      username_available: {
        Args: { name: string };
        Returns: boolean;
      };
      // suggested_feed: der zweite Feed-Reiter. Gibt fertige
      // Bewertungs-Objekte heraus (Json), weil die Sichtbarkeitsregel
      // der Tabelle fremde Bewertungen ausdruecklich nicht durchlaesst --
      // siehe Migration 20260922120000_suggested_feed.sql.
      suggested_feed: {
        Args: {
          p_limit?: number;
          p_before?: string | null;
          p_lat?: number | null;
          p_lng?: number | null;
          p_radius_km?: number;
        };
        Returns: Json[];
      };
      // public_profile_reviews: die Bewertungen eines OEFFENTLICHEN
      // Kontos fuer dessen Profilseite. Gleiche Begruendung wie oben --
      // ohne die Funktion stuende dort "No posts yet", obwohl derselbe
      // Beitrag im Vorschlags-Reiter sichtbar ist. Siehe Migration
      // 20260923090000_public_profile_reviews.sql.
      public_profile_reviews: {
        Args: { p_user_id: string };
        Returns: Json[];
      };
    };
    Tables: Omit<GenTables, "follows" | "places" | "profiles" | "reviews"> & {
      follows: WithColumns<
        GenTables["follows"],
        { status: string },
        { status?: string },
        { status?: string }
      >;
      // google_type: Googles maschinenlesbarer Ortstyp ("coffee_shop").
      // Quelle fuer die Kategorie-Zuordnung, siehe lib/categories.ts.
      places: WithColumns<
        GenTables["places"],
        { google_type: string | null },
        { google_type?: string | null },
        { google_type?: string | null }
      >;
      profiles: WithColumns<
        GenTables["profiles"],
        { is_private: boolean; profile_color: string; cover_url: string | null },
        { is_private?: boolean; profile_color?: string; cover_url?: string | null },
        { is_private?: boolean; profile_color?: string; cover_url?: string | null }
      >;
      reviews: WithColumns<
        GenTables["reviews"],
        { trip_folder_id: string | null },
        { trip_folder_id?: string | null },
        { trip_folder_id?: string | null }
      >;
      trip_folders: {
        Row: TripFolderRow;
        Insert: { id?: string; name: string; owner_id: string; created_at?: string };
        Update: Partial<TripFolderRow>;
        Relationships: [];
      };
      trip_folder_shares: {
        Row: TripFolderShareRow;
        Insert: { folder_id: string; shared_with_id: string; created_at?: string };
        Update: Partial<TripFolderShareRow>;
        Relationships: [];
      };
      saved_places: {
        Row: SavedPlaceRow;
        Insert: { user_id: string; place_id: string; created_at?: string };
        Update: Partial<SavedPlaceRow>;
        Relationships: [];
      };
      device_tokens: {
        Row: DeviceTokenRow;
        Insert: {
          token: string;
          user_id: string;
          platform?: string;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: Partial<DeviceTokenRow>;
        Relationships: [];
      };
    };
  };
};

export type { Json };
