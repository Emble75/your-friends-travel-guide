import { supabase } from "@/integrations/supabase/app-client";

const signedCache = new Map<string, string>();

/** Buckets are private — turn a stored object path into a temporary URL. */
export async function signedUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  const key = `${bucket}/${path}`;
  const cached = signedCache.get(key);
  if (cached) return cached;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (data?.signedUrl) signedCache.set(key, data.signedUrl);
  return data?.signedUrl ?? null;
}

export async function signedUrls(bucket: string, paths: (string | null | undefined)[]) {
  return Promise.all(paths.map((p) => signedUrl(bucket, p)));
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Kurze Zeitangabe fuer Bewertungskarten ("2m", "3h", "5d").
 *
 * Stand frueher komplett auf Deutsch ("vor 2 Std.") und formatierte
 * Datumsangaben mit de-DE -- in einer durchgehend englischen Oberflaeche.
 * Jede Karte im Feed zeigte das.
 *
 * Die kompakte Form ist zusaetzlich schmal genug fuer die Zeile neben den
 * Sternen: die ausgeschriebene Variante wurde dort abgeschnitten.
 */
export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Verkleinert und komprimiert ein Bild client-seitig vor dem Upload
 * (Storage-Kosten & Ladezeiten). Läuft per Canvas, kein zusätzliches Package nötig.
 */
export async function compressImage(
  file: File,
  { maxDimension = 1600, quality = 0.8 }: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob || blob.size >= file.size) return file;

  const newName = file.name.replace(/\.\w+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}

export const CATEGORIES = [
  "Restaurant",
  "Cafe",
  "Bar",
  "Hotel",
  "Beach",
  "Museum",
  "Landmark",
  "Nature",
  "Other",
] as const;

/**
 * Extrahiert eine lesbare Fehlermeldung aus caught errors. Supabase-/
 * PostgREST-Fehler sind KEINE echten Error-Instanzen (kein `instanceof
 * Error`), haben aber ein `.message`-Feld -- ein reines `err instanceof
 * Error`-Check verschluckt deren eigentliche Ursache.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}

/**
 * Liefert die oeffentliche, echte Web-Adresse der App -- fuer Links, die
 * geteilt oder in E-Mails verschickt werden. In einer nativen App-Huelle
 * (Capacitor) ist window.location.origin KEINE echte, aufrufbare Web-
 * Adresse (z. B. "capacitor://localhost"), deshalb bevorzugt diese
 * Funktion eine explizit gesetzte Umgebungsvariable. Solange die noch
 * nicht gesetzt ist, faellt sie auf window.location.origin zurueck --
 * funktioniert also schon jetzt im Browser/in Lovables Vorschau, und
 * muss nur einmal auf die echte Produktions-Domain gesetzt werden,
 * sobald die feststeht.
 */
export function getAppUrl(): string {
  const configured =
    (import.meta.env["VITE_APP_URL"] as string | undefined) ||
    (import.meta.env["APP_URL"] as string | undefined);
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

/**
 * Link, der den Ort in Google Maps zur Navigation oeffnet.
 *
 * Verwendet Googles offizielle universelle URL: im Browser oeffnet sie
 * die Web-Karte, auf einem Geraet mit installierter Google-Maps-App
 * direkt diese -- ohne dass wir zwei Varianten pflegen muessen.
 *
 * Die Koordinaten sind die verlaessliche Angabe; die Orts-Kennung kommt
 * nur zusaetzlich dazu, damit Google den richtigen Namen anzeigt statt
 * blosser Zahlen. Fehlen Koordinaten (bei von Hand angelegten Orten
 * moeglich), wird auf Name und Stadt als Suchbegriff ausgewichen.
 */
export function directionsUrl(place: {
  name: string;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
}): string {
  const params = new URLSearchParams({ api: "1" });
  if (place.lat != null && place.lng != null) {
    params.set("destination", `${place.lat},${place.lng}`);
    if (place.googlePlaceId) params.set("destination_place_id", place.googlePlaceId);
  } else {
    params.set("destination", [place.name, place.city].filter(Boolean).join(", "));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// Teilen-Dialog: siehe share() in src/lib/native.ts. Der nutzt nativ das
// Capacitor-Share-Plugin (das Webview unterstuetzt navigator.share nicht
// zuverlaessig) und im Browser denselben Zwischenablage-Rueckfall.
