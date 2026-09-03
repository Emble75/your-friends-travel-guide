import { Capacitor } from "@capacitor/core";

/*
 * Native Faehigkeiten -- mit Rueckfall auf die Browser-Entsprechung.
 *
 * Die App laeuft an zwei Orten: als iOS-App (Capacitor) und als Website
 * (Lovable-Vorschau, Desktop). Jede Funktion hier nimmt den nativen Weg,
 * wenn er verfuegbar ist, und sonst den des Browsers. Aufrufer muessen
 * den Unterschied nicht kennen.
 *
 * Warum das ueberhaupt gebaut wurde: die App nutzte ausschliesslich
 * Browser-Schnittstellen -- Fotos ueber ein Datei-Feld, Standort ueber
 * navigator.geolocation. Aus Apples Sicht war sie damit buchstaeblich
 * eine Website in einer Huelle, was Richtlinie 4.2 ("Minimum
 * Functionality") trifft. Die nativen Wege sind zugleich die besseren:
 * echte Kamera statt Dateiauswahl, praezisere Ortung, spuerbare
 * Rueckmeldung.
 */

export const isNative = () => Capacitor.isNativePlatform();

/**
 * Ein Foto aufnehmen oder aus der Mediathek waehlen.
 *
 * Nativ oeffnet das die Kamera bzw. Apples Fotoauswahl -- "prompt" laesst
 * das Betriebssystem selbst fragen (Apples eigenes Auswahlblatt "Foto
 * aufnehmen"/"Mediathek"), das ist der uebliche Weg fuer einen einzelnen
 * Auswahl-Knopf. Im Browser bleibt es beim Datei-Dialog, den der Aufrufer
 * selbst bereitstellt -- deshalb gibt diese Funktion dort null zurueck und
 * der Aufrufer faellt auf sein vorhandenes <input type="file"> zurueck.
 */
export async function takePhoto(source: "camera" | "library" | "prompt"): Promise<File | null> {
  if (!isNative()) return null;
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const sourceMap = {
    camera: CameraSource.Camera,
    library: CameraSource.Photos,
    prompt: CameraSource.Prompt,
  };
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      // Die App komprimiert ohnehin selbst (compressImage) -- hier reicht
      // ein Zwischenschritt ohne Zuschnitt-Oberflaeche.
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: sourceMap[source],
    });
    if (!photo.webPath) return null;
    const blob = await fetch(photo.webPath).then((r) => r.blob());
    const ext = photo.format || "jpg";
    return new File([blob], `photo-${Date.now()}.${ext}`, { type: blob.type || "image/jpeg" });
  } catch {
    // Abbruch durch den Nutzer ist kein Fehler.
    return null;
  }
}

type Coords = { lat: number; lng: number; accuracy: number };

/** Einmalige Ortung. */
export async function currentPosition(): Promise<Coords | null> {
  if (isNative()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    try {
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10_000 });
      return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    } catch {
      return null;
    }
  }
  if (!navigator.geolocation) return null;
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000 },
    ),
  );
}

/**
 * Fortlaufende Ortung. Gibt eine Funktion zum Beenden zurueck -- die
 * MUSS beim Verlassen der Karte aufgerufen werden, sonst laeuft die
 * Ortung im Hintergrund weiter und zieht Akku.
 */
export function watchPosition(onChange: (c: Coords) => void): () => void {
  if (isNative()) {
    let watchId: string | null = null;
    let cancelled = false;
    void (async () => {
      const { Geolocation } = await import("@capacitor/geolocation");
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 15_000 },
        (p) => {
          if (!p?.coords) return;
          onChange({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
          });
        },
      );
      // Wurde waehrend des Ladens schon abgebrochen? Dann sofort beenden.
      if (cancelled) void Geolocation.clearWatch({ id });
      else watchId = id;
    })();
    return () => {
      cancelled = true;
      if (watchId)
        void import("@capacitor/geolocation").then(({ Geolocation }) =>
          Geolocation.clearWatch({ id: watchId! }),
        );
    };
  }

  if (!navigator.geolocation) return () => undefined;
  const id = navigator.geolocation.watchPosition(
    (p) =>
      onChange({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
    () => undefined,
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Teilen ueber das System. Gibt zurueck, ob auf die Zwischenablage ausgewichen wurde. */
export async function share(payload: {
  title: string;
  text?: string;
  url: string;
}): Promise<"shared" | "copied"> {
  if (isNative()) {
    const { Share } = await import("@capacitor/share");
    try {
      await Share.share({
        title: payload.title,
        url: payload.url,
        ...(payload.text ? { text: payload.text } : {}),
      });
    } catch {
      // Abbruch ist kein Fehler.
    }
    return "shared";
  }
  if (navigator.share) {
    try {
      await navigator.share(payload);
    } catch {
      // Abbruch ist kein Fehler.
    }
    return "shared";
  }
  await navigator.clipboard.writeText(payload.url);
  return "copied";
}

/**
 * Kurze taktile Rueckmeldung. Im Browser wirkungslos -- deshalb ist sie
 * immer nur Zugabe, nie der einzige Hinweis, dass etwas passiert ist.
 */
export async function tap(strength: "light" | "medium" = "light") {
  if (!isNative()) return;
  const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
  try {
    await Haptics.impact({
      style: strength === "light" ? ImpactStyle.Light : ImpactStyle.Medium,
    });
  } catch {
    // Geraet ohne Vibrationsmotor -- kein Fehler.
  }
}
