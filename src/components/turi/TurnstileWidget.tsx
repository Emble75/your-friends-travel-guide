import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/**
 * Cloudflare Turnstile Bot-Schutz. Ohne gesetzten Site-Key rendert die
 * Komponente nichts und liefert keinen Token — die Auth-Seite behandelt das
 * dann so, als wäre kein Bot-Schutz konfiguriert (z. B. für lokale Entwicklung).
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const siteKey = import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined;

  useEffect(() => {
    if (!siteKey) return;
    if (window.turnstile) {
      setReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => setReady(true);
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [siteKey]);

  useEffect(() => {
    if (!ready || !siteKey || !ref.current || !window.turnstile) return;
    window.turnstile.render(ref.current, {
      sitekey: siteKey,
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(null),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} className="flex justify-center" />;
}
