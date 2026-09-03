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

export type AppDatabase = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GenPublic, "Tables"> & {
    Tables: Omit<GenTables, "follows" | "profiles" | "reviews"> & {
      follows: WithColumns<
        GenTables["follows"],
        { status: string },
        { status?: string },
        { status?: string }
      >;
      profiles: WithColumns<
        GenTables["profiles"],
        { is_private: boolean },
        { is_private?: boolean },
        { is_private?: boolean }
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
    };
  };
};

export type { Json };
