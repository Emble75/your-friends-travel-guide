import { useEffect, useState } from "react";

declare global {
  interface Window {
    __turiMapsReady?: () => void;
  }
}

/// <reference types="google.maps" />

let loadPromise: Promise<void> | null = null;

function loadMaps() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return;
    if (window.google?.maps) return resolve();
    /*
     * Eigener Schluessel zuerst, Lovables Connector-Schluessel nur als
     * Rueckfall. So laesst sich auf den eigenen Google-Cloud-Zugang
     * umstellen, ohne dass zwischendurch die Karte ausfaellt: erst
     * VITE_GOOGLE_MAPS_BROWSER_KEY in .env eintragen, bauen, fertig.
     *
     * Die Kanal-Kennung ist Lovables Abrechnungs-Merkmal und gehoert
     * deshalb nur an Lovables Schluessel.
     */
    const ownKey = import.meta.env["VITE_GOOGLE_MAPS_BROWSER_KEY"];
    const key = ownKey || import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
    const channel = ownKey
      ? undefined
      : import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"];
    if (!key) return reject(new Error("Missing maps API key"));
    window.__turiMapsReady = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__turiMapsReady&language=de${
      channel ? `&channel=${channel}` : ""
    }`;
    script.async = true;
    script.onerror = () => reject(new Error("Karte konnte nicht geladen werden"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export function useGoogleMaps() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadMaps()
      .then(() => active && setReady(true))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);

  return { ready, error };
}
