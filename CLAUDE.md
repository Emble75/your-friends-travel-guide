# Turi — Übergabe-Kontext für Claude Code

## Kontext

Du übernimmst die Weiterentwicklung von Turi, einer Social-Travel-App: Nutzer bewerten Orte (Restaurants, Cafés, Bars etc.) mit Sternen, Text und Fotos, sehen aber nur die Bewertungen ihrer Freunde — kein anonymes Bewertungs-Rauschen wie bei Google Maps. Kernfeature ist eine Karte, auf der die Orte deiner Freunde farblich hervorgehoben sind. Positionierung/Slogan: "The map only your friends could draw."

Die App wurde bisher iterativ mit Lovable (KI-gestützter Prototyping-Editor) + Claude in einem Chat-Interface gebaut. Jetzt übernimmst du die Weiterentwicklung direkt im Code. Der Nutzer ist technisch interessiert, aber kein Entwickler — bitte in allen Erklärungen Befehle exakt ausschreiben und wenig voraussetzen.

Betreiber-Unternehmen: Comilion Aktiebolag, Org.nr 556965-1465, Singelbacken 14, 115 21 Stockholm, Schweden. Kontakt: info.turi.app@gmail.com

GitHub-Repo: `https://github.com/Emble75/your-friends-travel-guide`
Aktuelle Lovable-Vorschau-URL: `https://your-friends-travel-guide.lovable.app`

## Tech-Stack

- Frontend/Framework: React 19 + TanStack Start (SSR-Framework, file-based Routing über TanStack Router) + Vite
- Styling: Tailwind CSS v4 + shadcn/ui-Komponenten (`src/components/ui/`), eigenes Design-System in `src/styles.css` (CSS-Variablen in oklch-Farbraum)
- Backend: Supabase (Postgres-Datenbank, Auth, Storage) — eigenes Projekt, nicht mehr Lovables "Lovable Cloud"
- Karten/Orte: Google Places API (New), aber wichtig: der Zugriff läuft über Lovables eigenes Connector-Gateway (`connector-gateway.lovable.dev`), authentifiziert über `LOVABLE_API_KEY` + `GOOGLE_MAPS_API_KEY` als Umgebungsvariablen (siehe `src/lib/maps.server.ts`). Das ist kein direkter Google-Cloud-API-Key-Zugriff — siehe Abschnitt "Auftrag 4" unten, das hat direkte Konsequenzen.
- Native App-Hülle: Capacitor (`@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`), iOS-Projekt liegt bereits unter `ios/`
- Paketmanager: bun (`bun.lock` vorhanden), aber `npm install` funktioniert genauso, da kein bun-spezifisches Feature genutzt wird
- Deployment/Build-Ziel: Der Vite-Build erzeugt über das Nitro-Preset eine Cloudflare-Workers-kompatible Ausgabe (`.output/server/wrangler.json`) — aktuell aber über Lovables eigene Infrastruktur ausgeliefert, nicht eigenständig auf Cloudflare deployed

## Wichtige Kommandos

```
npm install                  # Abhängigkeiten installieren
npm run dev                  # lokaler Dev-Server
npm run build                # Produktions-Build (SSR-Server + statische Assets)
npm run lint                 # ESLint
npx tsc --noEmit              # TypeScript-Check ohne Output
npx cap sync ios             # Capacitor-iOS-Projekt synchronisieren
npx cap open ios             # iOS-Projekt in Xcode öffnen
```

Wichtig für jede Änderung: Nach Code-Änderungen immer `npx tsc --noEmit`, dann `npx eslint --fix <geänderte Dateien>`, dann `npm run build` als Rauchtest ausführen, bevor committed wird. Das Projekt hatte während der gesamten bisherigen Entwicklung eine strikte "erst validieren, dann committen"-Disziplin — bitte beibehalten.

## Architektur-Überblick

