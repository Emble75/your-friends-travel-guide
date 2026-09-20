import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TuriMark } from "@/components/turi/Logo";
import { TurnstileWidget } from "@/components/turi/TurnstileWidget";
import { getAppUrl, getErrorMessage } from "@/lib/turi";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in to Turi" },
      { name: "description", content: "Sign in and see your friends' travel tips." },
      { property: "og:title", content: "Sign in to Turi" },
      {
        property: "og:description",
        content: "Sign in and see your friends' travel tips.",
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
  /*
   * Ist der Wunschname noch frei?
   *
   * Frueher entschied das die Datenbank still fuer einen: Bei Kollision
   * haengte sie eine Zahl an, und man erfuhr hinterher, dass man jetzt
   * "tom1" heisst. Der Name steht im Profil, in geteilten Links und in
   * der Personensuche -- das ist nichts, was jemand anders entscheiden
   * darf. Jetzt wird beim Tippen geprueft und beim Absenden abgelehnt.
   */
  const [nameState, setNameState] = useState<"idle" | "checking" | "free" | "taken">("idle");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const captchaRequired = Boolean(import.meta.env["VITE_TURNSTILE_SITE_KEY"]);

  /*
   * Wer bereits angemeldet ist, hat hier nichts zu suchen.
   *
   * Frueher konnte man auf dieser Seite landen, obwohl die Sitzung
   * stand -- etwa ueber einen alten Verweis oder ein Lesezeichen. Man
   * sah dann ein Anmeldeformular und hielt sich fuer ausgeloggt,
   * obwohl nichts verloren war. Die Weiterleitung ersetzt den Eintrag
   * in der Historie (replace), damit der Zurueck-Knopf nicht gleich
   * wieder hierher fuehrt.
   */
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/map", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  /*
   * Eigene Pruefung statt der eingebauten Browser-Meldung.
   *
   * Das Formular traegt weiterhin required/minLength/pattern -- die
   * braucht es fuer Screenreader und die automatische Ausfuellhilfe. Nur
   * die Sprechblase des Browsers ist abgeschaltet (noValidate): sie folgt
   * dem Systemstil samt orangem Warnsymbol und laesst sich nicht
   * umfaerben, faellt in der dunklen Oberflaeche also aus dem Rahmen.
   *
   * Nebenbei ist die eigene Meldung praeziser: der Browser nennt nur
   * "Feld ausfuellen", hier steht, welches und warum.
   */
  function firstProblem(): string | null {
    if (mode === "signup") {
      const name = username.trim();
      if (!name) return "Please choose a username";
      if (!/^[A-Za-z0-9._]{3,30}$/.test(name))
        return "Username: 3–30 characters, letters, numbers, dots and underscores";
    }
    if (!email.trim()) return "Please enter your email address";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "That email address doesn't look right";
    if (!password) return "Please enter your password";
    if (mode === "signup" && password.length < 8)
      return "Your password needs at least 8 characters";
    return null;
  }

  const debouncedUsername = useDebouncedValue(username, 400);

  useEffect(() => {
    const name = debouncedUsername.trim().toLowerCase();
    if (mode !== "signup" || !/^[a-z0-9._]{3,30}$/.test(name)) {
      setNameState("idle");
      return;
    }
    let active = true;
    setNameState("checking");
    void supabase.rpc("username_available", { name }).then(({ data, error }) => {
      if (!active) return;
      // Faellt die Pruefung aus, NICHT blockieren: Der Trigger lehnt
      // einen vergebenen Namen ohnehin ab. Ein Formular, das wegen
      // einer wackligen Leitung nicht abschickbar ist, waere schlimmer
      // als eine spaete Fehlermeldung.
      setNameState(error ? "idle" : data ? "free" : "taken");
    });
    return () => {
      active = false;
    };
  }, [debouncedUsername, mode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = firstProblem();
    if (problem) {
      toast.error(problem);
      return;
    }
    if (mode === "signup" && nameState === "taken") {
      toast.error(`@${username.trim().toLowerCase()} is already taken — please pick another`);
      return;
    }
    if (mode === "signup" && !acceptedTerms) {
      toast.error("Please agree to the Terms of Service and Privacy Policy");
      return;
    }
    if (captchaRequired && !captchaToken) {
      toast.error("Please complete the security check above");
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
            emailRedirectTo: getAppUrl(),
            data: { username: typedUsername, display_name: username.trim() },
            ...(captchaToken ? { captchaToken } : {}),
          },
        });
        if (error) throw error;

        if (data.session && data.user) {
          // Record consent now that we have an authenticated session.
          await supabase
            .from("profiles")
            .update({ accepted_terms_at: new Date().toISOString() })
            .eq("id", data.user.id);

          // Die frueher hier stehende Meldung "dein Name ist jetzt
          // @tom1" ist entfallen: Die Datenbank benennt nicht mehr um,
          // sie lehnt ab (siehe Migration 20260922090000).
          navigate({ to: "/map" });
        } else {
          setSent(true);
        }
      }
    } catch (err) {
      /*
       * Der Trigger lehnt einen vergebenen Namen mit einer Ausnahme ab;
       * beim Anmeldedienst kommt das als unspezifischer Datenbankfehler
       * an ("Database error saving new user"). Ohne diese Uebersetzung
       * stuende dort eine Meldung, mit der niemand etwas anfangen kann --
       * dabei ist die Ursache bekannt und leicht zu beheben.
       *
       * Dieser Weg greift nur, wenn die Pruefung beim Tippen nicht
       * gegriffen hat: bei zwei Anmeldungen in derselben Sekunde, oder
       * wenn die Pruefung wegen einer wackligen Leitung ausfiel.
       */
      const message = getErrorMessage(err, "Something went wrong");
      if (mode === "signup" && /database error|username_taken|duplicate/i.test(message)) {
        setNameState("taken");
        toast.error(`@${username.trim().toLowerCase()} is already taken — please pick another`);
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }

  function onForgotPassword() {
    setResetSent(true);
  }

  return (
    <main className="flex min-h-screen flex-col justify-center bg-background">
      <div className="app-shell py-10">
        <div className="flex flex-col items-center text-center">
          <TuriMark className="size-20" />
          <h1 className="mt-5 text-3xl font-bold">Turi</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Review places and only see what your friends think.
          </p>
        </div>

        {resetSent ? (
          <div className="mt-8 turi-card p-5 text-center">
            <h2 className="text-lg font-semibold">Forgot your password?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Please send an email to{" "}
              <a
                href="mailto:info.turi.app@gmail.com"
                className="font-medium text-primary underline"
              >
                info.turi.app@gmail.com
              </a>{" "}
              — we'll take care of it as soon as possible.
            </p>
            <Button
              variant="secondary"
              className="mt-4 rounded-2xl"
              onClick={() => setResetSent(false)}
            >
              Back to sign in
            </Button>
          </div>
        ) : sent ? (
          <div className="mt-8 turi-card p-5 text-center">
            <h2 className="text-lg font-semibold">Almost there</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We've sent you an email. Confirm your address to get started.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            // Die Attribute an den Feldern bleiben (Screenreader,
            // Ausfuellhilfe) -- nur die Browser-Sprechblase ist aus,
            // siehe firstProblem() oben.
            noValidate
            className="mt-8 space-y-4 turi-card p-5"
          >
            {mode === "signup" ? (
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="travelbug"
                  required
                  minLength={3}
                  maxLength={30}
                  // Der Nutzername landet in der Profil-URL (/u/name).
                  // Leer- und Sonderzeichen wuerden diese Links zerbrechen.
                  pattern="[A-Za-z0-9._]{3,30}"
                  title="3–30 characters: letters, numbers, dots and underscores."
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="h-12 rounded-2xl"
                />
                {/*
                  Die Rueckmeldung steht an der Stelle der Regel-Zeile,
                  nicht zusaetzlich darunter: Sie beantwortet dieselbe
                  Frage ("ist mein Name in Ordnung?") und waere als
                  zweite Zeile nur Gedraenge.
                */}
                {nameState === "taken" ? (
                  <p className="text-xs font-medium text-destructive">
                    @{username.trim().toLowerCase()} is already taken — please pick another.
                  </p>
                ) : nameState === "free" ? (
                  <p className="text-xs font-medium text-positive">
                    @{username.trim().toLowerCase()} is available.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {nameState === "checking"
                      ? "Checking…"
                      : "Letters, numbers, dots and underscores."}
                  </p>
                )}
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                className="h-12 rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="h-12 rounded-2xl"
              />
              {mode === "signup" ? (
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              ) : (
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-xs font-medium text-primary"
                >
                  Forgot password?
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
                  I agree to the{" "}
                  <Link
                    to="/legal/terms"
                    target="_blank"
                    className="font-medium text-primary underline"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    to="/legal/privacy"
                    target="_blank"
                    className="font-medium text-primary underline"
                  >
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
            ) : null}
            <TurnstileWidget onToken={setCaptchaToken} />
            <Button type="submit" disabled={loading} className="h-12 w-full rounded-2xl text-base">
              {loading ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="w-full text-center text-sm text-muted-foreground"
            >
              {mode === "login" ? (
                <>
                  No account yet? <span className="font-semibold text-primary">Sign up</span>
                </>
              ) : (
                <>
                  Already have one? <span className="font-semibold text-primary">Sign in</span>
                </>
              )}
            </button>
          </form>
        )}

        {/*
          "Back to home" entfernt: Die Startseite ist keine Seite mehr,
          sondern nur noch eine Weiche. Wer nicht angemeldet ist, landete
          darueber sofort wieder genau hier -- ein Knopf, der nichts tut.
        */}
      </div>
    </main>
  );
}
