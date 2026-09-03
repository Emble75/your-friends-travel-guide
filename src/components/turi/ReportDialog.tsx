import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/app-client";
import { getErrorMessage } from "@/lib/turi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

const REASONS = [
  { value: "spam", label: "Spam or advertising" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "fake", label: "Fake review" },
  { value: "other", label: "Other" },
];

type ReportDialogProps = {
  /** ID der Bewertung, die gemeldet wird (falls zutreffend). */
  reviewId?: string;
  /** ID des gemeldeten Nutzers (falls zutreffend, z. B. beim Melden eines Profils). */
  reportedUserId?: string;
  /** Eigener Trigger-Button. Wenn null, wird kein Trigger gerendert (Öffnen dann über `open`/`onOpenChange` steuern). */
  trigger?: React.ReactNode | null;
  /** Kontrollierter Open-State, z. B. wenn der Trigger woanders liegt (Dropdown-Menü etc.). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function ReportDialog({
  reviewId,
  reportedUserId,
  trigger,
  open: openProp,
  onOpenChange,
}: ReportDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!reason) {
      toast.error("Please select a reason");
      return;
    }
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const reporterId = auth.user?.id;
      if (!reporterId) throw new Error("Not signed in");

      const { error } = await supabase.from("reports").insert({
        reporter_id: reporterId,
        review_id: reviewId ?? null,
        reported_user_id: reportedUserId ?? null,
        reason,
        details: details.trim() || null,
      });
      if (error) throw error;

      toast.success("Thanks, we'll take a look.");
      setOpen(false);
      setReason("");
      setDetails("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Report failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === null
        ? null
        : (trigger ?? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex turi-hit size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
              aria-label="Report"
            >
              <Flag size={16} />
            </button>
          ))}
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Report content</DialogTitle>
          <DialogDescription>
            Let us know briefly what's going on. Reports are reviewed by us.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="gap-3 py-2">
          {REASONS.map((r) => (
            <div key={r.value} className="flex items-center gap-2">
              <RadioGroupItem value={r.value} id={`reason-${r.value}`} />
              <Label htmlFor={`reason-${r.value}`} className="text-sm font-normal">
                {r.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Optional: more details"
          rows={3}
          className="rounded-2xl"
        />
        <DialogFooter>
          <Button onClick={submit} disabled={submitting} className="w-full rounded-2xl">
            {submitting ? "Sending…" : "Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
