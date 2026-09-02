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
import { getAppUrl, getErrorMessage } from "@/lib/turi";

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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const captchaRequired = Boolean(import.meta.env["VITE_TURNSTILE_SITE_KEY"]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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

          // The username can collide -- the DB then automatically appends a
          // number. Let the user know if that happened.
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", data.user.id)
            .maybeSingle();
          if (profile && profile.username !== typedUsername) {
            toast.info(
              `"${typedUsername}" was already taken — your username is now @${profile.username}`,
            );
          }

          navigate({ to: "/map" });
        } else {
          setSent(true);
        }
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Something went wrong"));
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
          <TuriMark className="size-20 text-[5rem]" />
          <h1 className="mt-5 text-3xl font-bold">Turi</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Review places and only see what your friends think.
          </p>
        </div>

        {resetSent ? (
          <div className="mt-8 rounded-3xl border border-border bg-card p-6 text-center shadow-card">
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
          <div className="mt-8 rounded-3xl border border-border bg-card p-6 text-center shadow-card">
            <h2 className="text-lg font-semibold">Almost there</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We've sent you an email. Confirm your address to get started.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mt-8 space-y-4 rounded-3xl border border-border bg-card p-5 shadow-card"
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
                <p className="text-xs text-muted-foreground">
                  Letters, numbers, dots and underscores.
                </p>
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

        <div className="mt-6 text-center">
          <Link to="/" className="text-xs text-muted-foreground">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
