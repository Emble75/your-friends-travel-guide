import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
