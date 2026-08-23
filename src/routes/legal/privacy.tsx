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
      <div className="app-shell space-y-5 py-6 text-sm leading-relaxed text-foreground/90">
        <Link to="/auth" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft size={14} /> Back
        </Link>

        <div>
          <h1 className="text-xl font-bold">Privacy Policy</h1>
          <p className="mt-1 text-xs text-muted-foreground">Last updated: 23 August 2026</p>
        </div>

        <p className="rounded-2xl bg-secondary p-3 text-xs text-muted-foreground">
          This policy has been drafted to reflect Turi's actual data practices as of the date above
          and current GDPR guidance. It is not a substitute for review by a qualified data
          protection lawyer, and should be reviewed before public launch and whenever the app's data
          practices change (e.g. if analytics, push notifications, or new integrations are added).
        </p>

        <section>
          <h2 className="font-semibold">1. Who we are</h2>
          <p className="mt-1">
            Turi is provided by Comilion Aktiebolag ("Comilion", "we", "us"), a company registered
            in Sweden.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Company: Comilion Aktiebolag</li>
            <li>Registration number (Org.nr): 556965-1465</li>
            <li>Address: Singelbacken 14, 115 21 Stockholm, Sweden</li>
            <li>Contact: info.turi.app@gmail.com</li>
          </ul>
          <p className="mt-2">
            Comilion Aktiebolag is the data controller for the personal data described in this
            policy, within the meaning of the EU General Data Protection Regulation (GDPR) and the
            Swedish Data Protection Act (Lag 2018:218).
          </p>
        </section>

        <section>
          <h2 className="font-semibold">2. What personal data we collect</h2>
          <p className="mt-1 font-medium">Data you provide directly</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Account data: email address, username, display name, password (stored in hashed form
              by our authentication provider — we never see or store your plain-text password)
            </li>
            <li>Profile data: profile photo, bio, whether your account is private</li>
            <li>
              Content you create: place reviews (star rating and text), review photos, saved ("want
              to go") places, trip folders and their names, folder-sharing choices
            </li>
            <li>
              Social graph data: who you follow, who follows you, follow requests, blocks, and
              content of reports you submit
            </li>
            <li>Communications: any message you send us at our contact email</li>
          </ul>
          <p className="mt-2 font-medium">Data collected automatically</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Approximate or precise device location, only when you grant location permission, used
              to center the map and find nearby places. We do not store a history of your location —
              only the coordinates of places you choose to review or save
            </li>
            <li>
              Technical data processed by our hosting and infrastructure providers to operate the
              app and keep it secure (e.g. IP address, device/browser type, request timestamps), as
              part of their standard server logging
            </li>
          </ul>
          <p className="mt-2">
            Turi does not currently use third-party analytics or advertising SDKs. If this changes,
            this policy will be updated before the change takes effect, and consent will be
            requested where required.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">3. Why we process your data, and our legal basis</h2>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-1.5 pr-2 font-semibold">Purpose</th>
                <th className="py-1.5 font-semibold">Legal basis (GDPR Art. 6)</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-border/60">
                <td className="py-1.5 pr-2">
                  Creating and running your account, showing your feed, reviews, follows, and
                  folders
                </td>
                <td className="py-1.5">Performance of a contract (1)(b)</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-1.5 pr-2">
                  Showing nearby places on the map using your device location
                </td>
                <td className="py-1.5">
                  Consent (1)(a) — granted via your device's location permission prompt,
                  withdrawable at any time in your device settings
                </td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-1.5 pr-2">
                  Handling reports, blocks, and enforcing our Terms of Service
                </td>
                <td className="py-1.5">Legitimate interest (1)(f) — keeping the platform safe</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="py-1.5 pr-2">Responding to support requests you send us</td>
                <td className="py-1.5">Legitimate interest (1)(f) / performance of a contract</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-2">
                  Complying with legal obligations (e.g. responding to a lawful authority request)
                </td>
                <td className="py-1.5">Legal obligation (1)(c)</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="font-semibold">4. Who we share your data with</h2>
          <p className="mt-1">
            We do not sell your personal data. We share data only with service providers who process
            it on our behalf (as processors, under data processing agreements), and with other Turi
            users as described below.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Other Turi users:</strong> your username, profile photo, bio, and reviews are
              visible to people you allow to see them (your followers, or anyone if your account is
              public) — this is the core function of the app
            </li>
            <li>
              <strong>Supabase</strong> — hosts our database, authentication, and photo storage
            </li>
            <li>
              <strong>Google</strong> (Google LLC) — provides place, map, and location-search data
              through the Google Places API when you search for or view places
            </li>
            <li>
              <strong>Lovable</strong> — the platform used to build and host parts of the app's
              infrastructure
            </li>
            <li>
              <strong>Cloudflare</strong> — provides hosting and content-delivery infrastructure
            </li>
            <li>
              Apple Inc. and/or Google LLC, as the operators of the App Store / Google Play, process
              data needed to distribute and run the app on your device, under their own privacy
              terms
            </li>
          </ul>
          <p className="mt-2">
            We may also disclose data where required by law, to protect our rights, or to protect
            the safety of users or the public.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">5. International data transfers</h2>
          <p className="mt-1">
            Some of our service providers (including Google) are based outside the European Economic
            Area, primarily in the United States. Where personal data is transferred outside the
            EEA, we rely on legally recognised safeguards, such as the European Commission's
            Standard Contractual Clauses or an applicable adequacy decision, as required by Chapter
            V of the GDPR. You can request more detail on these safeguards by contacting us.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">6. How long we keep your data</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Account and content data: for as long as your account exists</li>
            <li>
              If you delete your account, your profile, reviews, photos, follows, and folders are
              permanently deleted from our active systems. Residual copies may persist briefly in
              backups before being overwritten as part of routine backup rotation
            </li>
            <li>
              Reports you submit, or that are submitted about your account, may be retained for a
              limited period after account deletion where necessary to investigate abuse, resolve
              disputes, or comply with legal obligations
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold">7. Your rights</h2>
          <p className="mt-1">Under the GDPR, you have the right to:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Access the personal data we hold about you</li>
            <li>Rectify inaccurate or incomplete data</li>
            <li>
              Erase your data ("right to be forgotten") — you can also delete your account directly
              in the app, under Profile → Delete account
            </li>
            <li>Restrict or object to certain processing</li>
            <li>Receive your data in a portable, machine-readable format</li>
            <li>
              Withdraw consent at any time, where processing is based on consent (e.g. location
              access, via your device settings)
            </li>
          </ul>
          <p className="mt-2">
            To exercise these rights, contact us at info.turi.app@gmail.com. We will respond within
            one month, as required by Article 12(3) GDPR.
          </p>
          <p className="mt-2">
            You also have the right to lodge a complaint with a supervisory authority. In Sweden,
            this is:
          </p>
          <p className="mt-1">
            Integritetsskyddsmyndigheten (IMY)
            <br />
            Box 8114, 104 20 Stockholm, Sweden
            <br />
            imy@imy.se · www.imy.se
          </p>
          <p className="mt-2">
            If you live in another EU/EEA country, you may also complain to your local data
            protection authority.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">8. Children</h2>
          <p className="mt-1">
            Turi is not directed at children under 16, and we ask that people under 16 do not create
            an account. This is a policy set by us and is stricter than the minimum age for consent
            to online services under Swedish law (13), reflecting that Turi involves sharing photos
            and location with other users. If we become aware that we have collected data from a
            child under 16 without appropriate consent, we will delete it.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">9. Security</h2>
          <p className="mt-1">
            We use technical and organisational measures appropriate to the risk, including
            encryption in transit, access controls, and row-level database permissions that restrict
            what data each user can see. No system is 100% secure, and we cannot guarantee absolute
            security.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">10. Cookies and local storage</h2>
          <p className="mt-1">
            We use only the local storage strictly necessary to keep you signed in and remember your
            preferences. We do not use third-party advertising or tracking cookies.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">11. Changes to this policy</h2>
          <p className="mt-1">
            We may update this policy from time to time. If we make material changes, we will notify
            you in the app before the change takes effect. The "Last updated" date at the top
            reflects the latest revision.
          </p>
        </section>

        <section>
          <h2 className="font-semibold">12. Contact</h2>
          <p className="mt-1">Comilion Aktiebolag · info.turi.app@gmail.com</p>
        </section>
      </div>
    </>
  );
}
