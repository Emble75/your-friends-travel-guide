import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ImagePlus, MapPin, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/turi/AppHeader";
import { StarPicker } from "@/components/turi/Stars";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, compressImage, getErrorMessage } from "@/lib/turi";

export const Route = createFileRoute("/_authenticated/new")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["placeId"] === "string" ? { placeId: search["placeId"] as string } : {},
  head: () => ({
    meta: [
      { title: "Ort bewerten – Turi" },
      {
        name: "description",
        content: "Bewerte einen Ort mit Sternen, Text und bis zu drei Fotos.",
      },
      { property: "og:title", content: "Ort bewerten – Turi" },
      { property: "og:description", content: "Sterne, Text und bis zu drei Fotos." },
    ],
  }),
  component: NewReviewPage,
});

type Place = { id: string; name: string; city: string; category: string };

function NewReviewPage() {
  const navigate = useNavigate();
  const { placeId } = Route.useSearch();
  const [place, setPlace] = useState<Place | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newCategory, setNewCategory] = useState<string>("Restaurant");
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const { data: folders } = useQuery({
    queryKey: ["my-trip-folders"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("trip_folders")
        .select("id, name")
        .eq("owner_id", auth.user!.id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function resolveFolderId(userId: string): Promise<string | null> {
    if (!newFolderMode) return folderId;
    const name = newFolderName.trim();
    if (!name) return null;
    const { data: existing } = await supabase
      .from("trip_folders")
      .select("id")
      .eq("owner_id", userId)
      .ilike("name", name)
      .maybeSingle();
    if (existing) return existing.id;
    const { data: created, error } = await supabase
      .from("trip_folders")
      .insert({ owner_id: userId, name })
      .select("id")
      .single();
    if (error) throw error;
    return created.id;
  }

  useEffect(() => {
    if (!placeId) return;
    let active = true;
    void supabase
      .from("places")
      .select("id, name, city, category")
      .eq("id", placeId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setPlace(data);
      });
    return () => {
      active = false;
    };
  }, [placeId]);

  const { data: results } = useQuery({
    queryKey: ["place-search", search],
    queryFn: async () => {
      const t = search.trim();
      if (!t) return [] as Place[];
      const { data, error } = await supabase
        .from("places")
        .select("id, name, city, category")
        .or(`name.ilike.%${t}%,city.ilike.%${t}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    enabled: search.trim().length > 0 && !place,
  });

  async function createPlace() {
    const { data: auth } = await supabase.auth.getUser();
    if (!newName.trim() || !newCity.trim()) {
      toast.error("Name und Stadt angeben");
      return;
    }
    const { data, error } = await supabase
      .from("places")
      .insert({
        name: newName.trim(),
        city: newCity.trim(),
        category: newCategory,
        created_by: auth.user!.id,
      })
      .select("id, name, city, category")
      .single();
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Diesen Ort gibt es schon" : error.message);
      return;
    }
    setPlace(data);
    setCreating(false);
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 3));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!place) {
      toast.error("Bitte einen Ort wählen");
      return;
    }
    if (rating < 1) {
      toast.error("Bitte Sterne vergeben");
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user!.id;
      const resolvedFolderId = await resolveFolderId(userId);
      const { data: review, error } = await supabase
        .from("reviews")
        .insert({
          user_id: userId,
          place_id: place.id,
          rating,
          text: text.trim() || null,
          trip_folder_id: resolvedFolderId,
        })
        .select("id")
        .single();
      if (error) throw error;

      for (let i = 0; i < files.length; i++) {
        const original = files[i]!;
        const file = await compressImage(original, { maxDimension: 1600, quality: 0.8 });
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${review.id}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("review-photos")
          .upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { error: imgErr } = await supabase
          .from("review_images")
          .insert({ review_id: review.id, image_url: path, position: i });
        if (imgErr) throw imgErr;
      }

      toast.success("Bewertung gespeichert");
      navigate({ to: "/place/$placeId", params: { placeId: place.id } });
    } catch (err) {
      console.error("[new review] Speichern fehlgeschlagen:", err);
      toast.error(getErrorMessage(err, "Speichern fehlgeschlagen"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AppHeader />
      <form onSubmit={submit} className="app-shell space-y-5 py-4">
        <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ort</Label>
          {place ? (
            <div className="mt-2 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-accent-foreground">
                <MapPin size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{place.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {place.city} · {place.category}
                </span>
              </span>
              <Button type="button" variant="ghost" size="icon" onClick={() => setPlace(null)}>
                <X size={18} />
              </Button>
            </div>
          ) : creating ? (
            <div className="mt-3 space-y-3">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name des Orts"
                className="h-12 rounded-2xl"
              />
              <Input
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                placeholder="Stadt"
                className="h-12 rounded-2xl"
              />
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-12 rounded-2xl">
                  <SelectValue placeholder="Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button type="button" onClick={createPlace} className="flex-1 rounded-2xl">
                  Ort anlegen
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-2xl"
                  onClick={() => setCreating(false)}
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ort suchen (Name oder Stadt)"
                className="h-12 rounded-2xl"
              />
              {results && results.length > 0 ? (
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setPlace(p)}
                        className="flex w-full items-center gap-2 px-3 py-3 text-left"
                      >
                        <MapPin size={16} className="text-primary" />
                        <span className="text-sm font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.city}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                className="w-full rounded-2xl"
                onClick={() => {
                  setNewName(search);
                  setCreating(true);
                }}
              >
                <Plus size={16} className="mr-1" /> Neuen Ort anlegen
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Deine Bewertung
          </Label>
          <div className="mt-2 flex justify-center">
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Wie war's? Was sollten deine Freunde wissen?"
            rows={5}
            className="mt-3 rounded-2xl"
          />
        </section>

        <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Fotos (max. 3)
          </Label>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
                <img src={URL.createObjectURL(f)} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-1"
                  aria-label="Foto entfernen"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {files.length < 3 ? (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-muted-foreground">
                <ImagePlus size={22} />
                <span className="text-[11px]">Hinzufügen</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => onPickFiles(e.target.files)}
                />
              </label>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-4 shadow-card">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Ordner (optional)
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Gruppiere Orte z. B. nach Reise ("Puglia", "Madrid") und teile den Ordner später gezielt
            mit einzelnen Personen.
          </p>
          {newFolderMode ? (
            <div className="mt-2 flex gap-2">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="z. B. Puglia"
                className="h-11 flex-1 rounded-2xl"
                autoFocus
              />
              <Button
                type="button"
                variant="secondary"
                className="rounded-2xl"
                onClick={() => {
                  setNewFolderMode(false);
                  setNewFolderName("");
                }}
              >
                Abbrechen
              </Button>
            </div>
          ) : (
            <Select
              value={folderId ?? "__none"}
              onValueChange={(v) => {
                if (v === "__new") setNewFolderMode(true);
                else setFolderId(v === "__none" ? null : v);
              }}
            >
              <SelectTrigger className="mt-2 h-11 rounded-2xl">
                <SelectValue placeholder="Kein Ordner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Kein Ordner</SelectItem>
                {(folders ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
                <SelectItem value="__new">+ Neuer Ordner</SelectItem>
              </SelectContent>
            </Select>
          )}
        </section>

        <Button type="submit" disabled={saving} className="h-13 w-full rounded-2xl py-4 text-base">
          {saving ? "Speichern…" : "Bewertung veröffentlichen"}
        </Button>
      </form>
    </>
  );
}
