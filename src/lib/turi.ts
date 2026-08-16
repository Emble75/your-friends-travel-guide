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
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
}

export const CATEGORIES = [
  "Restaurant",
  "Café",
  "Bar",
  "Hotel",
  "Strand",
  "Museum",
  "Sehenswürdigkeit",
  "Natur",
  "Sonstiges",
] as const;
