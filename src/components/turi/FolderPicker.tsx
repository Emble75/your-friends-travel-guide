import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/app-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/*
 * Die Ordner-Auswahl -- einmal fuer das Bewertungsformular, einmal fuer
 * das nachtraegliche Bearbeiten.
 *
 * Bisher steckte sie samt Anlege-Logik nur im Formular fuer NEUE
 * Bewertungen. Ein Ordner liess sich damit ausschliesslich im Moment des
 * Schreibens vergeben -- nach der Reise die acht Lissabon-Bewertungen zu
 * "Lissabon" zusammenzufassen, war unmoeglich. Genau dann tut man es
 * aber: waehrend der Reise schreibt man, danach ordnet man.
 */

export type FolderChoice = { kind: "existing"; id: string | null } | { kind: "new"; name: string };

export const NO_FOLDER: FolderChoice = { kind: "existing", id: null };

/** Der Ausgangszustand beim Bearbeiten einer Bewertung, die schon einen Ordner hat. */
export function folderChoiceFor(folderId: string | null | undefined): FolderChoice {
  return { kind: "existing", id: folderId ?? null };
}

/**
 * Macht aus der Auswahl eine Ordner-id -- und legt den Ordner an, wenn
 * ein neuer Name eingegeben wurde.
 *
 * Gleichnamige Ordner werden bewusst zusammengefuehrt statt verdoppelt:
 * Wer nach drei Bewertungen zum vierten Mal "Puglia" tippt, meint
 * denselben Ordner.
 */
export async function resolveFolderChoice(
  choice: FolderChoice,
  userId: string,
): Promise<string | null> {
  if (choice.kind === "existing") return choice.id;
  const name = choice.name.trim();
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

export function FolderPicker({
  value,
  onChange,
  className,
}: {
  value: FolderChoice;
  onChange: (choice: FolderChoice) => void;
  className?: string;
}) {
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

  if (value.kind === "new") {
    return (
      <div className={`flex gap-2 ${className ?? ""}`}>
        <Input
          value={value.name}
          onChange={(e) => onChange({ kind: "new", name: e.target.value })}
          placeholder="e.g. Puglia"
          className="h-11 flex-1 rounded-2xl"
          autoFocus
        />
        <Button
          type="button"
          variant="secondary"
          className="rounded-2xl"
          onClick={() => onChange(NO_FOLDER)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value.id ?? "__none"}
      onValueChange={(v) => {
        if (v === "__new") onChange({ kind: "new", name: "" });
        else onChange({ kind: "existing", id: v === "__none" ? null : v });
      }}
    >
      <SelectTrigger className={`h-11 rounded-2xl ${className ?? ""}`}>
        <SelectValue placeholder="No folder" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">No folder</SelectItem>
        {(folders ?? []).map((f) => (
          <SelectItem key={f.id} value={f.id}>
            {f.name}
          </SelectItem>
        ))}
        <SelectItem value="__new">+ New folder</SelectItem>
      </SelectContent>
    </Select>
  );
}
