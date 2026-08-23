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
      <div className="app-shell space-y-5 py-6 text-sm leading-relaxed text-foreground/90">
        <Link to="/auth" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft size={14} /> Back
        </Link>

        <div>
          <h1 className="text-xl font-bold">Terms of Service</h1>
          <p className="mt-1 text-xs text-muted-foreground">Last updated: 23 August 2026</p>
        </div>

        <p className="rounded-2xl bg-secondary p-3 text-xs text-muted-foreground">
          These terms have been drafted to reflect how Turi currently works. They are a solid
          starting point, not a substitute for review by a qualified lawyer before public launch.
        </p>

        <section>
          <h2 className="font-semibold">1. Who these terms are with</h2>
          <p className="mt-1">
            Turi is operated by Comilion Aktiebolag (Org.nr 556965-1465), Singelbacken 14, 115 21
            Stockholm, Sweden ("Comilion", "we", "us"). By creating an account or using Turi, you
            agree to these Terms of Service and our{" "}
            <Link to="/legal/privacy" className="text-primary underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-semibold">2. Eligibility</h2>
          <p className="mt-1">
            You must be at least 16 years old to create a Turi account. By creating an account, you
            confirm that you meet this requirement and that the information you provide is accurate.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">3. Your account</h2>
          <p className="mt-1">
            You are responsible for keeping your password confidential and for all activity under
            your account. Let us know immediately at info.turi.app@gmail.com if you suspect
            unauthorized use of your account.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">4. Content you post</h2>
          <p className="mt-1">
            You keep ownership of the reviews, text, and photos you post ("your content"). By
            posting, you grant Comilion a non-exclusive, worldwide licence to host, store, and
            display your content within the app, solely to operate and provide the service to you
            and the people you share it with.
          </p>
          <p className="mt-2">You agree not to post content that:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Is unlawful, harassing, hateful, or intended to abuse another person</li>
            <li>Is fraudulent or misleading (e.g. a review of a place you never visited)</li>
            <li>Infringes someone else's intellectual property or privacy</li>
            <li>Is spam or unsolicited advertising</li>
          </ul>
          <p className="mt-2">
            We may remove content or suspend accounts that violate these terms, including in
            response to reports from other users.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">5. Reporting, blocking, and moderation</h2>
          <p className="mt-1">
            Users can report reviews and profiles, and can block other users. We review reports and
            may act on them, including removing content or restricting accounts, at our reasonable
            discretion.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">6. Location and third-party map data</h2>
          <p className="mt-1">
            Turi uses the Google Places API to show places and map data. Your use of this map
            functionality is also subject to Google's own terms. Place information (names,
            categories, locations) is provided by Google and third parties, and we do not guarantee
            its accuracy.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">7. Account deletion</h2>
          <p className="mt-1">
            You can delete your account at any time in the app, under Profile → Delete account. This
            permanently removes your reviews, photos, follows, and folders, as described in our{" "}
            <Link to="/legal/privacy" className="text-primary underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-semibold">8. Disclaimer and limitation of liability</h2>
          <p className="mt-1">
            Turi is provided "as is". We do not guarantee that the app will be uninterrupted or
            error-free, or that reviews and place data are accurate or complete. To the maximum
            extent permitted by applicable law, Comilion Aktiebolag is not liable for indirect,
            incidental, or consequential damages arising from your use of the app. Nothing in these
            terms limits liability that cannot be limited under Swedish or EU law, including
            liability for gross negligence or wilful misconduct.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">9. Changes to the app or these terms</h2>
          <p className="mt-1">
            We may update these terms from time to time. If we make material changes, we will notify
            you in the app before the change takes effect.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">10. Governing law</h2>
          <p className="mt-1">
            These terms are governed by the laws of Sweden, without regard to its conflict-of-law
            principles. This does not deprive you of any mandatory consumer-protection rights you
            have under the law of the country where you live.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">11. Contact</h2>
          <p className="mt-1">Comilion Aktiebolag · info.turi.app@gmail.com</p>
        </section>
      </div>
    </>
  );
}
