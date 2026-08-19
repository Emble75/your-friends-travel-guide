import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/turi/AppHeader";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [{ title: "Nutzungsbedingungen – Turi" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <>
      <AppHeader title="Nutzungsbedingungen" />
      <div className="app-shell space-y-4 py-6 text-sm leading-relaxed text-foreground/90">
        <Link to="/auth" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft size={14} /> Zurück
        </Link>

        <h1 className="text-xl font-bold">Nutzungsbedingungen</h1>
        <p className="text-xs text-muted-foreground">
          Platzhaltertext – bitte vor dem Launch von einer sachkundigen Person prüfen lassen. Diese
          Version dient nur als Ausgangspunkt.
        </p>

        <h2 className="font-semibold">1. Geltungsbereich</h2>
        <p>Diese Bedingungen gelten für die Nutzung der App Turi.</p>

        <h2 className="font-semibold">2. Konto</h2>
        <p>
          Du bist für die Sicherheit deines Kontos verantwortlich. Die Angabe falscher Kontaktdaten
          kann dazu führen, dass du wichtige Mitteilungen (z. B. zum Zurücksetzen deines Passworts)
          nicht erhältst.
        </p>

        <h2 className="font-semibold">3. Inhalte</h2>
        <p>
          Du bist für die Inhalte verantwortlich, die du veröffentlichst (Bewertungen, Texte,
          Fotos). Unzulässig sind insbesondere: rechtswidrige, beleidigende, belästigende oder
          irreführende Inhalte sowie Spam.
        </p>

        <h2 className="font-semibold">4. Melde- und Sperrfunktion</h2>
        <p>
          Nutzer können Inhalte melden. Wir behalten uns vor, gemeldete oder gegen diese Bedingungen
          verstoßende Inhalte zu entfernen und Konten zu sperren.
        </p>

        <h2 className="font-semibold">5. Haftung</h2>
        <p>
          Wir übernehmen keine Haftung für die Richtigkeit nutzergenerierter Bewertungen oder
          Inhalte Dritter (z. B. Ortsdaten von Google).
        </p>

        <h2 className="font-semibold">6. Kontakt</h2>
        <p>Fragen zu diesen Bedingungen: [Kontakt-E-Mail]</p>
      </div>
    </>
  );
}
