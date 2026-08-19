import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/turi/AppHeader";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [{ title: "Datenschutzerklärung – Turi" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <>
      <AppHeader title="Datenschutz" />
      <div className="app-shell space-y-4 py-6 text-sm leading-relaxed text-foreground/90">
        <Link to="/auth" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft size={14} /> Zurück
        </Link>

        <h1 className="text-xl font-bold">Datenschutzerklärung</h1>
        <p className="text-xs text-muted-foreground">
          Platzhaltertext – bitte vor dem Launch von einer sachkundigen Person (z. B. Fachanwalt für
          Datenschutz) prüfen lassen. Diese Version dient nur als Ausgangspunkt.
        </p>

        <h2 className="font-semibold">1. Verantwortlicher</h2>
        <p>[Dein Name / Firmenname], [Adresse], [Kontakt-E-Mail]</p>

        <h2 className="font-semibold">2. Welche Daten wir verarbeiten</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Kontodaten: E-Mail-Adresse, Benutzername, Profilbild</li>
          <li>Inhalte: von dir erstellte Bewertungen, Texte, Fotos</li>
          <li>Standortdaten: Ortsangaben, die du beim Bewerten oder bei der Ortssuche teilst</li>
          <li>Nutzungsdaten: welche Funktionen genutzt werden (Analytics)</li>
        </ul>

        <h2 className="font-semibold">3. Zweck der Verarbeitung</h2>
        <p>
          Bereitstellung der App-Funktionen (Konto, Freundes-Feed, Bewertungen), Verbesserung der
          App, Missbrauchsprävention.
        </p>

        <h2 className="font-semibold">4. Empfänger / Dienstleister</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase (Datenbank, Authentifizierung, Speicherung von Bildern)</li>
          <li>Google (Orts-/Kartendaten über die Google Places API)</li>
          <li>[weitere Dienstleister ergänzen, z. B. E-Mail-Versand, Analytics]</li>
        </ul>

        <h2 className="font-semibold">5. Deine Rechte</h2>
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung
          deiner Daten sowie auf Datenübertragbarkeit. Kontaktiere uns dafür unter [Kontakt-E-Mail].
        </p>

        <h2 className="font-semibold">6. Speicherdauer</h2>
        <p>
          Deine Daten werden gespeichert, solange dein Konto besteht. Bei Löschung deines Kontos
          werden deine Daten innerhalb von [Frist] gelöscht, soweit keine gesetzlichen
          Aufbewahrungspflichten entgegenstehen.
        </p>

        <h2 className="font-semibold">7. Kontakt</h2>
        <p>Fragen zum Datenschutz: [Kontakt-E-Mail]</p>
      </div>
    </>
  );
}
