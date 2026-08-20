import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/turi/AppHeader";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [{ title: "Terms of Service – Turi" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <>
      <AppHeader title="Terms of Service" />
      <div className="app-shell space-y-4 py-6 text-sm leading-relaxed text-foreground/90">
        <Link to="/auth" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft size={14} /> Back
        </Link>

        <h1 className="text-xl font-bold">Terms of Service</h1>
        <p className="text-xs text-muted-foreground">
          Placeholder text — please have this reviewed by a qualified professional before launch.
          This version is only a starting point.
        </p>

        <h2 className="font-semibold">1. Scope</h2>
        <p>These terms apply to the use of the Turi app.</p>

        <h2 className="font-semibold">2. Account</h2>
        <p>
          You are responsible for the security of your account. Providing incorrect contact details
          may mean you don't receive important notices (e.g. for resetting your password).
        </p>

        <h2 className="font-semibold">3. Content</h2>
        <p>
          You are responsible for the content you publish (reviews, text, photos). Prohibited
          content includes, in particular: unlawful, offensive, or misleading content, as well as
          spam.
        </p>

        <h2 className="font-semibold">4. Reporting and blocking</h2>
        <p>
          Users can report content. We reserve the right to remove content that is reported or
          violates these terms, and to suspend accounts.
        </p>

        <h2 className="font-semibold">5. Liability</h2>
        <p>
          We assume no liability for the accuracy of user-generated reviews or content from third
          parties (e.g. place data from Google).
        </p>

        <h2 className="font-semibold">6. Contact</h2>
        <p>Questions about these terms: [contact email]</p>
      </div>
    </>
  );
}
