import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TuriMark } from "@/components/turi/Logo";
import { getErrorMessage } from "@/lib/turi";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "New Password – Turi" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  /*
   * Diese Seite ist die zweite Haelfte der Passwort-Wiederherstellung:
   * Supabase schickt einen Link, der eine Sitzung herstellt, und hier
   * wird das neue Passwort gesetzt. Der Mailversand ist derzeit nicht
   * aktiviert (bewusste Entscheidung wegen der Grenzen des
   * Standardmailers) -- die Seite ist also erreichbar, aber ohne
   * gueltigen Link nicht benutzbar.
   *
   * Ohne Sitzung wuerde updateUser fehlschlagen und der Nutzer stuende
   * vor einem Formular, das nicht funktionieren kann. Deshalb wird der
   * Zustand vorher geprueft und benannt.
   */
  const { data: session, isLoading: checkingSession } = useQuery({
    queryKey: ["recovery-session"],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password changed");
      navigate({ to: "/map" });
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not change password"));
    } finally {
      setLoading(false);
    }
  }

  if (!checkingSession && !session) {
    return (
      <main className="flex min-h-screen flex-col justify-center bg-background">
        <div className="app-shell py-10 text-center">
          <TuriMark className="mx-auto size-16" />
          <h1 className="mt-5 text-xl font-bold">This link is no longer valid</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            Password reset links expire after a short time. Write to{" "}
            <a href="mailto:info.turi.app@gmail.com" className="font-medium text-primary underline">
              info.turi.app@gmail.com
            </a>{" "}
            and we'll help you back in.
          </p>
          <Button
            variant="secondary"
            className="mt-5 rounded-2xl"
            onClick={() => navigate({ to: "/auth" })}
          >
            Back to sign in
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col justify-center bg-background">
      <div className="app-shell py-10">
        <div className="flex flex-col items-center text-center">
          <TuriMark className="size-20 text-[5rem]" />
          <h1 className="mt-5 text-3xl font-bold">New password</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Set a new password for your account.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-4 rounded-3xl border border-border bg-card p-5 shadow-card"
        >
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="h-12 rounded-2xl"
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <Button type="submit" disabled={loading} className="h-12 w-full rounded-2xl text-base">
            {loading ? "One moment…" : "Save password"}
          </Button>
        </form>
      </div>
    </main>
  );
}
