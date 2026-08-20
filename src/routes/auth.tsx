import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TuriMark } from "@/components/turi/Logo";
import { TurnstileWidget } from "@/components/turi/TurnstileWidget";
import { getErrorMessage } from "@/lib/turi";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Anmelden bei Turi" },
      { name: "description", content: "Melde dich an und sieh die Reisetipps deiner Freunde." },
      { property: "og:title", content: "Anmelden bei Turi" },
      {
        property: "og:description",
        content: "Melde dich an und sieh die Reisetipps deiner Freunde.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const captchaRequired = Boolean(import.meta.env["VITE_TURNSTILE_SITE_KEY"]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && !acceptedTerms) {
      toast.error("Bitte den Nutzungsbedingungen und der Datenschutzerklärung zustimmen");
      return;
    }
    if (captchaRequired && !captchaToken) {
      toast.error("Bitte den Sicherheitscheck oben ausfüllen");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword(
          captchaToken ? { email, password, options: { captchaToken } } : { email, password },
        );
        if (error) throw error;
        navigate({ to: "/map" });
      } else {
        const typedUsername = username.trim().toLowerCase();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: typedUsername, display_name: username.trim() },
            ...(captchaToken ? { captchaToken } : {}),
          },
        });
        if (error) throw error;

        if (data.session && data.user) {
          // Zustimmung protokollieren, jetzt wo wir eine authentifizierte Session haben.
          await supabase
            .from("profiles")
            .update({ accepted_terms_at: new Date().toISOString() })
            .eq("id", data.user.id);

          // Der Benutzername kann kollidieren — die DB haengt dann automatisch eine
          // Zahl an. Nutzer informieren, falls das passiert ist.
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", data.user.id)
            .maybeSingle();
          if (profile && profile.username !== typedUsername) {
            toast.info(
              `"${typedUsername}" war schon vergeben — dein Benutzername ist jetzt @${profile.username}`,
            );
          }

          navigate({ to: "/map" });
        } else {
          setSent(true);
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Etwas ist schiefgelaufen"));
    } finally {
      setLoading(false);
    }
  }

  async function onForgotPassword() {
    if (!email.trim()) {
      toast.error("Bitte zuerst deine E-Mail eintragen");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      toast.error(getErrorMessage(err, "Etwas ist schiefgelaufen"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col justify-center bg-background">
      <div className="app-shell py-10">
        <div className="flex flex-col items-center text-center">
          <TuriMark className="size-20 text-[5rem]" />
          <h1 className="mt-5 text-3xl font-bold">Turi</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Orte bewerten und nur die Meinungen deiner Freunde sehen.
          </p>
        </div>

        {resetSent ? (
          <div className="mt-8 rounded-3xl border border-border bg-card p-6 text-center shadow-card">
            <h2 className="text-lg font-semibold">E-Mail unterwegs</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Falls ein Konto mit dieser Adresse existiert, haben wir dir einen Link zum
              Zurücksetzen deines Passworts geschickt.
            </p>
            <Button
              variant="secondary"
              className="mt-4 rounded-2xl"
              onClick={() => setResetSent(false)}
            >
              Zurück zur Anmeldung
            </Button>
          </div>
        ) : sent ? (
          <div className="mt-8 rounded-3xl border border-border bg-card p-6 text-center shadow-card">
            <h2 className="text-lg font-semibold">Fast geschafft</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Wir haben dir eine E-Mail geschickt. Bestätige deine Adresse, um loszulegen.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mt-8 space-y-4 rounded-3xl border border-border bg-card p-5 shadow-card"
          >
            {mode === "signup" ? (
              <div className="space-y-1.5">
                <Label htmlFor="username">Benutzername</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="reisemaus"
                  required
                  minLength={3}
                  className="h-12 rounded-2xl"
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="du@beispiel.de"
                required
                className="h-12 rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="h-12 rounded-2xl"
              />
              {mode === "signup" ? (
                <p className="text-xs text-muted-foreground">Mindestens 8 Zeichen.</p>
              ) : (
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-xs font-medium text-primary"
                >
                  Passwort vergessen?
                </button>
              )}
            </div>
            {mode === "signup" ? (
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={acceptedTerms}
                  onCheckedChange={(v) => setAcceptedTerms(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Ich stimme den{" "}
                  <Link
                    to="/legal/terms"
                    target="_blank"
                    className="font-medium text-primary underline"
                  >
                    Nutzungsbedingungen
                  </Link>{" "}
                  und der{" "}
                  <Link
                    to="/legal/privacy"
                    target="_blank"
                    className="font-medium text-primary underline"
                  >
                    Datenschutzerklärung
                  </Link>{" "}
                  zu.
                </span>
              </label>
            ) : null}
            <TurnstileWidget onToken={setCaptchaToken} />
            <Button type="submit" disabled={loading} className="h-12 w-full rounded-2xl text-base">
              {loading ? "Moment…" : mode === "login" ? "Anmelden" : "Konto erstellen"}
            </Button>
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="w-full text-center text-sm text-muted-foreground"
            >
              {mode === "login" ? (
                <>
                  Noch kein Konto? <span className="font-semibold text-primary">Registrieren</span>
                </>
              ) : (
                <>
                  Schon dabei? <span className="font-semibold text-primary">Anmelden</span>
                </>
              )}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/" className="text-xs text-muted-foreground">
            Zurück zur Startseite
          </Link>
        </div>
      </div>
    </main>
  );
}
