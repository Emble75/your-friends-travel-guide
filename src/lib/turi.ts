import { supabase } from "@/integrations/supabase/client";

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

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  if (d < 30) return `vor ${d} T.`;
  return new Date(iso).toLocaleDateString("de-DE", {
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
