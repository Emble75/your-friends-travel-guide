import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, MapPin, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { AppHeader } from "@/components/turi/AppHeader";
import {
  FolderPicker,
  NO_FOLDER,
  resolveFolderChoice,
  type FolderChoice,
} from "@/components/turi/FolderPicker";
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
import { isNative, takePhoto } from "@/lib/native";
import { searchMapPlaces } from "@/lib/maps.functions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const Route = createFileRoute("/_authenticated/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search["placeId"] === "string" ? { placeId: search["placeId"] as string } : {}),
    ...(search["create"] === true ? { create: true as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Review a Place – Turi" },
      {
        name: "description",
        content: "Review a place with a star rating, text, and up to three photos.",
      },
      { property: "og:title", content: "Review a Place – Turi" },
      { property: "og:description", content: "Star rating, text, and up to three photos." },
    ],
  }),
  component: NewReviewPage,
});

type Place = { id: string; name: string; city: string; category: string };

/*
 * Der Entwurf.
 *
 * Eine Bewertung ist schnell zwei Absaetze lang, und das Formular ist
 * eine ganz normale Seite: Ein Anruf, ein App-Wechsel, ein versehentlich
 * getippter Zurueck-Pfeil -- und alles Geschriebene war weg. Nichts
 * daran war je gespeichert.
 *
 * Bewusst im Browser-Speicher und nicht in der Datenbank: Ein halber
 * Entwurf ist nichts, was andere sehen sollen, er gehoert auf dieses
 * Geraet. Fotos lassen sich so nicht sichern -- sie sind Dateien, keine
 * Texte -- und muessen nach einem Abbruch neu gewaehlt werden.
 */
const DRAFT_KEY = "turi:new-review-draft";

type Draft = {
  placeId: string | null;
  rating: number;
  text: string;
  folder: FolderChoice;
};

function readDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (typeof parsed?.text !== "string" || typeof parsed?.rating !== "number") return null;
    return parsed;
  } catch {
    // Beschaedigter oder gesperrter Speicher darf die Seite nicht
    // aufhalten -- dann eben ohne Entwurf.
    return null;
  }
}

function writeDraft(draft: Draft | null) {
  if (typeof window === "undefined") return;
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* privater Modus o. ae. -- der Entwurf ist Komfort, kein Kernweg */
  }
}