```
src/
  routes/
    index.tsx                        # Landing-Page (nicht eingeloggt)
    auth.tsx                         # Login/Registrierung
    reset-password.tsx               # UNGENUTZT (Passwort-Reset läuft aktuell manuell über Mail, siehe unten)
    legal/privacy.tsx, legal/terms.tsx
    __root.tsx                       # Root-Layout, Meta-Tags, Fehlerseite, Navigations-Tracking (siehe nav-history.ts)
    _authenticated/
      route.tsx                      # Auth-Guard + BottomNav-Wrapper für alle eingeloggten Seiten
      map.tsx                        # Herzstück: Karte mit "Discover"/"My Map"-Umschalter
      feed.tsx                       # Feed der Freunde-Bewertungen
      explore.tsx                    # Personensuche, Follow/Unfollow
      me.tsx                         # Eigenes Profil
      new.tsx                        # Bewertung erstellen (auch: neuen Ort manuell anlegen)
      place.$placeId.tsx             # Orts-Detailseite
      u.$username.tsx                # Fremdes Profil
      folder/$folderId.tsx           # Reise-Ordner (Trip Folders) mit Teilen-Funktion
  components/turi/                   # App-eigene Komponenten (AppHeader, BottomNav, ReviewCard, PlacesMiniMap, FollowListSheet, ReportDialog, Logo, UserAvatar, EmptyState, Stars, TurnstileWidget)
  components/ui/                     # shadcn/ui-Basis-Komponenten
  lib/
    turi.ts                          # Helfer: compressImage, getErrorMessage, signedUrl(s), timeAgo, CATEGORIES, getAppUrl()
    maps.server.ts / maps.functions.ts  # Google-Places-Zugriff (Server-Functions)
    place-sync.ts                    # ensureLocalPlace() — synct Google-Place in unsere DB
    mapIcons.ts                      # ratingPinIcon() — generiert Karten-Pin-SVGs mit Bewertung
    nav-history.ts                   # Trackt, ob innerhalb der App navigiert wurde (für robuste Zurück-Buttons)
  integrations/supabase/
    client.ts                        # Browser-Client
    client.server.ts                 # Admin-Client (Service-Role-Key, nur serverseitig)
    app-auth-middleware.ts           # Auth-Middleware für Server-Functions
    types.ts                         # Generierte/handgepflegte DB-Typen
capacitor.config.ts                  # Capacitor-Konfiguration (server.url zeigt aktuell auf Lovable-URL)
ios/                                 # Xcode-Projekt (App-Icon + Splash-Screen bereits final gesetzt)
```

## Datenbank-Schema (Supabase, Postgres)

Tabellen: `profiles`, `follows` (mit `status: pending|accepted`, Trigger `set_follow_status()` setzt automatisch `accepted` bei öffentlichen Konten / `pending` bei privaten), `places`, `reviews` (mit optionalem `trip_folder_id`), `review_images`, `blocks`, `reports`, `poi_cache` (30-Tage-Cache für Google-Places-Ergebnisse), `trip_folders`, `trip_folder_shares`, `saved_places` ("Will ich noch hin"-Wunschliste).

Wichtige SECURITY-DEFINER-Funktionen: `is_visible_author(uuid)` (prüft Blocks + akzeptierte Follows — zentrale Sichtbarkeitslogik für praktisch alle RLS-Policies), `owns_folder`, `is_folder_shared_with_me`, `handle_new_user` (Trigger: erstellt Profil bei neuem Auth-User), `set_follow_status` (siehe oben).

Alle Tabellen haben Row-Level-Security aktiv. Bitte bei jeder neuen Tabelle/Spalte RLS-Policies mitdenken und niemals eine Tabelle ohne RLS anlegen.

Zugriff auf die Supabase-Datenbank: Bitte den Nutzer nach den Zugangsdaten fragen (Projekt-URL, Service-Role-Key), falls du direkten DB-Zugriff brauchst — diese liegen aktuell als Umgebungsvariablen in Lovables Projekt-Einstellungen (`APP_SUPABASE_URL`, `APP_SUPABASE_PUBLISHABLE_KEY`, `APP_SUPABASE_SERVICE_ROLE_KEY`), nicht im Repo. Für reine SQL-Migrationen: Skript schreiben und den Nutzer bitten, es im Supabase SQL Editor auszuführen (er hat dort Zugriff), das hat sich bisher bewährt.

## Bereits gebaute Features (Stand jetzt)

