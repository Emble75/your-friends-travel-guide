import { useEffect, useState } from "react";

/**
 * Verzoegert einen Wert um `delayMs`, bevor er sich aendert. Nuetzlich fuer
 * Sucheingaben, damit nicht bei jedem Tastendruck eine Server-Anfrage
 * ausgeloest wird.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
