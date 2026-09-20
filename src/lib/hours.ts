import type { OpeningPeriod } from "./maps.server";

/*
 * "Hat das jetzt offen?" -- aus dem Wochenplan selbst gerechnet.
 *
 * WARUM NICHT GOOGLES FERTIGE ANTWORT: Google liefert auf Wunsch ein
 * fertiges "open now". Unsere Ortsdaten liegen aber 30 Tage im
 * Zwischenspeicher -- ein Ja von heute waere morgen falsch. Der
 * Wochenplan aendert sich dagegen praktisch nie und bleibt so lange
 * gueltig.
 *
 * ZUR ZEITZONE: Gerechnet wird in der ORTSZEIT, nicht in deiner. Wer aus
 * Stockholm auf ein Cafe in Lissabon schaut, will dessen Uhrzeit sehen.
 * Google liefert dazu utcOffsetMinutes.
 *
 * Die Woche wird als eine durchgehende Linie von 10080 Minuten
 * behandelt (7 x 24 x 60). Zeitraeume ueber Mitternacht -- eine Bar von
 * Freitag 20 Uhr bis Samstag 3 Uhr -- sind damit ganz normale
 * Abschnitte, und der Sprung von Sonntagnacht auf Montagfrueh ist nur
 * ein Ueberlauf am Ende der Linie.
 */

const WEEK = 7 * 24 * 60;

export type OpenState =
  | { known: false }
  | { known: true; open: true; alwaysOpen: true }
  | { known: true; open: true; alwaysOpen: false; until: string }
  | { known: true; open: false; opensAt: string | null };

function minuteOfWeek(day: number, hour: number, minute: number) {
  return ((day % 7) * 24 + hour) * 60 + minute;
}

function clockLabel(minutes: number) {
  const m = ((minutes % WEEK) + WEEK) % WEEK;
  const hour = Math.floor(m / 60) % 24;
  const minute = m % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Die aktuelle Ortszeit als Minute der Woche (Sonntag 0:00 = 0).
 *
 * Die Verschiebung wird auf den Zeitstempel addiert und danach mit den
 * UTC-Gettern ausgelesen. Mit getHours() waere die Zeitzone des Geraets
 * ein zweites Mal eingerechnet -- der Wert waere um genau diese Differenz
 * daneben, und zwar unbemerkt, solange man im selben Land testet.
 */
function nowInPlace(utcOffsetMinutes: number, now: Date) {
  const local = new Date(now.getTime() + utcOffsetMinutes * 60_000);
  return minuteOfWeek(local.getUTCDay(), local.getUTCHours(), local.getUTCMinutes());
}

export function openState(
  periods: OpeningPeriod[] | null | undefined,
  utcOffsetMinutes: number | null | undefined,
  now: Date = new Date(),
): OpenState {
  if (!periods || periods.length === 0 || utcOffsetMinutes == null) return { known: false };

  // Durchgehend geoeffnet: Google schickt dafuer genau einen Zeitraum,
  // der bei Sonntag 0:00 beginnt und kein Ende hat.
  if (periods.length === 1 && !periods[0]!.close) {
    return { known: true, open: true, alwaysOpen: true };
  }

  const current = nowInPlace(utcOffsetMinutes, now);
  let nextOpening: number | null = null;

  for (const p of periods) {
    if (!p.close) continue;
    const start = minuteOfWeek(p.open.day, p.open.hour, p.open.minute);
    let end = minuteOfWeek(p.close.day, p.close.hour, p.close.minute);
    // Endet der Zeitraum "frueher" als er beginnt, laeuft er ueber das
    // Wochenende hinweg -- dann eine ganze Woche daraufrechnen.
    if (end <= start) end += WEEK;

    // Denselben Zeitraum zweimal pruefen: einmal an seiner Stelle, einmal
    // eine Woche frueher. Sonst faellt der Freitagabend, der in den
    // Samstag laeuft, fuer jemanden am Sonntagmorgen durchs Raster.
    for (const offset of [0, -WEEK]) {
      if (current >= start + offset && current < end + offset) {
        return { known: true, open: true, alwaysOpen: false, until: clockLabel(end) };
      }
    }

    // Die naechste Oeffnung suchen -- die kann auch erst naechste Woche
    // sein, deshalb wieder mit Ueberlauf.
    const upcoming = start >= current ? start : start + WEEK;
    if (nextOpening === null || upcoming < nextOpening) nextOpening = upcoming;
  }

  return {
    known: true,
    open: false,
    // Nur nennen, wenn es in den naechsten 24 Stunden so weit ist. "Oeffnet
    // 9:00" ist hilfreich; "oeffnet Dienstag" bei geschlossenem Betrieb
    // waere hier nur eine Zeile mehr.
    opensAt:
      nextOpening !== null && nextOpening - current <= 24 * 60 ? clockLabel(nextOpening) : null,
  };
}

/** Eine Zeile fuer die Anzeige: "Open · until 22:00", "Closed · opens 09:00". */
export function openLabel(state: OpenState): { text: string; open: boolean } | null {
  if (!state.known) return null;
  if (state.open) {
    return { open: true, text: state.alwaysOpen ? "Open 24 hours" : `Open · until ${state.until}` };
  }
  return { open: false, text: state.opensAt ? `Closed · opens ${state.opensAt}` : "Closed" };
}
