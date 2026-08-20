import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/turi/AppHeader";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [{ title: "Privacy Policy – Turi" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <>
      <AppHeader title="Privacy" />
      <div className="app-shell space-y-4 py-6 text-sm leading-relaxed text-foreground/90">
        <Link to="/auth" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft size={14} /> Back
        </Link>

        <h1 className="text-xl font-bold">Privacy Policy</h1>
        <p className="text-xs text-muted-foreground">
          Placeholder text — please have this reviewed by a qualified professional (e.g. a data
          protection lawyer) before launch. This version is only a starting point.
        </p>

        <h2 className="font-semibold">1. Data controller</h2>
        <p>[Your name / company name], [address], [contact email]</p>

        <h2 className="font-semibold">2. What data we process</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Account data: email address, username, profile picture</li>
          <li>Content: reviews, text, and photos you create</li>
          <li>Location data: place details you share when reviewing or searching for places</li>
          <li>Usage data: which features are used (analytics)</li>
        </ul>

        <h2 className="font-semibold">3. Purpose of processing</h2>
        <p>
          Providing app functionality (account, friends feed, reviews), improving the app,
          preventing abuse.
        </p>

        <h2 className="font-semibold">4. Recipients / service providers</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase (database, authentication, image storage)</li>
          <li>Google (place/map data via the Google Places API)</li>
          <li>[add further service providers, e.g. email delivery, analytics]</li>
        </ul>

        <h2 className="font-semibold">5. Your rights</h2>
        <p>
          You have the right to access, rectify, erase, and restrict the processing of your data, as
          well as the right to data portability. Contact us at [contact email].
        </p>

        <h2 className="font-semibold">6. Retention period</h2>
        <p>
          Your data is stored for as long as your account exists. If you delete your account, your
          data will be deleted within [period], unless legal retention obligations require
          otherwise.
        </p>

        <h2 className="font-semibold">7. Contact</h2>
        <p>Questions about privacy: [contact email]</p>
      </div>
    </>
  );
}