- Auth (E-Mail/Passwort, keine E-Mail-Bestätigung nötig), AGB/Datenschutz-Zustimmung bei Registrierung
- Passwort vergessen: kein automatischer Reset-Mail-Flow — zeigt stattdessen einen Hinweis, eine Mail an info.turi.app@gmail.com zu schicken (bewusste Entscheidung, da Supabase-Standard-Mailer stark limitiert ist)
- Karte: "Discover"-Modus zeigt eigene Pins nur für von Freunden bewertete Orte (orange, mit Ø-Bewertung) und eigene Wunschliste (teal) — direkt aus der eigenen DB berechnet (kein Google-Nearby-Search mehr, siehe unten). Alles andere zeigt Googles eingebaute, kostenlose Kartensymbole (`clickableIcons: true` + Klick-Listener, der einzeln und günstig nur den angeklickten Ort abfragt)
- "My Map"-Modus: eigene bewertete Orte (schwarz) + eigene Wunschliste (teal)
- Kartensuche: unterscheidet Stadt/Region (nur hinzoomen) von konkretem Ort (direkt öffnen bei eindeutigem Treffer, Auswahlliste bei mehreren Treffern)
- Bewertungen: Sterne + Text + bis zu 3 Fotos (client-seitig komprimiert), Bearbeiten (inkl. Fotos hinzufügen/entfernen), Löschen
- Feed (Freunde-Bewertungen, cursor-paginiert)
- Follow-System: 3 Zustände (Folgen/Angefragt/Folgst du), private Konten brauchen Bestätigung, Follower/Following-Listen mit direktem Follow/Unfollow/Entfernen
- Blockieren, Melden (Reviews + Profile)
- Reise-Ordner (Trip Folders): Bewertungen gruppieren, gezielt mit einzelnen Personen teilen, "Send link"-Teilen-Button (nativer Share-Dialog, funktioniert nur für bereits freigegebene Empfänger)
- Konto-Löschung (App-Store-Pflicht 5.1.1(v))
- "Will ich noch hin"-Wunschliste (unabhängig von Bewertungen)

## Bekannter Problembereich: Follow/Unfollow

Der Folgen/Entfolgen-Mechanismus (`src/routes/_authenticated/explore.tsx`, `src/components/turi/FollowListSheet.tsx`) wurde mehrfach nachgebessert, war aber wiederholt fehlerhaft:

1. Neue Follows zu öffentlichen Konten zeigten fälschlich "Requested" statt sofort "Following" — Ursache vermutlich der DB-Trigger `set_follow_status()`, wurde per SQL-Migration korrigiert (Trigger setzt jetzt explizit `accepted`/`pending`)
2. Der Button aktualisierte sich nach Unfollow manchmal nicht, obwohl eine Erfolgsmeldung erschien — client-seitig mit optimistischem UI-Update + `.select()`-Prüfung nach `.delete()` angegangen (um stille RLS-bedingte No-Ops zu erkennen)

Bitte das gesamte Follow/Unfollow/Block/Report-System nochmal von Grund auf gründlich testen und auditieren — inkl. Race Conditions bei schnellem Doppelklick, dem Zusammenspiel zwischen `explore.tsx`, `FollowListSheet.tsx`, `u.$username.tsx` und der `my-network`-Query (React-Query-Caching), sowie den RLS-Policies auf der `follows`-Tabelle. Das ist der Bereich, den der Nutzer explizit als "läuft noch nicht perfekt" markiert hat.

## Design-System

`src/styles.css` — CSS-Variablen in oklch. Aktueller Stand: helles, Instagram-inspiriertes Design (knackiges Weiß/Grau, hoher Schwarz-Weiß-Kontrast), `--primary` ist neutral (dunkles Grau/Schwarz, treibt Buttons/aktive Zustände/Fokus-Ringe an), `--brand` ist eine eigenständige, kräftige Orange-Farbe (`oklch(0.68 0.19 38)`), die bewusst sparsam eingesetzt wird: Logo-Verlauf, eine dünne Header-Akzentlinie, Kartenpins für Freundes-Bewertungen. Schriften: "Outfit" (Display/Überschriften), "Plus Jakarta Sans" (Fließtext).

Design-Historie (wichtig, um Fehler nicht zu wiederholen):

- Ursprünglich warmes Creme + terracotta-Orange → vom Nutzer als "generisches KI-Design-Muster" erkannt und verworfen
- Dann: dunkles Kaffeebraun-Schwarz mit Orange als Hauptfarbe → dem Nutzer zu dunkel
- Dann: Orange als `--primary` für alle Buttons → dem Nutzer zu intensiv/dominant
- Aktueller, vom Nutzer akzeptierter Stand: hell, neutral, Orange nur an gezielten Stellen (siehe oben)

