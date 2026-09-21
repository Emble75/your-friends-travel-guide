import "./lib/error-capture";

import * as serverEntryModule from "@tanstack/react-start/server-entry";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

/*
 * Bewusst ein statischer Import, kein `await import(...)`.
 *
 * Mit dem dynamischen Import (so kam die Datei aus der Vorlage) legt der
 * Bundler den Server-Eintrag in ein eigenes Stueck und packt die
 * Hilfsfunktionen der Laufzeit mit hinein. Dieses Stueck importiert dann
 * zurueck aus dem Haupt-Stueck -- ein Ring. Laedt Cloudflare zuerst das
 * kleine Stueck, laeuft das Haupt-Stueck los, bevor die Hilfsfunktion
 * existiert: "__exportAll is not a function", und JEDE Seite antwortet mit
 * der Fehlerseite. Lokal (Node) faellt das nicht auf, weil dort gar nicht
 * gebuendelt wird.
 */
function getServerEntry(): ServerEntry {
  return (serverEntryModule.default ?? serverEntryModule) as unknown as ServerEntry;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
