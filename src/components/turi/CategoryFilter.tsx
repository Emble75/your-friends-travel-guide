import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { CATEGORIES, type Category } from "@/lib/categories";
import { tap } from "@/lib/native";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "./PlaceList";

/*
 * Die Filterleiste ueber einer Karte.
 *
 * Sie entstand fuer die Hauptkarte und steht jetzt genauso ueber der
 * Karte eines Profils oder Ordners -- dort ist sie sogar wichtiger: Wer
 * sich die 200 Orte eines vielgereisten Kontos ansieht, sucht selten
 * "alles", sondern "die Cafes".
 *
 * Gezeigt werden nur Kategorien, die tatsaechlich vorkommen: ein Filter,
 * der garantiert nichts findet, ist eine Sackgasse. Die Reihenfolge ist
 * fest und NICHT nach Haeufigkeit sortiert -- sonst sortierten sich die
 * Knoepfe bei jedem Verschieben der Karte neu, und man traefe beim
 * zweiten Griff etwas anderes als beim ersten.
 */

/** Das Material der schwebenden Bedienelemente -- wie in map.tsx. */
const FLOATING =
  "border border-border bg-card/80 shadow-card backdrop-blur-xl backdrop-saturate-150";

function FilterChip({
  label,
  count,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon?: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void tap();
        onClick();
      }}
      aria-pressed={active}
      // Aktiv in der weichen Markenfarbe -- dieselbe Sprache wie der
      // Modus-Umschalter der Karte und der aktive Reiter unten.
      className={`turi-tap flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors ${FLOATING} ${
        active ? "bg-brand-soft text-brand" : "text-muted-foreground"
      }`}
    >
      {Icon ? <Icon size={14} /> : null}
      {label}
      <span className={`turi-meta text-xs font-normal ${active ? "" : "text-muted-foreground/70"}`}>
        {count}
      </span>
    </button>
  );
}

export function CategoryFilterBar({
  items,
  value,
  onChange,
  total,
}: {
  /** Woraus die Leiste ihre Kategorien und Zahlen ableitet. */
  items: { category: Category }[];
  value: Category | null;
  onChange: (category: Category | null) => void;
  /** Die Zahl auf "All" -- standardmaessig die Laenge von items. */
  total?: number;
}) {
  const counts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const item of items) m.set(item.category, (m.get(item.category) ?? 0) + 1);
    return m;
  }, [items]);

  const categories = useMemo(() => {
    const list = CATEGORIES.filter((c) => counts.has(c));
    // Der gerade aktive Filter bleibt sichtbar, auch wenn man aus seinem
    // Gebiet herausgescrollt ist -- sonst verschwaende der Grund, warum
    // die Karte gerade fast leer ist.
    if (value && !list.includes(value)) return [...list, value];
    return list;
  }, [counts, value]);

  if (categories.length < 2) return null;

  return (
    <div className="pointer-events-auto -mx-4 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max items-center gap-1.5">
        <FilterChip
          label="All"
          count={total ?? items.length}
          active={value === null}
          onClick={() => onChange(null)}
        />
        {categories.map((c) => (
          <FilterChip
            key={c}
            label={CATEGORY_LABELS[c]}
            icon={CATEGORY_ICONS[c]}
            count={counts.get(c) ?? 0}
            active={value === c}
            onClick={() => onChange(value === c ? null : c)}
          />
        ))}
      </div>
    </div>
  );
}