Auftrag vom Nutzer: Design "auf das höchstmögliche Level" bringen. Bitte dabei:

- Die bestehende Markenidentität respektieren (Name "Turi", oranges "T"-Logo, der aktuelle Farbeinsatz von Orange als seltener, gezielter Akzent) — keine erneute Grundfarben-Revolution ohne Rücksprache, das Thema wurde bereits mehrfach hin- und hergewendet
- Stattdessen an Feinheiten arbeiten, die bisher nicht angefasst wurden: konsistente Typografie-Skala mit mehr bewusstem Kontrast zwischen Display- und Fließtext, Mikro-Interaktionen/Übergänge (aktuell praktisch keine Animationen), Ladezustände (Skeletons) durchgängig prüfen, leere Zustände (Empty States) durchgehend prüfen, Bild-/Foto-Darstellung (aktuell recht generisches Grid, evtl. dynamischere Bildkomposition), Abstände/Spacing-Konsistenz zwischen allen Screens
- Vor jeder grundlegenden Farb-/Stil-Änderung Rücksprache mit dem Nutzer halten (per Vorschlag/Screenshot/Beschreibung), da genau das in der bisherigen Entwicklung mehrfach zu Korrekturschleifen geführt hat

## Auftrag 1: App vollständig perfektionieren

Bitte die komplette App noch einmal gründlich durchgehen:

1. Follow/Unfollow-System auditieren und robust reparieren (siehe oben)
2. Jeden Screen auf Ladezustände, Fehlerzustände, leere Zustände prüfen
3. Alle Formulare auf Validierung/Fehlermeldungen prüfen
4. Performance: unnötige Re-Fetches, fehlende Caching-Strategien, große Bundle-Anteile
5. Bekannte, noch nicht behobene Einschränkungen (kein Muss, aber gut zu wissen): Follower-/Following-Listen und die eigene Bewertungsliste haben noch keine Paginierung (wird erst bei sehr vielen Einträgen relevant); es gibt noch keinen Admin-Bereich, um gemeldete Inhalte (`reports`-Tabelle) einzusehen — aktuell nur über das Supabase-Dashboard direkt einsehbar

## Auftrag 2: Design auf höchstmögliches Niveau

Siehe Design-System-Abschnitt oben.

## Auftrag 3: Unterstützung beim App-Store-Launch

Aktueller Stand:

- Capacitor-iOS-Projekt ist eingerichtet (`ios/`-Ordner vorhanden), App-Icon und Splash-Screen sind bereits final gesetzt (nicht mehr die Capacitor-Platzhalter)
- Info.plist enthält bereits Berechtigungs-Texte für Kamera, Fotobibliothek, Standort
- Bundle-ID: `com.turi.app`, App-Name: "Turi"
- Der Nutzer hat einen Mac und testet dort über Xcode (Simulator, später eigenes Gerät)
- Noch offen: Apple Developer Account (99$/Jahr) — Stand unklar, bitte nachfragen; App-Store-Connect-Listing (Screenshots, Beschreibung, Kategorien); App Privacy "Nutrition Label" in App Store Connect (muss zur bereits geschriebenen Datenschutzerklärung passen, siehe `src/routes/legal/privacy.tsx`); TestFlight-Einrichtung; finale Produktions-Domain für `capacitor.config.ts` `server.url` (aktuell noch die Lovable-Vorschau-URL) und für `getAppUrl()` in `src/lib/turi.ts` (nutzt `VITE_APP_URL`/`APP_URL`-Umgebungsvariable mit Fallback auf `window.location.origin`)

Bitte den Nutzer Schritt für Schritt durch den kompletten Rest des Prozesses führen, dabei berücksichtigen, dass er kein Entwickler ist.

## Auftrag 4: Lovable-Badge entfernen, OHNE den Lovable-Zahlplan zu holen

Hintergrund: Die App läuft aktuell über Lovables gehostete Vorschau-URL (`*.lovable.app`). Lovable blendet dort serverseitig ein "Edit with Lovable"-Badge ein — das ist nicht Teil des Repo-Codes, sondern wird von Lovables eigener Ausliefer-Infrastruktur injiziert. Es lässt sich nur entfernen, indem entweder (a) der kostenpflichtige Lovable-Plan gebucht wird (will der Nutzer explizit nicht), oder (b) die App komplett unabhängig von Lovables Hosting selbst ausgeliefert wird.