function NewReviewPage() {
  const navigate = useNavigate();
  const searchFn = useServerFn(searchMapPlaces);
  const { placeId, create } = Route.useSearch();
  const [place, setPlace] = useState<Place | null>(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(create === true);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newCategory, setNewCategory] = useState<string>("Restaurant");
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [folder, setFolder] = useState<FolderChoice>(NO_FOLDER);
  // Zeigt den Hinweis "Entwurf wiederhergestellt" -- ohne ihn waere
  // unklar, woher der Text kommt, den man nicht gerade getippt hat.
  const [draftRestored, setDraftRestored] = useState(false);
  const draftChecked = useRef(false);

  /*
   * Einen vorhandenen Entwurf zurueckholen -- aber nur, wenn er zu dem
   * passt, was man gerade vorhat: Kommt man ueber "Bewerten" von einer
   * bestimmten Ortsseite, darf der Entwurf zu einem ANDEREN Ort dessen
   * Auswahl nicht ueberschreiben. Er bleibt dann liegen.
   */
  useEffect(() => {
    if (draftChecked.current) return;
    draftChecked.current = true;
    const draft = readDraft();
    if (!draft) return;
    if (placeId && draft.placeId !== placeId) return;
    if (create && !draft.placeId) return;
    setRating(draft.rating);
    setText(draft.text);
    setFolder(draft.folder ?? NO_FOLDER);
    if (draft.placeId && !placeId) {
      void supabase
        .from("places")
        .select("id, name, city, category")
        .eq("id", draft.placeId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setPlace(data);
            setCreating(false);
          }
        });
    }
    setDraftRestored(true);
  }, [placeId, create]);

  /*
   * Laufend sichern, sobald etwas Eigenes drinsteht. Ein leeres Formular
   * schreibt bewusst nichts: sonst wuerde blosses Oeffnen der Seite einen
   * echten Entwurf ueberschreiben.
   */
  useEffect(() => {
    if (!draftChecked.current) return;
    const hasContent = rating > 0 || text.trim().length > 0;
    if (!hasContent) return;
    writeDraft({ placeId: place?.id ?? null, rating, text, folder });
  }, [place, rating, text, folder]);

  function discardDraft() {
    writeDraft(null);
    setRating(0);
    setText("");
    setFolder(NO_FOLDER);
    setDraftRestored(false);
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

  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: results } = useQuery({
    queryKey: ["place-search", debouncedSearch],
    queryFn: async () => {
      const t = debouncedSearch.trim();
      if (!t) return [] as Place[];
      const { data, error } = await supabase
        .from("places")
        .select("id, name, city, category")
        .or(`name.ilike.%${t}%,city.ilike.%${t}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    enabled: debouncedSearch.trim().length > 0 && !place,
  });

  /*
   * Position fuer einen von Hand angelegten Ort ermitteln.
   *
   * Ohne Koordinaten taucht ein Ort auf KEINER Karte auf -- weder auf der
   * eigenen noch auf der im Profil -- und verschwindet damit lautlos aus
   * dem Kern der App. Genau das ist passiert: Orte aus "Can't find it?"
   * wurden ohne lat/lng gespeichert.
   *
   * Erst nach Name + Stadt suchen, sonst nur nach der Stadt. Der zweite
   * Versuch ist grob, aber der Pin landet wenigstens in der richtigen
   * Stadt statt nirgends. Findet Google gar nichts, wird trotzdem
   * gespeichert -- eine Bewertung darf daran nicht scheitern.
   *
   * Die Google-Kennung wird bewusst NICHT uebernommen: Der Nutzer hat
   * gerade gesagt, dass er den Ort nicht gefunden hat. Ein Treffer der
   * Textsuche kann ein anderer Ort sein, und eine falsche Kennung wuerde
   * zwei verschiedene Orte zu einem verschmelzen.
   */
  async function lookupCoords(name: string, city: string) {
    for (const query of [`${name}, ${city}`, city]) {
      try {
        const hits = await searchFn({ data: { query } });
        const hit = hits[0];
        if (hit) return { lat: hit.lat, lng: hit.lng };
      } catch {
        // Suche nicht erreichbar -- ohne Position weitermachen.
      }
    }
    return null;
  }

  async function createPlace() {
    const { data: auth } = await supabase.auth.getUser();
    if (!newName.trim() || !newCity.trim()) {
      toast.error("Enter a name and city");
      return;
    }
    const coords = await lookupCoords(newName.trim(), newCity.trim());
    const { data, error } = await supabase
      .from("places")
      .insert({
        name: newName.trim(),
        city: newCity.trim(),
        category: newCategory,
        created_by: auth.user!.id,
        ...(coords ?? {}),
      })
      .select("id, name, city, category")
      .single();
    if (error) {
      toast.error(
        error.message.includes("duplicate") ? "This place already exists" : error.message,
      );
      return;
    }
    setPlace(data);
    setCreating(false);
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 3));
  }

  async function onAddPhotoNative() {
    const file = await takePhoto("prompt");
    if (file) setFiles((prev) => [...prev, file].slice(0, 3));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!place) {
      toast.error("Please choose a place");
      return;
    }
    if (rating < 1) {
      toast.error("Please give a star rating");
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user!.id;
      const resolvedFolderId = await resolveFolderChoice(folder, userId);
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

      writeDraft(null);
      toast.success("Review saved");
      // "replace" statt normalem Push: die "Bewerten"-Seite soll nach dem
      // Speichern nicht in der Zurueck-Historie stehen bleiben, sonst
      // landet man beim Zurueckgehen wieder auf dem (jetzt leeren)
      // Formular und denkt faelschlich, das Speichern haette nicht
      // geklappt.
      navigate({ to: "/place/$placeId", params: { placeId: place.id }, replace: true });
    } catch (err) {
      console.error("[new review] Save failed:", err);
      toast.error(getErrorMessage(err, "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Aufgabenseite: Titel und Ausweg sind hier nuetzlicher als der
          Markenschriftzug -- man kommt her, um genau eine Sache zu tun. */}
      <AppHeader title="New review" showBack fallbackTo="/map" />
      <form onSubmit={submit} className="app-shell space-y-5 py-4">
        {draftRestored ? (
          <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3">
            <p className="turi-meta min-w-0 flex-1 text-xs text-muted-foreground">
              Draft restored. Photos aren't part of a draft.
            </p>
            <Button
              type="button"
              variant="ghost"
              className="h-8 shrink-0 rounded-full px-3 text-xs"
              onClick={discardDraft}
            >
              Discard
            </Button>
          </div>
        ) : null}
        <section className="turi-card p-5">
          <Label className="turi-eyebrow">Place</Label>
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
                placeholder="Place name"
                className="h-12 rounded-2xl"
              />
              <Input
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                placeholder="City"
                className="h-12 rounded-2xl"
              />
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-12 rounded-2xl">
                  <SelectValue placeholder="Category" />
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
                  Create place
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-2xl"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search place (name or city)"
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
                <Plus size={16} className="mr-1" /> Add a new place
              </Button>
            </div>
          )}
        </section>

        <section className="turi-card p-5">
          <Label className="turi-eyebrow">Your Review</Label>
          <div className="mt-2 flex justify-center">
            <StarPicker value={rating} onChange={setRating} />
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="How was it? What should your friends know?"
            rows={5}
            className="mt-3 rounded-2xl"
          />
        </section>

        <section className="turi-card p-5">
          <Label className="turi-eyebrow">Photos (max. 3)</Label>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
                <img src={URL.createObjectURL(f)} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-1"
                  aria-label="Remove photo"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {files.length < 3 ? (
              isNative() ? (
                <button
                  type="button"
                  onClick={onAddPhotoNative}
                  className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-muted-foreground"
                >
                  <ImagePlus size={22} />
                  <span className="text-2xs">Add</span>
                </button>
              ) : (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-muted-foreground">
                  <ImagePlus size={22} />
                  <span className="text-2xs">Add</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => onPickFiles(e.target.files)}
                  />
                </label>
              )
            ) : null}
          </div>
        </section>

        <section className="turi-card p-5">
          <Label className="turi-eyebrow">Folder (optional)</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Group places by trip (e.g. "Puglia", "Madrid") and later share the folder with specific
            people.
          </p>
          <FolderPicker value={folder} onChange={setFolder} className="mt-2" />
        </section>

        <Button type="submit" disabled={saving} className="h-13 w-full rounded-2xl py-4 text-base">
          {saving ? "Saving…" : "Publish review"}
        </Button>
      </form>
    </>
  );
}