Kritischer technischer Stolperstein, den du unbedingt vorher lösen musst: Die Google-Places-Integration (`src/lib/maps.server.ts`) läuft nicht über einen direkten Google-Cloud-API-Key, sondern über Lovables eigenes Connector-Gateway (`connector-gateway.lovable.dev`), authentifiziert mit einem `LOVABLE_API_KEY` + `GOOGLE_MAPS_API_KEY`. Es ist unklar, ob dieses Gateway auch funktioniert, wenn die App nicht mehr über Lovables Hosting läuft. Bitte das als Erstes klären/testen, bevor du mit dem Self-Hosting anfängst. Zwei mögliche Wege:

1. Prüfen, ob das Lovable-Gateway auch von einem extern gehosteten Server aus erreichbar/nutzbar ist (wahrscheinlich ja, da es nur eine HTTP-Schnittstelle ist — aber die Zugangsdaten könnten an das Lovable-Projekt gebunden sein, das gehört geklärt)
2. Falls nicht: `maps.server.ts` auf einen direkten Google-Maps-Platform-API-Key umstellen (der Nutzer müsste dafür ein eigenes Google-Cloud-Projekt mit Places-API-Aktivierung einrichten — das kostet grundsätzlich auch etwas, aber unabhängig von Lovable)

Sobald das geklärt ist, ist der Rest technisch bereits vorbereitet: Der Vite-Build erzeugt bereits eine Cloudflare-Workers-kompatible Ausgabe. Empfohlener Weg: Cloudflare Workers (kostenloser Tarif reicht für den Start), da dort ohnehin schon eine passende Konfiguration generiert wird. Schritte grob:

1. Cloudflare-Account einrichten (falls nicht vorhanden), `wrangler` CLI nutzen
2. Alle benötigten Umgebungsvariablen (Supabase-URL/Keys, Google-Maps-Keys) als Cloudflare-Workers-Secrets hinterlegen
3. `npm run build` + `npx wrangler deploy` (oder das generierte `wrangler.json` entsprechend anpassen)
4. Eigene Domain (falls vorhanden) oder die von Cloudflare vergebene `*.workers.dev`-Domain verbinden
5. `capacitor.config.ts` `server.url` und die `VITE_APP_URL`-Umgebungsvariable auf die neue, eigene Domain umstellen
6. Supabase-Auth-Redirect-URLs im Supabase-Dashboard entsprechend aktualisieren

Wichtig: Der Nutzer bearbeitet die App parallel weiterhin über Lovables Chat-Prompts für inhaltliche Änderungen. Bitte am Ende klar kommunizieren, wie der Workflow danach aussieht (z. B. weiterhin über Lovable entwickeln + Code pushen lassen, dann selbst deployen — oder komplett auf direkte Code-Entwicklung mit dir umsteigen). Das ist eine Grundsatzentscheidung, die der Nutzer treffen sollte, bitte ihm die Optionen klar gegenüberstellen statt einseitig zu entscheiden.

## Allgemeine Arbeitsweise, die sich bisher bewährt hat

- Vor jeder Antwort/jedem Batch an Änderungen: `git pull`, um sicherzustellen, dass der neueste Stand vorliegt (der Nutzer arbeitet parallel z. T. noch über Lovable-Prompts, die den Code ändern können)
- Nach jeder Änderung: TypeScript-Check, Lint-Fix, Produktions-Build als Rauchtest, dann erst committen
- Committen mit ausführlichen, gut strukturierten Commit-Messages (Ursache, Lösung, Auswirkung) — hat sich für die Nachvollziehbarkeit bewährt
- Bei DB-Änderungen: SQL-Skript schreiben, dem Nutzer zum Ausführen im Supabase SQL Editor geben (kein direkter DB-Zugriff vom Code-Editor aus)
- Bei größeren Design-/Produktentscheidungen: Optionen vorschlagen und den Nutzer entscheiden lassen, nicht einseitig durchziehen — das hat sich in der bisherigen Zusammenarbeit als der Punkt erwiesen, an dem es sonst zu Korrekturschleifen kam
